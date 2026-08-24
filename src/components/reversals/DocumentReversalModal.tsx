import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentSummaryView } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, RotateCcw, AlertTriangle, Check, ShieldAlert } from 'lucide-react';

interface DocumentReversalModalProps {
  document: DocumentSummaryView | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const DocumentReversalModal: React.FC<DocumentReversalModalProps> = ({
  document,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !document) return null;

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Debe especificar un motivo obligatorio para autorizar la reversión.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: rpcErr } = await supabase.rpc('rpc_reverse_document', {
        p_document_id: document.document_id,
        p_reason: reason.trim(),
      });

      if (rpcErr) throw rpcErr;

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error reverting document:', err);
      setError(err.message || 'Error al procesar la reversión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-rose-950/30">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Reversión de Comprobante</h2>
              <p className="text-xs text-rose-300">Anulación mediante emisión de Ajuste Compensatorio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleReverse} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Document Summary Card */}
          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-white text-sm">
                {document.human_reference}
              </span>
              <span className="text-[10px] bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded border border-rose-500/20">
                {document.document_type_name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 font-mono">
              <div>
                Emisión: <span className="text-slate-200">{formatDate(document.issue_date)}</span>
              </div>
              <div className="text-right">
                Importe: <strong className="text-white">{formatMoney(document.total_amount)}</strong>
              </div>
              <div>
                Saldo Referencia: <span className="text-rose-400 font-bold">{formatMoney(document.reference_balance)}</span>
              </div>
              <div className="text-right text-slate-500">
                ID #{document.document_id}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Principio de Inmutabilidad:</strong> El comprobante original no será eliminado. El sistema generará un comprobante compensatorio <strong className="font-mono">REV-{document.human_reference}</strong> que neutralizará el saldo de la referencia a $0.00.
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Motivo Obligatorio de Anulación / Reversión *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Explique el motivo por el cual se revierte este comprobante (ej: Error en concepto o importe cargado)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-rose-500/50"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="flex items-center space-x-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Revirtiendo...' : 'Confirmar Reversión'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
