import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  NavigationTab,
  getFilteredNavigation,
} from '../../config/navigation';
import { SidebarGroup } from './SidebarGroup';
import { Building2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  className?: string;
}

const STORAGE_KEY = 'leon_sidebar_collapsed';

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  className = '',
}) => {
  const { hasPermission } = useAuth();

  // Load initial collapsed state from localStorage
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Track user-toggled group states (empty means default: active group open, others open)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filter groups by user permissions (memoized)
  const filteredGroups = useMemo(
    () => getFilteredNavigation(hasPermission),
    [hasPermission]
  );

  // Persist collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(isCollapsed));
    } catch (e) {
      console.error('Error saving sidebar state:', e);
    }
  }, [isCollapsed]);

  const isGroupOpen = (group: (typeof filteredGroups)[0]) => {
    const isCurrentInGroup = group.items.some((item) => item.id === currentTab);
    // If active tab is inside this group, always open
    if (isCurrentInGroup) return true;
    // Otherwise check if user collapsed it
    return !collapsedGroups[group.id];
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  return (
    <aside
      aria-label="Navegación principal"
      className={`h-full flex flex-col flex-shrink-0 bg-slate-900 border-r border-slate-800 transition-all duration-300 select-none ${
        isCollapsed ? 'w-[72px]' : 'w-64'
      } ${className}`}
    >
      {/* 1. TOP HEADER: Brand / Logo (Always fixed, never scrolls) */}
      <div className="h-16 flex-shrink-0 px-3.5 border-b border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onTabChange('suppliers')}
          className="flex items-center gap-3 w-full text-left outline-none group focus-visible:ring-2 focus-visible:ring-sky-500 rounded-xl"
          title="León Proveedores — Ir a inicio"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1 truncate">
              <span className="block text-sm font-bold bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent truncate">
                León Proveedores
              </span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium truncate">
                Cuentas Corrientes
              </span>
            </div>
          )}
        </button>
      </div>

      {/* 2. MIDDLE NAVIGATION AREA: Independent Vertical Scroll */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-4 space-y-3">
        {filteredGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            group={group}
            currentTab={currentTab}
            isCollapsed={isCollapsed}
            isOpen={isGroupOpen(group)}
            onToggleOpen={() => toggleGroup(group.id)}
            onSelectTab={onTabChange}
          />
        ))}
      </nav>

      {/* 3. BOTTOM FOOTER: Collapse / Expand Toggle Button (Always fixed) */}
      <div className="h-14 flex-shrink-0 px-2.5 border-t border-slate-800/80 flex items-center justify-center">
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!isCollapsed && <span>Contraer menú</span>}
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4 text-slate-400" />
          ) : (
            <PanelLeftClose className="w-4 h-4 text-slate-400" />
          )}
        </button>
      </div>
    </aside>
  );
};
