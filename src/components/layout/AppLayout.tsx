import React, { useState } from 'react';
import { NavigationTab } from '../../config/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileSidebar } from './MobileSidebar';

interface AppLayoutProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onTabChange,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-row bg-slate-950 text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* 1. Desktop Persistent Sidebar */}
      <div className="hidden md:flex h-full flex-shrink-0 z-20">
        <Sidebar currentTab={currentTab} onTabChange={onTabChange} />
      </div>

      {/* 2. Mobile Slide-out Drawer */}
      <MobileSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentTab={currentTab}
        onTabChange={onTabChange}
      />

      {/* 3. Main Application Area (Header + Main Content + Footer) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Global Header */}
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Independent Scrollable Content Area */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1680px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {children}
          </div>

          {/* Global Footer inside Main Scroll */}
          <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500 mt-8">
            <p>León Proveedores • Sistema Integral de Cuentas Corrientes y Facturación</p>
          </footer>
        </main>
      </div>
    </div>
  );
};
