import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  FileText,
  Clock,
  TrendingUp,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  FileCode2,
  Users,
  ClipboardList,
  Layers,
  LogOut,
  KeyRound,
} from 'lucide-react';

export type NavigationTab =
  | 'suppliers'
  | 'accounts'
  | 'aging'
  | 'projection'
  | 'document_types'
  | 'users_security'
  | 'audit_logs';

interface NavbarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { profile, roles, availableProfiles, switchProfile, signOut } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showMastersMenu, setShowMastersMenu] = useState(false);

  const roleColor = roles.includes('ADMIN')
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    : roles.includes('ENCARGADO')
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    : 'bg-sky-500/20 text-sky-300 border-sky-500/30';

  const isMasterTab = ['document_types', 'users_security', 'audit_logs'].includes(currentTab);

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <div
              onClick={() => onTabChange('suppliers')}
              className="flex items-center space-x-3 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  León Proveedores
                </span>
                <span className="hidden sm:block text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                  Cuentas Corrientes & Maestros
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex space-x-1 sm:space-x-2">
              <button
                onClick={() => onTabChange('suppliers')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  currentTab === 'suppliers'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>Proveedores</span>
              </button>

              <button
                onClick={() => onTabChange('accounts')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  currentTab === 'accounts'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Cuentas Corrientes</span>
              </button>

              <button
                onClick={() => onTabChange('aging')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  currentTab === 'aging'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Saldo General (Aging)</span>
              </button>

              <button
                onClick={() => onTabChange('projection')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  currentTab === 'projection'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Proyección de Pagos</span>
              </button>

              {/* Dropdown Maestros / Administración */}
              <div className="relative">
                <button
                  onClick={() => setShowMastersMenu(!showMastersMenu)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    isMasterTab
                      ? 'bg-slate-800 text-amber-300 shadow-sm border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Maestros</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showMastersMenu && (
                  <div
                    onMouseLeave={() => setShowMastersMenu(false)}
                    className="absolute left-0 mt-2 w-56 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2"
                  >
                    <button
                      onClick={() => {
                        onTabChange('suppliers');
                        setShowMastersMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center space-x-2.5 transition-colors ${
                        currentTab === 'suppliers'
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <Building2 className="w-4 h-4 text-emerald-400" />
                      <span>ABM Proveedores</span>
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('document_types');
                        setShowMastersMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center space-x-2.5 transition-colors ${
                        currentTab === 'document_types'
                          ? 'bg-sky-500/20 text-sky-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <FileCode2 className="w-4 h-4 text-sky-400" />
                      <span>ABM Tipos de Comprobantes</span>
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('users_security');
                        setShowMastersMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center space-x-2.5 transition-colors ${
                        currentTab === 'users_security'
                          ? 'bg-amber-500/20 text-amber-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Usuarios & Seguridad</span>
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('audit_logs');
                        setShowMastersMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center space-x-2.5 transition-colors ${
                        currentTab === 'audit_logs'
                          ? 'bg-violet-500/20 text-violet-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      <ClipboardList className="w-4 h-4 text-violet-400" />
                      <span>Auditoría de Excepciones</span>
                    </button>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* User Profile & Role Switcher */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className="flex items-center space-x-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 px-3 py-1.5 rounded-lg transition-all text-left"
              >
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                  {profile ? (profile.full_name ? profile.full_name.slice(0, 2).toUpperCase() : 'U') : 'U'}
                </div>
                <div className="hidden md:block text-xs">
                  <div className="font-medium text-slate-200">
                    {profile ? profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Cargando...'}
                  </div>
                  <div className="text-[10px] text-slate-400">{profile?.email}</div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${roleColor}`}>
                  {roles[0] || 'OPERADOR'}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Dynamic Profiles Dropdown */}
              {showRoleMenu && (
                <div
                  onMouseLeave={() => setShowRoleMenu(false)}
                  className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-800 border border-slate-700 shadow-xl shadow-black/50 p-2 z-50 animate-in fade-in slide-in-from-top-2 space-y-1"
                >
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-700/60">
                    Cambiar Perfil Activo
                  </div>

                  {availableProfiles.map((p) => {
                    const isSelected = profile?.id === p.id;
                    const rCode = p.role_code;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          switchProfile(p.id);
                          setShowRoleMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-sky-500/20 text-white font-bold border border-sky-500/30'
                            : 'hover:bg-slate-700/60 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {rCode === 'ADMIN' ? (
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                          ) : rCode === 'ENCARGADO' ? (
                            <KeyRound className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-sky-400" />
                          )}
                          <div>
                            <div>
                              {p.first_name} {p.last_name}
                            </div>
                            <div className="text-[10px] text-slate-400">{p.email}</div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            rCode === 'ADMIN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : rCode === 'ENCARGADO'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {rCode}
                        </span>
                      </button>
                    );
                  })}

                  <div className="pt-1 border-t border-slate-700/60 mt-1">
                    <button
                      onClick={() => {
                        signOut();
                        setShowRoleMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-rose-500/20 text-rose-300 rounded-lg flex items-center space-x-2 transition-colors font-medium"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
