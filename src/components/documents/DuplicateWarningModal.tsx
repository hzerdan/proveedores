import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AlertTriangle, ShieldAlert, Check } from 'lucide-react';

interface DuplicateWarningModalProps {
  isOpen: boolean;
  duplicateInfo: {
    matched_document_id: number;
    matched_human_reference: string;
    matched_issue_date: string;
    matched_total_amount: number;
    message: string;
  } | null;
  onCancel: () => void;
  onConfirmOverride: (reason: string) => void;
  loading?: boolean;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  isOpen,
  duplicateInfo,
  onCancel,
  onConfirmOverride,
  loading = false,
}) => {
  const { hasPermission } = useAuth();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !duplicateInfo) return null;

  const canOverride = hasPermission('documents.duplicate_override');

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('Debe ingresar un motivo obligatorio para justificar la excepción.');
      return;
    }
    setError(null);
    onConfirmOverride(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-amber-500/40 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center space-x-3 px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 text-amber-300">
          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Comprobante Posiblemente Duplicado</h2>
            <p className="text-xs text-amber-300/80">Detección de coincidencia fiscal en el proveedor</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2">
            <div className="text-slate-400">Ya existe registrado un comprobante con idéntica numeración:</div>
            <div className="font-mono text-sm font-bold text-white">
              {duplicateInfo.matched_human_reference}
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-400 pt-2 border-t border-slate-700 text-[11px]">
              <div>
                ID de Sistema: <span className="font-mono text-slate-200">#{duplicateInfo.matched_document_id}</span>
              </div>
              <div>
                Fecha: <span className="font-mono text-slate-200">{duplicateInfo.matched_issue_date}</span>
              </div>
              <div>
                Importe:{' '}
                <span className="font-mono text-slate-200">
                  ${duplicateInfo.matched_total_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {canOverride ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Motivo de Excepción (* Obligatorio para registrar auditoría):
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explique detalladamente por qué se confirma este comprobante a pesar de coincidir con el anterior (ej: refacturación autorizada, nota de rectificación, etc.)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
              {error && <div className="text-rose-400 text-xs font-medium">{error}</div>}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Su rol actual no posee el permiso <code className="font-mono font-bold">documents.duplicate_override</code> para forzar la confirmación de este comprobante. Solicite autorización a un Encargado o Administrador.
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-800 bg-slate-800/30">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancelar y Revisar
          </button>

          {canOverride && (
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirm}
              className="flex items-center space-x-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-amber-900/30 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Procesando...' : 'Autorizar Excepción y Confirmar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
