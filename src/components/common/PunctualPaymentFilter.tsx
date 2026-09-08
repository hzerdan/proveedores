import React from 'react';
import { PunctualPaymentStatus, PUNCTUAL_PAYMENT_CONFIGS } from '../../lib/punctualPayment';
import { Filter, Check } from 'lucide-react';

interface PunctualPaymentFilterProps {
  selectedStatuses: PunctualPaymentStatus[];
  onChangeStatuses: (statuses: PunctualPaymentStatus[]) => void;
  className?: string;
}

export const PunctualPaymentFilter: React.FC<PunctualPaymentFilterProps> = ({
  selectedStatuses,
  onChangeStatuses,
  className = ''
}) => {
  const allStatuses: PunctualPaymentStatus[] = ['OVERDUE', 'DUE_SOON', 'ON_TIME', 'NO_DUE_DATE'];

  const toggleStatus = (status: PunctualPaymentStatus) => {
    if (selectedStatuses.includes(status)) {
      onChangeStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      onChangeStatuses([...selectedStatuses, status]);
    }
  };

  const handleClearAll = () => {
    onChangeStatuses([]);
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap text-xs ${className}`}>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
        <Filter size={12} className="text-slate-400" />
        <span>Pago Puntual:</span>
      </span>

      {allStatuses.map((status) => {
        const config = PUNCTUAL_PAYMENT_CONFIGS[status];
        const isSelected = selectedStatuses.includes(status);

        return (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatus(status)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
              isSelected
                ? `${config.badgeClass} ring-2 ring-offset-1 ring-offset-slate-900 ring-current font-bold shadow-sm`
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
            }`}
            title={`Filtrar por: ${config.label} (${config.description})`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                status === 'OVERDUE'
                  ? 'bg-red-500'
                  : status === 'DUE_SOON'
                  ? 'bg-amber-500'
                  : status === 'ON_TIME'
                  ? 'bg-emerald-500'
                  : 'bg-slate-400'
              }`}
            />
            <span>{config.label}</span>
            {isSelected && <Check size={11} className="shrink-0 ml-0.5" />}
          </button>
        );
      })}

      {selectedStatuses.length > 0 && (
        <button
          type="button"
          onClick={handleClearAll}
          className="text-[11px] text-slate-500 hover:text-slate-300 underline underline-offset-2 ml-1"
        >
          Limpiar filtro
        </button>
      )}
    </div>
  );
};
