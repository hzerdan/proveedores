import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier, DocumentSummaryView } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, Receipt, Check, AlertCircle } from 'lucide-react';

interface PaymentOrderModalProps {
  initialSupplierId?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface TargetItem {
  doc: DocumentSummaryView;
  appliedAmount: string;
}

export const PaymentOrderModal: React.FC<PaymentOrderModalProps> = ({
  initialSupplierId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>(initialSupplierId || '');
  const [pointOfSale, setPointOfSale] = useState('0001');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalAmount, setTotalAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [notes, setNotes] = useState('');
  const [targetItems, setTargetItems] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('trade_name')
      .then(({ data }) => {
        if (data) setSuppliers(data);
      });
  }, []);

  useEffect(() => {
    if (initialSupplierId) setSupplierId(initialSupplierId);
  }, [initialSupplierId]);

  useEffect(() => {
    if (!supplierId || !isOpen) {
      setTargetItems([]);
      return;
    }

    const fetchPendingInvoices = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('v_document_summary')
          .select('*')
          .eq('supplier_id', supplierId)
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
        console.error('Error fetching pending invoices for OP:', err);
      }
    };

    fetchPendingInvoices();
  }, [supplierId, isOpen]);

  if (!isOpen) return null;

  const numTotalAmount = parseFloat(totalAmount) || 0;

  const totalImputed = targetItems.reduce((acc, curr) => {
    const num = parseFloat(curr.appliedAmount);
    return acc + (isNaN(num) || num <= 0 ? 0 : num);
  }, 0);

  const remainder = Math.max(0, numTotalAmount - totalImputed);

  const handleAmountChange = (index: number, val: string) => {
    const updated = [...targetItems];
    updated[index].appliedAmount = val;
    setTargetItems(updated);
  };

  const handleApplyFullDebt = (index: number) => {
    const item = targetItems[index];
    const availableToImpute = Math.max(0, numTotalAmount - totalImputed + (parseFloat(item.appliedAmount) || 0));
    const maxApplicable = Math.min(item.doc.reference_balance, availableToImpute > 0 ? availableToImpute : item.doc.reference_balance);
    handleAmountChange(index, maxApplicable.toString());
  };

  const humanRef = `OP ${pointOfSale.padStart(4, '0')}-${documentNumber ? documentNumber.padStart(8, '0') : '00000000'}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supplierId || !totalAmount || numTotalAmount <= 0) {
      setError('Ingrese un proveedor e importe total válido mayor a 0.');
      return;
    }

    if (totalImputed > numTotalAmount) {
      setError(`El total a imputar (${formatMoney(totalImputed)}) supera el total de la Orden de Pago (${formatMoney(numTotalAmount)}).`);
      return;
    }

    setLoading(true);

    try {
      // 1. Get OP Document Type ID
      const { data: dtData } = await supabase
        .from('document_types')
        .select('id')
        .eq('code', 'ORDEN_PAGO')
        .single();

      if (!dtData) throw new Error('Tipo de documento ORDEN_PAGO no encontrado.');

      // 2. Prepare Imputations Payload
      const validImputations = targetItems
        .filter((t) => {
          const num = parseFloat(t.appliedAmount);
          return !isNaN(num) && num > 0;
        })
        .map((t) => ({
          target_document_id: t.doc.document_id,
          applied_amount: parseFloat(t.appliedAmount),
        }));

      // 3. Call RPC rpc_create_and_confirm_op
      const { error: rpcErr } = await supabase.rpc('rpc_create_and_confirm_op', {
        p_supplier_id: Number(supplierId),
        p_document_type_id: dtData.id,
        p_point_of_sale: parseInt(pointOfSale, 10) || 1,
        p_document_number: parseInt(documentNumber, 10) || Math.floor(Math.random() * 900000 + 100000),
        p_human_reference: humanRef,
        p_issue_date: issueDate,
        p_total_amount: numTotalAmount,
        p_concept: concept.trim() || null,
        p_notes: notes.trim() || null,
        p_imputations: validImputations,
      });

      if (rpcErr) throw rpcErr;

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error creating OP:', err);
      setError(err.message || 'Error al procesar la Orden de Pago');
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
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Nueva Orden de Pago (OP)</h2>
              <p className="text-xs text-slate-400">
                Imputación nativa directa a facturas o generación de remanente propio
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Supplier & Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Proveedor *
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="" disabled>-- Seleccione proveedor --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.trade_name} ({s.tax_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Fecha de Emisión *
              </label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Numbering & Total Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-800/30 p-3.5 rounded-xl border border-slate-700/40">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Pto. Venta / POS
              </label>
              <input
                type="number"
                value={pointOfSale}
                onChange={(e) => setPointOfSale(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Número de OP
              </label>
              <input
                type="number"
                placeholder="ej: 20001"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                Importe Total OP * ($)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full bg-slate-800 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Live Balance Distribution Tracker */}
          <div className="grid grid-cols-3 gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60 font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Total de la Orden de Pago</span>
              <span className="font-bold text-white text-sm">
                {formatMoney(numTotalAmount)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Imputado a Facturas</span>
              <span className="font-bold text-emerald-400 text-sm">
                {formatMoney(totalImputed)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Remanente Propio Libre</span>
              <span className={`font-bold text-sm ${totalImputed > numTotalAmount ? 'text-rose-400' : 'text-slate-300'}`}>
                {formatMoney(remainder)}
              </span>
            </div>
          </div>

          {/* Pending Invoices Selection */}
          <div className="space-y-2 pt-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Seleccionar Facturas a Cancelar al Nacer</span>
              <span className="text-[10px] text-slate-500 font-normal">
                {targetItems.length} facturas pendientes con saldo
              </span>
            </div>

            {targetItems.length === 0 ? (
              <div className="p-6 text-center text-slate-500 italic bg-slate-800/20 rounded-xl border border-slate-800">
                {supplierId
                  ? 'No hay facturas pendientes con deuda. La OP se guardará como un Anticipo Libre al 100%.'
                  : 'Seleccione un proveedor para cargar facturas pendientes.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {targetItems.map((item, idx) => (
                  <div
                    key={item.doc.document_id}
                    className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-600 transition-colors"
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
                        Deuda: <span className="font-mono font-bold text-rose-400">{formatMoney(item.doc.reference_balance)}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => handleApplyFullDebt(idx)}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-semibold"
                      >
                        Saldar
                      </button>

                      <div className="relative w-32">
                        <span className="absolute left-2 top-1.5 text-slate-400 font-mono">$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={item.appliedAmount}
                          onChange={(e) => handleAmountChange(idx, e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-5 pr-2 py-1 font-mono text-right text-white text-xs focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Concept & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Concepto / Referencia
              </label>
              <input
                type="text"
                placeholder="ej: Pago a cuenta de mercaderías"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Observaciones
              </label>
              <input
                type="text"
                placeholder="ej: Transferencia Banco Galicia #4829"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white"
              />
            </div>
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
              disabled={loading || numTotalAmount <= 0 || totalImputed > numTotalAmount}
              className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Confirmando...' : `Confirmar Orden de Pago (${formatMoney(numTotalAmount)})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
