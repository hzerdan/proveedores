import {
  FileText,
  Clock,
  TrendingUp,
  Building2,
  UserCheck,
  FileCode2,
  Users,
  ClipboardList,
  Layers,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react';

export type NavigationTab =
  | 'suppliers'
  | 'sellers'
  | 'accounts'
  | 'aging'
  | 'projection'
  | 'document_types'
  | 'users_security'
  | 'audit_logs';

export interface NavigationItem {
  id: NavigationTab;
  label: string;
  shortLabel?: string;
  screenTitle: string;
  breadcrumb: string[];
  icon: LucideIcon;
  permission?: string;
  description?: string;
  badge?: string | number;
}

export interface NavigationGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'accounts_group',
    label: 'Cuentas Corrientes',
    icon: FileText,
    items: [
      {
        id: 'accounts',
        label: 'Cuentas Corrientes',
        shortLabel: 'Cuentas',
        screenTitle: 'Cuentas Corrientes',
        breadcrumb: ['Cuentas Corrientes', 'Saldos y Movimientos'],
        icon: FileText,
        description: 'Estado de cuenta, documentos e imputaciones por proveedor',
      },
      {
        id: 'aging',
        label: 'Saldo General (Aging)',
        shortLabel: 'Aging',
        screenTitle: 'Saldo General y Aging de Deuda',
        breadcrumb: ['Cuentas Corrientes', 'Saldo General (Aging)'],
        icon: Clock,
        description: 'Antigüedad de saldos y vencimientos por proveedor y vendedor',
      },
      {
        id: 'projection',
        label: 'Proyección de Pagos',
        shortLabel: 'Proyección',
        screenTitle: 'Proyección y Programación de Pagos',
        breadcrumb: ['Cuentas Corrientes', 'Proyección de Pagos'],
        icon: TrendingUp,
        description: 'Planificación de compromisos financieros por semana',
      },
    ],
  },
  {
    id: 'masters_group',
    label: 'Maestros',
    icon: Layers,
    items: [
      {
        id: 'suppliers',
        label: 'Proveedores',
        shortLabel: 'Proveedores',
        screenTitle: 'Maestro de Proveedores',
        breadcrumb: ['Maestros', 'Proveedores'],
        icon: Building2,
        description: 'Catálogo de proveedores y datos fiscales',
      },
      {
        id: 'sellers',
        label: 'Vendedores',
        shortLabel: 'Vendedores',
        screenTitle: 'Gestión de Vendedores',
        breadcrumb: ['Maestros', 'Vendedores'],
        icon: UserCheck,
        description: 'Vendedores y asignaciones activas a proveedores',
      },
      {
        id: 'document_types',
        label: 'Tipos de Comprobantes',
        shortLabel: 'Comprobantes',
        screenTitle: 'ABM Tipos de Comprobantes',
        breadcrumb: ['Maestros', 'Tipos de Comprobantes'],
        icon: FileCode2,
        permission: 'system.manage',
        description: 'Parámetros y naturaleza de comprobantes del sistema',
      },
    ],
  },
  {
    id: 'admin_group',
    label: 'Administración & Seguridad',
    icon: ShieldCheck,
    items: [
      {
        id: 'users_security',
        label: 'Usuarios & Seguridad',
        shortLabel: 'Usuarios',
        screenTitle: 'Usuarios y Seguridad',
        breadcrumb: ['Administración', 'Usuarios & Seguridad'],
        icon: Users,
        permission: 'system.manage',
        description: 'Gestión de operadores, roles y permisos de acceso',
      },
      {
        id: 'audit_logs',
        label: 'Auditoría & Trazabilidad',
        shortLabel: 'Auditoría',
        screenTitle: 'Auditoría de Excepciones, Reversiones y Extracciones IA',
        breadcrumb: ['Administración', 'Auditoría'],
        icon: ClipboardList,
        permission: 'audit.view',
        description: 'Excepciones, reversiones y auditoría de derivados de IA',
      },
    ],
  },
];

// Flat list of all items for fast lookup
export const ALL_NAVIGATION_ITEMS: NavigationItem[] = NAVIGATION_GROUPS.flatMap(
  (group) => group.items
);

export function getNavigationItem(tabId: NavigationTab): NavigationItem | undefined {
  return ALL_NAVIGATION_ITEMS.find((item) => item.id === tabId);
}

export function getFilteredNavigation(
  hasPermission: (permissionCode: string) => boolean
): NavigationGroup[] {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!item.permission) return true;
      return hasPermission(item.permission);
    }),
  })).filter((group) => group.items.length > 0);
}
