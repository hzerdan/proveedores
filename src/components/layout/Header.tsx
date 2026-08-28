import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NavigationTab, getNavigationItem } from '../../config/navigation';
import {
  Menu,
  ChevronDown,
  ShieldCheck,
  KeyRound,
  UserCheck,
  LogOut,
  ChevronRight,
} from 'lucide-react';

interface HeaderProps {
  currentTab: NavigationTab;
  onOpenMobileMenu: () => void;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  className = '',
}) => {
  const { profile, roles, availableProfiles, switchProfile, signOut } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Active Tab Metadata for Title & Breadcrumbs
  const activeItem = getNavigationItem(currentTab);

  const roleColor = roles.includes('ADMIN')
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    : roles.includes('ENCARGADO')
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    : 'bg-sky-500/20 text-sky-300 border-sky-500/30';

  // Handle Click Outside & Escape for Profile Menu
  useEffect(() => {
    if (!showRoleMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setShowRoleMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRoleMenu(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showRoleMenu]);

  return (
    <header
      className={`h-16 flex-shrink-0 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between z-30 select-none ${className}`}
    >
      {/* 1. LEFT SECTION: Hamburger button (mobile) + Dynamic Title / Breadcrumb */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menú de navegación"
          className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Breadcrumbs & Section Title */}
        <div className="min-w-0">
          {activeItem && (
            <>
              {/* Breadcrumb path */}
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                {activeItem.breadcrumb.map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                    <span className={idx === activeItem.breadcrumb.length - 1 ? 'text-slate-300' : ''}>
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </div>

              {/* Main Screen Title */}
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                {activeItem.screenTitle || activeItem.label}
              </h1>
            </>
          )}
        </div>
      </div>

      {/* 2. RIGHT SECTION: User Profile & Role Switcher */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setShowRoleMenu((prev) => !prev)}
            aria-haspopup="true"
            aria-expanded={showRoleMenu}
            aria-label="Menú de usuario y cambio de perfil"
            className="flex items-center gap-2.5 sm:gap-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-xs font-semibold text-white shadow-inner flex-shrink-0">
              {profile ? (profile.full_name ? profile.full_name.slice(0, 2).toUpperCase() : 'U') : 'U'}
            </div>

            <div className="hidden md:block text-xs max-w-[150px] truncate">
              <div className="font-semibold text-slate-200 truncate">
                {profile
                  ? profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                  : 'Cargando...'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">{profile?.email}</div>
            </div>

            <div className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${roleColor}`}>
              {roles[0] || 'OPERADOR'}
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Dynamic Profiles Dropdown Menu */}
          {showRoleMenu && (
            <div
              ref={dropdownRef}
              className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-black/80 p-2 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md space-y-1"
            >
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                Cambiar Perfil Activo
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                {availableProfiles.map((p) => {
                  const isSelected = profile?.id === p.id;
                  const rCode = p.role_code;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        switchProfile(p.id);
                        setShowRoleMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-xl flex items-center justify-between transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        isSelected
                          ? 'bg-sky-500/20 text-white font-bold border border-sky-500/30'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {rCode === 'ADMIN' ? (
                          <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        ) : rCode === 'ENCARGADO' ? (
                          <KeyRound className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <UserCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="truncate">
                            {p.first_name} {p.last_name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{p.email}</div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ml-2 flex-shrink-0 ${
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
              </div>

              <div className="pt-1 border-t border-slate-800 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    setShowRoleMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-rose-500/20 text-rose-300 rounded-xl flex items-center gap-2 transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
