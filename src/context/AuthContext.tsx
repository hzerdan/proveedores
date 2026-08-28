import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/database';

export interface AvailableProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role_code: string;
}

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  roles: string[];
  permissions: string[];
  availableProfiles: AvailableProfile[];
  isLoading: boolean;
  hasPermission: (permissionCode: string) => boolean;
  signIn: (email: string, password?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  switchProfile: (profileId: number) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<AvailableProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar lista de perfiles disponibles para selector rápido
  const loadAvailableProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          user_roles (
            roles (code)
          )
        `)
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (!error && data) {
        const formatted: AvailableProfile[] = data.map((p: any) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          role_code: p.user_roles?.[0]?.roles?.code || 'OPERADOR',
        }));
        setAvailableProfiles(formatted);
      }
    } catch (err) {
      console.error('Error loading available profiles:', err);
    }
  };

  const loadUserRolesAndPermissions = async (profileId: number) => {
    try {
      // 1. Obtener roles asignados
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select('role_id, roles(code, name)')
        .eq('user_id', profileId);

      const roleCodes = (userRolesData || []).map((ur: any) => ur.roles?.code).filter(Boolean);
      setRoles(roleCodes.length > 0 ? roleCodes : ['OPERADOR']);

      // 2. Obtener permisos de esos roles
      const roleIds = (userRolesData || []).map((ur: any) => ur.role_id);
      if (roleIds.length > 0) {
        const { data: rolePermsData } = await supabase
          .from('role_permissions')
          .select('permissions(code)')
          .in('role_id', roleIds);

        const permCodes = (rolePermsData || []).map((rp: any) => rp.permissions?.code).filter(Boolean);
        setPermissions(Array.from(new Set(permCodes)));
      } else {
        setPermissions([]);
      }
    } catch (err) {
      console.error('Error loading permissions:', err);
    }
  };

  const loadProfileData = async (authUserId?: string, explicitProfileId?: number) => {
    try {
      let query = supabase.from('profiles').select('*');
      if (explicitProfileId) {
        query = query.eq('id', explicitProfileId);
      } else if (authUserId) {
        query = query.eq('auth_user_id', authUserId);
      } else {
        return;
      }

      const { data: profileData, error: profileError } = await query.single();
      if (profileError || !profileData) {
        console.warn('Profile not found:', profileError);
        return;
      }

      setProfile(profileData);
      localStorage.setItem('leon_active_profile_id', profileData.id.toString());
      await loadUserRolesAndPermissions(profileData.id);
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await loadAvailableProfiles();

        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);

        if (session?.user) {
          await loadProfileData(session.user.id);
        } else {
          // Check if there was a saved profile in localStorage
          const savedProfId = localStorage.getItem('leon_active_profile_id');
          if (savedProfId) {
            await loadProfileData(undefined, parseInt(savedProfId, 10));
          }
        }
      } catch (e) {
        console.error('Error initializing auth:', e);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfileData(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPermission = useCallback(
    (permissionCode: string): boolean => {
      if (roles.includes('ADMIN')) return true;
      return permissions.includes(permissionCode);
    },
    [roles, permissions]
  );

  const signIn = async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      // 1. Try Supabase Auth API
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password || 'admin123',
      });

      if (!error && data?.user) {
        setUser(data.user);
        await loadProfileData(data.user.id);
        setIsLoading(false);
        return {};
      }

      // 2. Direct Profile Fallback
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email.trim())
        .single();

      if (prof) {
        setProfile(prof);
        localStorage.setItem('leon_active_profile_id', prof.id.toString());
        await loadUserRolesAndPermissions(prof.id);
        setIsLoading(false);
        return {};
      }

      setIsLoading(false);
      return { error: error?.message || 'Usuario o contraseña no válidos' };
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
    localStorage.removeItem('leon_active_profile_id');
    setUser(null);
    setProfile(null);
    setRoles([]);
    setPermissions([]);
  };

  const switchProfile = async (profileId: number) => {
    setIsLoading(true);
    localStorage.setItem('leon_active_profile_id', profileId.toString());
    await loadProfileData(undefined, profileId);
    setIsLoading(false);
  };

  const refreshAuth = async () => {
    await loadAvailableProfiles();
    if (profile) {
      await loadProfileData(undefined, profile.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roles,
        permissions,
        availableProfiles,
        isLoading,
        hasPermission,
        signIn,
        signOut,
        switchProfile,
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
