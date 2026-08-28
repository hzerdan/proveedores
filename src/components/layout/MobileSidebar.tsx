import React, { useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  NavigationTab,
  getFilteredNavigation,
} from '../../config/navigation';
import { SidebarGroup } from './SidebarGroup';
import { Building2, X } from 'lucide-react';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({
  isOpen,
  onClose,
  currentTab,
  onTabChange,
}) => {
  const { hasPermission } = useAuth();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});

  const filteredGroups = useMemo(
    () => getFilteredNavigation(hasPermission),
    [hasPermission]
  );

  const isGroupOpen = (group: (typeof filteredGroups)[0]) => {
    const isCurrentInGroup = group.items.some((item) => item.id === currentTab);
    if (isCurrentInGroup) return true;
    return !collapsedGroups[group.id];
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Focus Management and Escape Key handling
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }

        // Basic Focus Trap inside the drawer
        if (e.key === 'Tab' && drawerRef.current) {
          const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            last.focus();
            e.preventDefault();
          } else if (!e.shiftKey && document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      // Focus first element or close button
      const timer = setTimeout(() => {
        const closeBtn = drawerRef.current?.querySelector<HTMLButtonElement>('button');
        closeBtn?.focus();
      }, 50);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
        previouslyFocusedElementRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectTab = (tab: NavigationTab) => {
    onTabChange(tab);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menú móvil de navegación"
      className="fixed inset-0 z-50 md:hidden"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      />

      {/* Slide-out Drawer Panel */}
      <div
        ref={drawerRef}
        className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-left duration-250 select-none"
      >
        {/* Header */}
        <div className="h-16 flex-shrink-0 px-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">León Proveedores</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block">
                Cuentas Corrientes
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú de navegación"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Area */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
          {filteredGroups.map((group) => (
            <SidebarGroup
              key={group.id}
              group={group}
              currentTab={currentTab}
              isCollapsed={false}
              isOpen={isGroupOpen(group)}
              onToggleOpen={() => toggleGroup(group.id)}
              onSelectTab={handleSelectTab}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/80 text-center text-[10px] text-slate-500">
          León Proveedores ERP
        </div>
      </div>
    </div>
  );
};
