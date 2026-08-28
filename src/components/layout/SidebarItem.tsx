import React, { useState } from 'react';
import { NavigationItem, NavigationTab } from '../../config/navigation';

interface SidebarItemProps {
  item: NavigationItem;
  isActive: boolean;
  isCollapsed?: boolean;
  onSelect: (tab: NavigationTab) => void;
  className?: string;
  isSubItem?: boolean;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  item,
  isActive,
  isCollapsed = false,
  onSelect,
  className = '',
  isSubItem = false,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const Icon = item.icon;

  const handleClick = () => {
    onSelect(item.id);
  };

  return (
    <div className="relative group/item">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        className={`w-full flex items-center gap-3 transition-all duration-150 rounded-xl font-medium text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          isCollapsed ? 'justify-center p-2.5' : isSubItem ? 'px-3 py-2 text-xs sm:text-sm pl-4' : 'px-3 py-2.5 text-xs sm:text-sm'
        } ${
          isActive
            ? 'bg-sky-500/15 text-sky-400 font-semibold border border-sky-500/30 shadow-sm shadow-sky-500/10'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
        } ${className}`}
      >
        <div
          className={`flex items-center justify-center transition-colors ${
            isActive
              ? 'text-sky-400'
              : 'text-slate-400 group-hover/item:text-slate-200'
          }`}
        >
          <Icon className={`${isCollapsed ? 'w-5 h-5' : isSubItem ? 'w-4 h-4' : 'w-4 h-4'}`} />
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <span className="truncate">{item.label}</span>
            {item.badge && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-sky-500/20 text-sky-300 rounded border border-sky-500/30">
                {item.badge}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Accessible Floating Tooltip in Collapsed Mode */}
      {isCollapsed && showTooltip && (
        <div
          role="tooltip"
          className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg border border-slate-700/90 shadow-2xl shadow-black/80 whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center gap-1.5">
            <span>{item.label}</span>
            {isActive && (
              <span className="text-[9px] px-1 py-0.2 bg-sky-500/20 text-sky-300 rounded font-normal">
                Activo
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
