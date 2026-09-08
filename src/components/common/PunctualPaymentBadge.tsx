import React from 'react';
import { AlertTriangle, Clock, CheckCircle2, HelpCircle, Info } from 'lucide-react';
import { PunctualPaymentStatus, PUNCTUAL_PAYMENT_CONFIGS } from '../../lib/punctualPayment';

interface PunctualPaymentBadgeProps {
  status: PunctualPaymentStatus;
  note?: string | null;
  hasNoDueDateDocs?: boolean;
  dueDate?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export const PunctualPaymentBadge: React.FC<PunctualPaymentBadgeProps> = ({
  status,
  note,
  hasNoDueDateDocs = false,
  dueDate,
  size = 'md',
  className = ''
}) => {
  const config = PUNCTUAL_PAYMENT_CONFIGS[status] || PUNCTUAL_PAYMENT_CONFIGS.NO_DUE_DATE;

  const renderIcon = () => {
    const iconSize = size === 'sm' ? 12 : 14;
    switch (config.iconName) {
      case 'alert-triangle':
        return <AlertTriangle size={iconSize} className="shrink-0" />;
      case 'clock':
        return <Clock size={iconSize} className="shrink-0" />;
      case 'check-circle':
        return <CheckCircle2 size={iconSize} className="shrink-0" />;
      case 'help-circle':
      default:
        return <HelpCircle size={iconSize} className="shrink-0" />;
    }
  };

  const tooltipContent = [
    `Beneficio por pago puntual: ${config.label}`,
    config.description,
    dueDate ? `Vencimiento más urgente: ${dueDate}` : null,
    hasNoDueDateDocs ? 'Nota: El proveedor posee además obligaciones sin fecha de vencimiento.' : null,
    note ? `Condición particular: ${note}` : null
  ].filter(Boolean).join('\n');

  return (
    <span
      title={tooltipContent}
      className={`inline-flex items-center gap-1 font-medium border rounded-full transition-colors cursor-help ${
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'
      } ${config.badgeClass} ${className}`}
      role="status"
      aria-label={`Beneficio pago puntual: ${config.label}`}
    >
      {renderIcon()}
      <span>{config.label}</span>
      {hasNoDueDateDocs && status !== 'NO_DUE_DATE' && (
        <span
          title="Posee obligaciones adicionales sin fecha de vencimiento"
          className="text-[10px] opacity-75 font-normal ml-0.5 border-l border-current pl-1"
        >
          +s/v
        </span>
      )}
      {note && (
        <Info size={11} className="opacity-60 shrink-0 ml-0.5" />
      )}
    </span>
  );
};
