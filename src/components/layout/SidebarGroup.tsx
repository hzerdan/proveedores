import React, { useState, useRef, useEffect } from 'react';
import { NavigationGroup, NavigationTab } from '../../config/navigation';
import { SidebarItem } from './SidebarItem';
import { ChevronDown } from 'lucide-react';

interface SidebarGroupProps {
  group: NavigationGroup;
  currentTab: NavigationTab;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectTab: (tab: NavigationTab) => void;
}

export const SidebarGroup: React.FC<SidebarGroupProps> = ({
  group,
  currentTab,
  isCollapsed,
  isOpen,
  onToggleOpen,
  onSelectTab,
}) => {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const GroupIcon = group.icon;
  const isGroupActive = group.items.some((item) => item.id === currentTab);

  // Close popover on Click Outside or Escape
  useEffect(() => {
    if (!showPopover) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPopover(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPopover]);

  // Handle Tab Selection inside Popover
  const handleSelectFromPopover = (tab: NavigationTab) => {
    onSelectTab(tab);
    setShowPopover(false);
  };

  // COLLAPSED SIDEBAR: Render as button with flyout popover
  if (isCollapsed) {
    return (
      <div className="relative group/group-root">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setShowPopover((prev) => !prev)}
          onMouseEnter={() => setShowPopover(true)}
          aria-haspopup="true"
          aria-expanded={showPopover}
          aria-label={group.label}
          className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
            isGroupActive
              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
          }`}
        >
          <GroupIcon className="w-5 h-5" />
        </button>

        {/* Collapsed Mode Floating Popover Submenu */}
        {showPopover && (
          <div
            ref={popoverRef}
            onMouseLeave={() => setShowPopover(false)}
            className="absolute left-full ml-3 top-0 z-50 min-w-[220px] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl shadow-black/80 p-2 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
          >
            {/* Popover Header */}
            <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-300">
              <GroupIcon className="w-4 h-4 text-sky-400" />
              <span>{group.label}</span>
            </div>

            {/* Popover Items List */}
            <div className="pt-1.5 space-y-1">
              {group.items.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  isActive={item.id === currentTab}
                  isCollapsed={false}
                  onSelect={handleSelectFromPopover}
                  isSubItem
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // EXPANDED SIDEBAR: Render as Collapsible Accordion
  return (
    <div className="space-y-1">
      {/* Group Header Button */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          isGroupActive
            ? 'text-sky-300 hover:text-sky-200'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <GroupIcon className={`w-3.5 h-3.5 ${isGroupActive ? 'text-sky-400' : 'text-slate-500'}`} />
          <span className="truncate">{group.label}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 text-slate-500 ${
            isOpen ? 'rotate-180 text-slate-300' : ''
          }`}
        />
      </button>

      {/* Group Children List */}
      {isOpen && (
        <div className="space-y-0.5 pl-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {group.items.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              isActive={item.id === currentTab}
              isCollapsed={false}
              onSelect={onSelectTab}
              isSubItem
            />
          ))}
        </div>
      )}
    </div>
  );
};
