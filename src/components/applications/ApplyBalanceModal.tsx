import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentSummaryView } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, Layers, Check, AlertCircle } from 'lucide-react';

interface ApplyBalanceModalProps {
  sourceDoc: DocumentSummaryView | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface TargetItem {
  doc: DocumentSummaryView;
  appliedAmount: string;
}

export const ApplyBalanceModal: React.FC<ApplyBalanceModalProps> = ({
  sourceDoc,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [targetItems, setTargetItems] = useState<TargetItem[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceDoc || !isOpen) return;

    const fetchPendingDebits = async () => {
      setLoading(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('v_document_summary')
          .select('*')
          .eq('supplier_id', sourceDoc.supplier_id)
          .eq('balance_nature', 'DEBIT')
          .gt('reference_balance', 0)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('issue_date', { ascending: true });

        if (fetchErr) throw fetchErr;

        setTargetItems(
          (data || []).map((d: DocumentSummaryView) => ({
            doc: d,
            appliedAmount: '',
          }))
        );
      } catch (err) {
        console.error('Error fetching pending debits for APL:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingDebits();
    setError(null);
  }, [sourceDoc, isOpen]);

  if (!isOpen || !sourceDoc) return null;

  const availableCredit = Math.abs(sourceDoc.reference_balance);

  const totalToApply = targetItems.reduce((acc, curr) => {
    const num = parseFloat(curr.appliedAmount);
    return acc + (isNaN(num) || num <= 0 ? 0 : num);
  }, 0);

  const availableCreditRemaining = availableCredit - totalToApply;

  const handleAmountChange = (index: number, val: string) => {
    const updated = [...targetItems];
    updated[index].appliedAmount = val;
    setTargetItems(updated);
  };

  const handleApplyFullDebt = (index: number) => {
    const item = targetItems[index];
    const available = availableCreditRemaining + (parseFloat(item.appliedAmount) || 0);
    const maxApplicable = Math.min(item.doc.reference_balance, available);
    handleAmountChange(index, maxApplicable.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validApplications = targetItems
      .filter((t) => {
        const num = parseFloat(t.appliedAmount);
        return !isNaN(num) && num > 0;
      })
      .map((t) => ({
        target_document_id: t.doc.document_id,
        applied_amount: parseFloat(t.appliedAmount),
      }));

    if (validApplications.length === 0) {
      setError('Debe asignar un importe a aplicar a al menos una factura.');
      return;
    }

    if (totalToApply > availableCredit) {
      setError(`El total a aplicar (${formatMoney(totalToApply)}) supera el saldo disponible (${formatMoney(availableCredit)}).`);
      return;
    }

    setLoading(true);

    try {
      const { error: rpcErr } = await supabase.rpc('rpc_apply_existing_balance', {
        p_source_document_id: sourceDoc.document_id,
        p_target_applications: validApplications,
        p_notes: notes.trim() || null,
      });

      if (rpcErr) throw rpcErr;

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error applying balance via APL:', err);
      setError(err.message || 'Error al generar la aplicación APL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Transferir Saldo (Documento APL)</h2>
              <p className="text-xs text-slate-400">
                Origen: <span className="font-mono text-emerald-400 font-bold">{sourceDoc.human_reference}</span> • Disponible:{' '}
                <span className="font-mono font-bold text-white">{formatMoney(availableCredit)}</span>
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

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Balance Tracker Banner */}
          <div className="grid grid-cols-3 gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60 font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Crédito Disponible Origen</span>
              <span className="font-bold text-white text-sm">
                {formatMoney(availableCredit)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Total a Transferir (APL)</span>
              <span className="font-bold text-emerald-400 text-sm">
                {formatMoney(totalToApply)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Remanente Restante</span>
              <span className={`font-bold text-sm ${availableCreditRemaining < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {formatMoney(availableCreditRemaining)}
              </span>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-2">
            Seleccionar Facturas / Débitos a Cancelar
          </div>

          {targetItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 italic bg-slate-800/20 rounded-xl border border-slate-800">
              No existen facturas o débitos con saldo pendiente para este proveedor.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {targetItems.map((item, idx) => (
                <div
                  key={item.doc.document_id}
                  className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-600 transition-colors"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-white text-xs">
                        {item.doc.human_reference}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        #{item.doc.document_id}
                      </span>
                      <span className="text-[10px] bg-rose-500/10 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/20">
                        {item.doc.document_type_name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Emisión: <span className="font-mono text-slate-300">{formatDate(item.doc.issue_date)}</span> •
                      Deuda Pendiente: <span className="font-mono font-bold text-rose-400">{formatMoney(item.doc.reference_balance)}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => handleApplyFullDebt(idx)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-semibold transition-colors"
                    >
                      Saldar Total
                    </button>

                    <div className="relative w-36">
                      <span className="absolute left-2.5 top-2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={item.appliedAmount}
                        onChange={(e) => handleAmountChange(idx, e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-6 pr-2.5 py-1.5 font-mono text-right text-white focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Observaciones del APL
            </label>
            <input
              type="text"
              placeholder="ej: Aplicación de anticipo a facturas de agosto"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white"
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
              disabled={loading || totalToApply <= 0 || totalToApply > availableCredit}
              className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Generando APL...' : `Confirmar APL (${formatMoney(totalToApply)})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
