import { PunctualPaymentStatus } from '../types/database';

export type { PunctualPaymentStatus };

export interface PunctualPaymentBadgeConfig {
  status: PunctualPaymentStatus;
  label: string;
  description: string;
  colorClass: string;
  badgeClass: string;
  iconName: 'alert-triangle' | 'clock' | 'check-circle' | 'help-circle';
}

export const PUNCTUAL_PAYMENT_CONFIGS: Record<PunctualPaymentStatus, PunctualPaymentBadgeConfig> = {
  OVERDUE: {
    status: 'OVERDUE',
    label: 'Vencido',
    description: 'Tiene al menos una obligación con fecha de vencimiento superada. Beneficio en riesgo de pérdida.',
    colorClass: 'text-red-500',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/50',
    iconName: 'alert-triangle'
  },
  DUE_SOON: {
    status: 'DUE_SOON',
    label: 'Vence ≤ 7 días',
    description: 'Vence hoy o dentro de los próximos 7 días corridos. Pagar a término para conservar beneficio.',
    colorClass: 'text-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50',
    iconName: 'clock'
  },
  ON_TIME: {
    status: 'ON_TIME',
    label: 'En término',
    description: 'Todas las obligaciones vencen en más de 7 días corridos.',
    colorClass: 'text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
    iconName: 'check-circle'
  },
  NO_DUE_DATE: {
    status: 'NO_DUE_DATE',
    label: 'Sin vencimiento',
    description: 'Obligaciones abiertas sin fecha de vencimiento registrada.',
    colorClass: 'text-slate-400',
    badgeClass: 'bg-slate-500/10 text-slate-500 border-slate-400/30 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/50',
    iconName: 'help-circle'
  }
};

/**
 * Parses YYYY-MM-DD or ISO date string into a local calendar Date (midnight local time)
 * to avoid UTC timezone offset shifts.
 */
export function parseCalendarDate(dateStr: string): Date {
  const parts = dateStr.slice(0, 10).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Calculates punctual payment status for a single document due date.
 */
export function calculatePunctualPaymentStatus(
  dueDate: string | null | undefined,
  referenceDate?: string | Date
): PunctualPaymentStatus {
  if (!dueDate) {
    return 'NO_DUE_DATE';
  }

  let today: Date;
  if (referenceDate) {
    today = typeof referenceDate === 'string'
      ? parseCalendarDate(referenceDate)
      : new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0, 0);
  } else {
    const now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  const due = parseCalendarDate(dueDate);
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'OVERDUE';
  } else if (diffDays <= 7) {
    return 'DUE_SOON';
  } else {
    return 'ON_TIME';
  }
}

export interface AggregatedSupplierPunctualStatus {
  status: PunctualPaymentStatus;
  hasNoDueDateDocs: boolean;
  urgentDueDate: string | null;
  overdueCount: number;
  dueSoonCount: number;
  onTimeCount: number;
  noDueDateCount: number;
}

/**
 * Calculates aggregated punctual payment status for a supplier across all its open obligations.
 */
export function calculateAggregatedSupplierStatus(
  documents: Array<{ due_date?: string | null; reference_balance?: number; balance_nature?: string }>,
  referenceDate?: string | Date
): AggregatedSupplierPunctualStatus {
  // Only consider open obligations (debit documents with reference_balance > 0)
  const openDocs = documents.filter(d => (d.reference_balance ?? 0) > 0.0001);

  if (openDocs.length === 0) {
    return {
      status: 'NO_DUE_DATE',
      hasNoDueDateDocs: false,
      urgentDueDate: null,
      overdueCount: 0,
      dueSoonCount: 0,
      onTimeCount: 0,
      noDueDateCount: 0
    };
  }

  let overdueCount = 0;
  let dueSoonCount = 0;
  let onTimeCount = 0;
  let noDueDateCount = 0;
  let urgentDueDate: string | null = null;

  for (const doc of openDocs) {
    if (!doc.due_date) {
      noDueDateCount++;
      continue;
    }

    if (!urgentDueDate || doc.due_date < urgentDueDate) {
      urgentDueDate = doc.due_date;
    }

    const docStatus = calculatePunctualPaymentStatus(doc.due_date, referenceDate);
    if (docStatus === 'OVERDUE') overdueCount++;
    else if (docStatus === 'DUE_SOON') dueSoonCount++;
    else if (docStatus === 'ON_TIME') onTimeCount++;
  }

  let finalStatus: PunctualPaymentStatus;
  if (overdueCount > 0) {
    finalStatus = 'OVERDUE';
  } else if (dueSoonCount > 0) {
    finalStatus = 'DUE_SOON';
  } else if (onTimeCount > 0) {
    finalStatus = 'ON_TIME';
  } else {
    finalStatus = 'NO_DUE_DATE';
  }

  return {
    status: finalStatus,
    hasNoDueDateDocs: noDueDateCount > 0,
    urgentDueDate,
    overdueCount,
    dueSoonCount,
    onTimeCount,
    noDueDateCount
  };
}

/**
 * Calculates supplier status directly from pre-aggregated query fields (min_due_date, has_no_due_date_docs).
 * Used when projections or aging views already provide min_due_date and has_no_due_date_docs.
 */
export function calculatePunctualStatusFromSummary(
  minDueDate: string | null | undefined,
  hasNoDueDateDocs: boolean,
  referenceDate?: string | Date
): AggregatedSupplierPunctualStatus {
  const status = calculatePunctualPaymentStatus(minDueDate, referenceDate);
  return {
    status,
    hasNoDueDateDocs,
    urgentDueDate: minDueDate || null,
    overdueCount: status === 'OVERDUE' ? 1 : 0,
    dueSoonCount: status === 'DUE_SOON' ? 1 : 0,
    onTimeCount: status === 'ON_TIME' ? 1 : 0,
    noDueDateCount: hasNoDueDateDocs ? 1 : 0,
  };
}

