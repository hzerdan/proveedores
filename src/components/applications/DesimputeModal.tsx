import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, Undo2, AlertCircle, ArrowDownRight } from 'lucide-react';

interface DesimputeModalProps {
  supplierId: number;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const DesimputeModal: React.FC<DesimputeModalProps> = ({
  supplierId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [imputations, setImputations] = useState<any[]>([]);
  const [selectedMovementId, setSelectedMovementId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supplierId || !isOpen) return;

    const fetchActiveImputations = async () => {
      setLoading(true);
      try {
        // Find active negative movements applied to debits
        const { data, error: err } = await supabase
          .from('v_document_ledger')
          .select('*')
          .eq('supplier_id', supplierId)
          .in('movement_type', ['IMPUTATION', 'APL_TRANSFER'])
          .lt('amount', 0)
          .neq('document_id', 'reference_id')
          .order('movement_date', { ascending: false });

        if (err) throw err;
        setImputations(data || []);
      } catch (err) {
        console.error('Error fetching imputations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActiveImputations();
    setSelectedMovementId(null);
    setReason('');
    setError(null);
  }, [supplierId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovementId) {
      setError('Seleccione un renglón de imputación a desimputar.');
      return;
    }
    if (!reason.trim()) {
      setError('El motivo de desimputación es obligatorio.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: rpcErr } = await supabase.rpc('rpc_reverse_imputation', {
        p_movement_id: selectedMovementId,
        p_reason: reason.trim(),
      });

      if (rpcErr) throw rpcErr;

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error in desimputation:', err);
      setError(err.message || 'Error al procesar la desimputación');
    } finally {
      setLoading(false);
    }
  };

  const selectedMov = imputations.find((m) => m.movement_id === selectedMovementId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Undo2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Desimputar / Reversión de Imputación</h2>
              <p className="text-xs text-slate-400">
                Genera un contra-asiento APL compensatorio restaurando la deuda y el crédito libre
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Seleccionar Renglón de Imputación a Neutralizar ({imputations.length})
          </div>

          {imputations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 italic bg-slate-800/20 rounded-xl border border-slate-800">
              No hay imputaciones activas registradas para este proveedor.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {imputations.map((mov) => {
                const isSelected = selectedMovementId === mov.movement_id;
                return (
                  <div
                    key={mov.movement_id}
                    onClick={() => setSelectedMovementId(mov.movement_id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-violet-500/10 border-violet-500 text-white shadow-md'
                        : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-white text-xs">
                          {mov.document_human_ref}
                        </span>
                        <ArrowDownRight className="w-3.5 h-3.5 text-violet-400" />
                        <span className="font-mono text-xs text-sky-300">
                          {mov.reference_human_ref}
                        </span>
                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700 font-sans">
                          {mov.movement_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Fecha: <span className="font-mono text-slate-300">{formatDate(mov.movement_date)}</span> •
                        Renglón ID: <span className="font-mono">#{mov.movement_id}</span>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <span className="text-[10px] text-slate-400 block font-sans">Importe Imputado</span>
                      <span className="font-bold text-emerald-400 text-sm">
                        {formatMoney(Math.abs(mov.amount))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedMov && (
            <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60 text-slate-300 text-xs space-y-1">
              <span className="font-bold text-white block">Efecto del Contra-Asiento APL Compensatorio:</span>
              <div>• Restaura la deuda en <strong className="font-mono text-rose-300">{selectedMov.reference_human_ref}</strong> por <strong>+{formatMoney(Math.abs(selectedMov.amount))}</strong></div>
              <div>• Restaura el crédito disponible en <strong className="font-mono text-emerald-300">{selectedMov.document_human_ref}</strong> por <strong>-{formatMoney(Math.abs(selectedMov.amount))}</strong></div>
              <div className="text-slate-500 text-[10px] pt-1">Suma del APL Compensatorio: $0.00 (El saldo global del proveedor permanece idéntico).</div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Motivo Obligatorio de Desimputación *
            </label>
            <textarea
              required
              rows={2}
              placeholder="Describa el motivo por el cual se desimputa este pago (ej: Imputación errónea de factura, refacturación)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-violet-500/50"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading || !selectedMovementId || !reason.trim()}
              className="flex items-center space-x-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-violet-900/30 transition-all disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              <span>{loading ? 'Procesando...' : 'Confirmar Desimputación (APL Compensatorio)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
