import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/database';

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  roles: string[];
  permissions: string[];
  isLoading: boolean;
  hasPermission: (permissionCode: string) => boolean;
  signIn: (email: string, password?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadUserRolesAndPermissions = async (profileId: number) => {
    try {
      // 1. Obtener roles asignados
      const { data: userRolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_id, roles(code, name)')
        .eq('user_id', profileId);

      if (rolesError) throw rolesError;

      const roleCodes = (userRolesData || []).map((ur: any) => ur.roles?.code).filter(Boolean);
      setRoles(roleCodes.length > 0 ? roleCodes : ['OPERADOR']);

      // 2. Obtener permisos de esos roles
      const roleIds = (userRolesData || []).map((ur: any) => ur.role_id);
      if (roleIds.length > 0) {
        const { data: rolePermsData, error: permsError } = await supabase
          .from('role_permissions')
          .select('permissions(code)')
          .in('role_id', roleIds);

        if (permsError) throw permsError;

        const permCodes = (rolePermsData || []).map((rp: any) => rp.permissions?.code).filter(Boolean);
        setPermissions(Array.from(new Set(permCodes)));
      } else {
        setPermissions([]);
      }
    } catch (err) {
      console.error('Error loading permissions:', err);
      setPermissions([]);
    }
  };

  const loadProfileByAuthUid = async (authUserId: string): Promise<boolean> => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', authUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (profileError) {
        console.error('Error querying profile:', profileError);
        return false;
      }

      if (!profileData) {
        console.warn('No active profile found for auth_user_id:', authUserId);
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        return false;
      }

      setProfile(profileData);
      await loadUserRolesAndPermissions(profileData.id);
      return true;
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session?.user && isMounted) {
          setUser(session.user);
          const hasProfile = await loadProfileByAuthUid(session.user.id);
          if (!hasProfile && isMounted) {
            // Usuario sin perfil activo -> cerrar sesión
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
          }
        } else if (isMounted) {
          setUser(null);
          setProfile(null);
          setRoles([]);
          setPermissions([]);
        }
      } catch (e) {
        console.error('Error initializing auth session:', e);
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;

      if (session?.user) {
        setUser(session.user);
        const hasProfile = await loadProfileByAuthUid(session.user.id);
        if (!hasProfile && isMounted) {
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
        setRoles([]);
        setPermissions([]);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPermission = useCallback(
    (permissionCode: string): boolean => {
      if (roles.includes('ADMIN')) return true;
      return permissions.includes(permissionCode);
    },
    [roles, permissions]
  );

  const signIn = async (email: string, password?: string): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password || '',
      });

      if (error) {
        setIsLoading(false);
        return { error: error.message || 'Credenciales inválidas' };
      }

      if (!data?.user) {
        setIsLoading(false);
        return { error: 'No se pudo obtener el usuario' };
      }

      setUser(data.user);
      const hasProfile = await loadProfileByAuthUid(data.user.id);
      if (!hasProfile) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return { error: 'Usuario autenticado pero sin perfil comercial activo asignado.' };
      }

      setIsLoading(false);
      return {};
    } catch (err: any) {
      setIsLoading(false);
      return { error: err.message || 'Error al iniciar sesión' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('SignOut error:', e);
    }
    setUser(null);
    setProfile(null);
    setRoles([]);
    setPermissions([]);
  };

  const refreshAuth = async () => {
    if (user?.id) {
      await loadProfileByAuthUid(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roles,
        permissions,
        isLoading,
        hasPermission,
        signIn,
        signOut,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
