import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile, Role, Permission } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  Shield,
  Plus,
  Check,
  X,
  AlertCircle,
  Key,
  UserCheck,
} from 'lucide-react';

export const UsersSecurityMaster: React.FC = () => {
  const { hasPermission, profile: currentProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<Record<number, string[]>>({});
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [_loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Profile Form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      // 1. Fetch profiles
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .order('id', { ascending: true });
      setProfiles(profs || []);

      // 2. Fetch roles
      const { data: rolesData } = await supabase.from('roles').select('*').order('id');
      setRoles(rolesData || []);

      // 3. Fetch permissions
      const { data: permsData } = await supabase.from('permissions').select('*').order('module');
      setPermissions(permsData || []);

      // 4. Fetch user_roles
      const { data: urData } = await supabase
        .from('user_roles')
        .select('user_id, roles(code)');

      const map: Record<number, string[]> = {};
      (urData || []).forEach((ur: any) => {
        if (!map[ur.user_id]) map[ur.user_id] = [];
        if (ur.roles?.code) map[ur.user_id].push(ur.roles.code);
      });
      setUserRolesMap(map);
    } catch (err) {
      console.error('Error fetching security data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('system.manage')) return;
    setError(null);
    setSaving(true);

    try {
      // Generate a mock auth UUID if not linked via Supabase auth yet
      const randomUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
          v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      const { data: newProfile, error: profErr } = await supabase
        .from('profiles')
        .insert({
          auth_user_id: randomUuid,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          is_active: true,
        })
        .select()
        .single();

      if (profErr) throw profErr;

      if (selectedRoleId && newProfile) {
        await supabase.from('user_roles').insert({
          user_id: newProfile.id,
          role_id: Number(selectedRoleId),
        });
      }

      setIsModalOpen(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      fetchSecurityData();
    } catch (err: any) {
      console.error('Error creating user profile:', err);
      setError(err.message || 'Error al registrar usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl shadow-black/20">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Maestro: Usuarios, Roles y Permisos</h1>
            <p className="text-xs text-slate-400">
              Control de acceso basado en roles (RBAC) con identificación técnica en bigint
            </p>
          </div>
        </div>

        {hasPermission('system.manage') && (
          <button
            onClick={() => {
              if (roles.length > 0) setSelectedRoleId(roles[0].id);
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-amber-900/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Usuario Interno</span>
          </button>
        )}
      </div>

      {/* Grid: Users Table & Roles Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users Table */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/40 flex items-center justify-between">
            <h2 className="font-bold text-white text-sm flex items-center space-x-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span>Usuarios del Sistema (profiles)</span>
            </h2>
            <span className="text-[11px] text-slate-400">{profiles.length} registrados</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/40 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">ID & Usuario</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Roles Asignados</th>
                  <th className="px-6 py-3 text-center">Acción Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {profiles.map((p) => {
                  const userRoles = userRolesMap[p.id] || ['OPERADOR'];
                  const isCurrent = currentProfile?.id === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCurrent ? 'bg-sky-500/5' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center space-x-2.5">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                            #{p.id}
                          </span>
                          <span className="font-bold text-white">
                            {p.first_name} {p.last_name}
                          </span>
                          {isCurrent && (
                            <span className="bg-sky-500/20 text-sky-300 text-[9px] font-bold px-1.5 py-0.2 rounded">
                              TÚ
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-3.5 font-mono text-slate-400 text-[11px]">
                        {p.email}
                      </td>

                      <td className="px-6 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.map((r) => (
                            <span
                              key={r}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                r === 'ADMIN'
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  : r === 'ENCARGADO'
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                              }`}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-6 py-3.5 text-center">
                        {p.id === currentProfile?.id ? (
                          <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 text-[11px] font-semibold border border-sky-500/30">
                            Sesión Activa
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Roles & Permissions Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30 p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Key className="w-4 h-4 text-amber-400" />
            <h2 className="font-bold text-white text-sm">Permisos Parametrizados</h2>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1 text-xs">
            {permissions.map((perm) => (
              <div
                key={perm.id}
                className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/50 space-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sky-300 text-[11px]">{perm.code}</span>
                  <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded border border-slate-700">
                    {perm.module}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{perm.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Nuevo Usuario */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-white">Nuevo Usuario Interno</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: Carlos"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Apellido *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: Gómez"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  placeholder="carlos.gomez@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Rol Asignado *</label>
                <select
                  required
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Crear Usuario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
