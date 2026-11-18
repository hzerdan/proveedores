import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier, DocumentSummaryView, DocumentNumberingSeries, NumberingMode, DocumentType } from '../../types/database';
import { SeriesSelector } from './SeriesSelector';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, Receipt, Check, AlertCircle, Tag } from 'lucide-react';

interface PaymentOrderModalProps {
  initialSupplierId?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface TargetItem {
  doc: DocumentSummaryView;
  appliedAmount: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: string;
}

export const PaymentOrderModal: React.FC<PaymentOrderModalProps> = ({
  initialSupplierId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>(initialSupplierId || '');
  const [opDocType, setOpDocType] = useState<DocumentType | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<DocumentNumberingSeries | null>(null);
  const [numberingMode, setNumberingMode] = useState<NumberingMode>('INTERNAL_SEQUENCE');
  const [seriesList, setSeriesList] = useState<DocumentNumberingSeries[]>([]);
  const [pointOfSale, setPointOfSale] = useState('0100');
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

    supabase
      .from('document_types')
      .select('*')
      .eq('code', 'ORDEN_PAGO')
      .single()
      .then(({ data }) => {
        if (data) {
          setOpDocType(data as DocumentType);
          setNumberingMode((data.numbering_mode as NumberingMode) || 'INTERNAL_SEQUENCE');
        }
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
          .eq('balance_nature', 'DEBIT')
          .eq('supplier_id', supplierId)
          .gt('reference_balance', 0)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('issue_date', { ascending: true });

        if (fetchErr) throw fetchErr;

        setTargetItems(
          (data || []).map((d: DocumentSummaryView) => ({
            doc: d,
            appliedAmount: '',
            discountType: 'PERCENT',
            discountValue: '',
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

  const getItemDiscountAmount = (item: TargetItem): number => {
    const val = parseFloat(item.discountValue);
    if (isNaN(val) || val <= 0) return 0;
    if (item.discountType === 'PERCENT') {
      const pct = Math.min(100, Math.max(0, val));
      return Math.round(item.doc.reference_balance * (pct / 100) * 100) / 100;
    }
    return Math.min(item.doc.reference_balance, Math.max(0, Math.round(val * 100) / 100));
  };

  const totalDiscount = targetItems.reduce((acc, curr) => acc + getItemDiscountAmount(curr), 0);

  const totalImputed = targetItems.reduce((acc, curr) => {
    const num = parseFloat(curr.appliedAmount);
    return acc + (isNaN(num) ? 0 : num);
  }, 0);

  const totalDebtCancelled = totalImputed + totalDiscount;
  const remainder = Math.max(0, numTotalAmount - totalImputed);

  const handleAmountChange = (index: number, val: string) => {
    const updated = [...targetItems];
    const item = updated[index];
    const discAmt = getItemDiscountAmount(item);
    const maxAllowed = Math.round((item.doc.reference_balance - discAmt) * 100) / 100;
    const numVal = parseFloat(val);

    if (!isNaN(numVal) && numVal > maxAllowed + 0.001) {
      updated[index] = { ...item, appliedAmount: maxAllowed > 0 ? maxAllowed.toFixed(2) : '' };
    } else {
      updated[index] = { ...item, appliedAmount: val };
    }
    setTargetItems(updated);
  };

  const handleDiscountTypeChange = (index: number, type: 'PERCENT' | 'FIXED') => {
    const updated = [...targetItems];
    const item = { ...updated[index], discountType: type };
    const discAmt = getItemDiscountAmount(item);
    const currentApplied = parseFloat(item.appliedAmount) || 0;
    const maxAllowedApplied = Math.round((item.doc.reference_balance - discAmt) * 100) / 100;

    if (currentApplied > 0 && currentApplied > maxAllowedApplied) {
      item.appliedAmount = maxAllowedApplied > 0 ? maxAllowedApplied.toFixed(2) : '';
    }

    updated[index] = item;
    setTargetItems(updated);
  };

  const handleDiscountValueChange = (index: number, val: string) => {
    const updated = [...targetItems];
    const item = { ...updated[index], discountValue: val };
    const discAmt = getItemDiscountAmount(item);
    const currentApplied = parseFloat(item.appliedAmount) || 0;
    const maxAllowedApplied = Math.round((item.doc.reference_balance - discAmt) * 100) / 100;

    if (currentApplied > 0 && currentApplied > maxAllowedApplied) {
      item.appliedAmount = maxAllowedApplied > 0 ? maxAllowedApplied.toFixed(2) : '';
    }

    updated[index] = item;
    setTargetItems(updated);
  };

  const [expandedDiscounts, setExpandedDiscounts] = useState<Record<number, boolean>>({});

  const toggleDiscount = (docId: number, index: number) => {
    setExpandedDiscounts((prev) => {
      const nextState = !prev[docId];
      if (!nextState) {
        handleDiscountValueChange(index, '');
      }
      return { ...prev, [docId]: nextState };
    });
  };

  const handleApplyPercentPayment = (index: number, pct: number) => {
    const item = targetItems[index];
    const discAmt = getItemDiscountAmount(item);
    const netDebt = Math.max(0, Math.round((item.doc.reference_balance - discAmt) * 100) / 100);
    const calculatedPayment = Math.round(netDebt * (pct / 100) * 100) / 100;
    handleAmountChange(index, calculatedPayment > 0 ? calculatedPayment.toFixed(2) : '');
  };

  const handleApplyFullDebt = (index: number) => {
    const item = targetItems[index];
    const discAmt = getItemDiscountAmount(item);
    const netDebt = Math.max(0, Math.round((item.doc.reference_balance - discAmt) * 100) / 100);
    const availableToImpute = Math.max(0, numTotalAmount - totalImputed + (parseFloat(item.appliedAmount) || 0));
    const maxApplicable = Math.min(netDebt, availableToImpute > 0 ? availableToImpute : netDebt);
    handleAmountChange(index, maxApplicable > 0 ? maxApplicable.toFixed(2) : '');
  };

  const handleSyncTotalAmount = () => {
    setTotalAmount(totalImputed > 0 ? totalImputed.toFixed(2) : '');
  };

  const padPos = (pointOfSale || '1').padStart(4, '0');
  const padDoc = (documentNumber || '1').padStart(8, '0');
  const humanRef = `OP-${padPos}-${padDoc}`;

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

    for (const t of targetItems) {
      const app = parseFloat(t.appliedAmount) || 0;
      const disc = getItemDiscountAmount(t);
      if (app + disc > t.doc.reference_balance + 0.01) {
        setError(`En la factura ${t.doc.human_reference}, la suma de pago (${formatMoney(app)}) y descuento (${formatMoney(disc)}) excede la deuda actual (${formatMoney(t.doc.reference_balance)}).`);
        return;
      }
    }

    // Numbering series validation
    if (numberingMode === 'INTERNAL_SEQUENCE') {
      if (seriesList.length === 0) {
        setError('Bloqueado: No existen series activas configuradas para Órdenes de Pago. Configure una serie antes de emitir.');
        return;
      }
      if (seriesList.length > 1 && !selectedSeries) {
        setError('Debe seleccionar obligatoriamente una serie activa para la Orden de Pago.');
        return;
      }
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

      // 2. Prepare Imputations Payload (applied amount and discount amount)
      const validImputations = targetItems
        .filter((t) => {
          const num = parseFloat(t.appliedAmount) || 0;
          const disc = getItemDiscountAmount(t);
          return num > 0 || disc > 0;
        })
        .map((t) => ({
          target_document_id: t.doc.document_id,
          applied_amount: parseFloat(t.appliedAmount) || 0,
          discount_amount: getItemDiscountAmount(t),
          discount_percentage: t.discountType === 'PERCENT' ? (parseFloat(t.discountValue) || null) : null,
        }));

      // 3. Call RPC rpc_create_and_confirm_op
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_create_and_confirm_op', {
        p_supplier_id: Number(supplierId),
        p_document_type_id: dtData.id,
        p_point_of_sale: numberingMode === 'INTERNAL_SEQUENCE' ? null : (parseInt(pointOfSale, 10) || 1),
        p_document_number: numberingMode === 'INTERNAL_SEQUENCE' ? null : (parseInt(documentNumber, 10) || null),
        p_human_reference: numberingMode === 'INTERNAL_SEQUENCE' ? null : humanRef,
        p_issue_date: issueDate,
        p_total_amount: numTotalAmount,
        p_concept: concept.trim() || null,
        p_notes: notes.trim() || null,
        p_imputations: validImputations,
        p_numbering_series_id: numberingMode === 'INTERNAL_SEQUENCE' ? (selectedSeries?.id || null) : null,
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
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Nueva Orden de Pago (OP)</h2>
              <p className="text-xs text-slate-400">
                Imputación directa a facturas, cálculo de descuentos y emisión de NND
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
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-3.5 flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Fila 1: Proveedor & Fecha de Emisión (con tipografía Sans de alta legibilidad para 0 vs 8) */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Proveedor *
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-sans text-xs focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="" disabled>-- Seleccione proveedor --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.trade_name} ({s.tax_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Fecha de Emisión *
              </label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-sans font-medium text-xs tracking-wider focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Fila 2: Punto de Venta / Serie & Importe Total OP integrados en una sola fila compacta */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            <div className={numberingMode === 'EXTERNAL' ? 'lg:col-span-7' : 'lg:col-span-7'}>
              {numberingMode === 'INTERNAL_SEQUENCE' ? (
                <SeriesSelector
                  documentTypeId={opDocType?.id || null}
                  selectedSeriesId={selectedSeries?.id || null}
                  onSelectSeries={setSelectedSeries}
                  onModeLoaded={(mode, sList) => {
                    setNumberingMode(mode);
                    setSeriesList(sList);
                  }}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 h-full">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Pto. Venta / POS
                    </label>
                    <input
                      type="number"
                      value={pointOfSale}
                      onChange={(e) => setPointOfSale(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-sans font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-sans font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/60 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    Importe Total OP * ($)
                  </label>
                  {totalImputed > 0 && Math.abs(numTotalAmount - totalImputed) > 0.009 && (
                    <span className="text-[10px] text-amber-400 font-sans font-medium">
                      ≠ Imputado ({formatMoney(totalImputed)})
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1.5 text-emerald-400 font-sans font-bold text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg pl-7 pr-3 py-1.5 text-white font-sans font-bold text-sm tabular-nums focus:ring-2 focus:ring-emerald-500 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Monitor Compacto de Distribución de Fondos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-800/30 p-2.5 rounded-xl border border-slate-700/50 font-sans">
            <div>
              <span className="text-[10px] text-slate-400 block">Total OP (Erogación)</span>
              <span className="font-bold text-white text-xs tabular-nums">
                {formatMoney(numTotalAmount)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block">Imputado con OP</span>
              <span className="font-bold text-emerald-400 text-xs tabular-nums">
                {formatMoney(totalImputed)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block">Descuentos (NND)</span>
              <span className={`font-bold text-xs tabular-nums ${totalDiscount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {formatMoney(totalDiscount)}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block">Remanente Libre OP</span>
              <span className={`font-bold text-xs tabular-nums ${totalImputed > numTotalAmount ? 'text-rose-400' : 'text-slate-300'}`}>
                {formatMoney(remainder)}
              </span>
            </div>
          </div>

          {/* Sección de Facturas con Scroll Dedicado */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Seleccionar Facturas a Cancelar al Nacer</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-normal">
                  {targetItems.length} pendientes
                </span>
              </div>
            </div>

            {targetItems.length === 0 ? (
              <div className="p-6 text-center text-slate-500 italic bg-slate-800/20 rounded-xl border border-slate-800">
                {supplierId
                  ? 'No hay facturas pendientes con deuda. La OP se guardará como un Anticipo Libre al 100%.'
                  : 'Seleccione un proveedor para cargar facturas pendientes.'}
              </div>
            ) : (
              <>
                {/* Contenedor scrolleable con altura ampliada */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1.5 scrollbar-thin">
                  {targetItems.map((item, idx) => {
                    const itemDiscount = getItemDiscountAmount(item);
                    const itemApplied = parseFloat(item.appliedAmount) || 0;
                    const itemTotalCancelled = itemApplied + itemDiscount;
                    const isOverDebt = itemTotalCancelled > item.doc.reference_balance + 0.01;
                    const isFullySettled = Math.abs(itemTotalCancelled - item.doc.reference_balance) < 0.01;

                    return (
                      <div
                        key={item.doc.document_id}
                        className={`p-3 rounded-xl border transition-colors ${
                          isOverDebt
                            ? 'bg-rose-950/20 border-rose-500/40'
                            : isFullySettled
                            ? 'bg-emerald-950/20 border-emerald-500/40'
                            : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                          {/* Document Info */}
                          <div className="min-w-[210px]">
                            <div className="flex items-center space-x-2">
                              <span className="font-sans font-bold text-white text-xs tracking-wide">
                                {item.doc.human_reference}
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans">
                                #{item.doc.document_id}
                              </span>
                              <span className="text-[10px] bg-rose-500/10 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/20 font-medium">
                                {item.doc.document_type_name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 font-sans">
                              <span>Emisión: <span className="font-medium text-slate-300">{formatDate(item.doc.issue_date)}</span></span>
                              <span>•</span>
                              <span>Deuda: <span className="font-bold text-rose-400 tabular-nums">{formatMoney(item.doc.reference_balance)}</span></span>
                            </div>
                            {itemDiscount > 0 && (
                              <div className="mt-1 text-[10px] text-amber-300 font-sans flex items-center gap-1.5">
                                <span>Desc NND: -{formatMoney(itemDiscount)}</span>
                                <span className="text-slate-500">|</span>
                                <span className="text-slate-300">Neto a pagar: {formatMoney(Math.max(0, item.doc.reference_balance - itemDiscount))}</span>
                              </div>
                            )}
                          </div>

                          {/* Action Controls: Descuento Comercial (NND) & Pago con OP */}
                          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto justify-end">
                            {/* Bloque Descuento Comercial / NND (Opcional y claramente rotulado) */}
                            {expandedDiscounts[item.doc.document_id] || (item.discountValue && parseFloat(item.discountValue) > 0) ? (
                              <div className="flex items-center bg-amber-950/40 p-1.5 rounded-xl border border-amber-500/40 gap-1.5 shadow-sm">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-amber-300 uppercase tracking-tight pl-0.5">
                                    Descuento NND
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <div className="flex rounded overflow-hidden border border-amber-600/60 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => handleDiscountTypeChange(idx, 'PERCENT')}
                                        className={`px-1.5 py-0.5 font-bold transition-colors ${
                                          item.discountType === 'PERCENT'
                                            ? 'bg-amber-500 text-slate-950 font-black'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                        title="Descuento porcentual (%)"
                                      >
                                        %
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDiscountTypeChange(idx, 'FIXED')}
                                        className={`px-1.5 py-0.5 font-bold transition-colors ${
                                          item.discountType === 'FIXED'
                                            ? 'bg-amber-500 text-slate-950 font-black'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                        title="Descuento monto fijo ($)"
                                      >
                                        $
                                      </button>
                                    </div>

                                    <div className="relative w-16">
                                      <input
                                        type="number"
                                        step={item.discountType === 'PERCENT' ? '0.1' : '0.01'}
                                        min="0"
                                        max={item.discountType === 'PERCENT' ? '100' : undefined}
                                        placeholder={item.discountType === 'PERCENT' ? '0%' : '0.00'}
                                        value={item.discountValue}
                                        onChange={(e) => handleDiscountValueChange(idx, e.target.value)}
                                        className="w-full bg-slate-900 border border-amber-500/50 rounded px-1.5 py-0.5 font-sans font-bold text-right text-amber-300 text-xs tabular-nums focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        title={item.discountType === 'PERCENT' ? 'Porcentaje de descuento comercial' : 'Monto de descuento comercial'}
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => toggleDiscount(item.doc.document_id, idx)}
                                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                                      title="Quitar descuento comercial"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleDiscount(item.doc.document_id, idx)}
                                className="px-2 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold transition-all flex items-center gap-1 shadow-sm"
                                title="Agregar quita o descuento comercial mediante Nota de Débito interna (NND)"
                              >
                                <Tag className="w-3 h-3" />
                                <span>+ Descuento NND</span>
                              </button>
                            )}

                            {/* Bloque Pago con Orden de Pago */}
                            <div className="flex flex-col items-end">
                              <div className="flex items-center justify-between w-full mb-0.5">
                                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-tight">
                                  Pago OP ($)
                                </span>
                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApplyPercentPayment(idx, 10)}
                                    className="text-[9px] px-1 py-0.2 bg-slate-800 hover:bg-emerald-950 text-slate-300 hover:text-emerald-300 rounded border border-slate-700 transition-colors"
                                    title="Pagar el 10% de esta factura con la OP"
                                  >
                                    10%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyPercentPayment(idx, 50)}
                                    className="text-[9px] px-1 py-0.2 bg-slate-800 hover:bg-emerald-950 text-slate-300 hover:text-emerald-300 rounded border border-slate-700 transition-colors"
                                    title="Pagar el 50% de esta factura con la OP"
                                  >
                                    50%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyFullDebt(idx)}
                                    className="text-[9px] px-1.5 py-0.2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 font-bold rounded border border-emerald-500/40 transition-colors"
                                    title="Saldar el 100% neto pendiente con la OP"
                                  >
                                    Saldar
                                  </button>
                                </div>
                              </div>

                              <div className="relative w-32 shrink-0">
                                <span className="absolute left-2.5 top-1 text-emerald-400 font-sans text-xs">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={item.appliedAmount}
                                  onChange={(e) => handleAmountChange(idx, e.target.value)}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-5 pr-2 py-1 font-sans font-bold text-right text-white text-xs tabular-nums focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Importe a cancelar desde la Orden de Pago"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Barra de Subtotal y Botón para Igualar Total OP */}
                <div className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Subtotal Imputado OP</span>
                      <span className="font-bold text-emerald-400 font-sans tabular-nums text-sm">
                        {formatMoney(totalImputed)}
                      </span>
                    </div>

                    {totalDiscount > 0 && (
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Descuentos NND</span>
                        <span className="font-bold text-amber-400 font-sans tabular-nums text-sm">
                          {formatMoney(totalDiscount)}
                        </span>
                      </div>
                    )}

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Total Cancelado</span>
                      <span className="font-bold text-white font-sans tabular-nums text-sm">
                        {formatMoney(totalDebtCancelled)}
                      </span>
                    </div>
                  </div>

                  {/* Botón para igualar el total de la OP al subtotal imputado */}
                  {totalImputed > 0 && Math.abs(numTotalAmount - totalImputed) > 0.009 && (
                    <button
                      type="button"
                      onClick={handleSyncTotalAmount}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/30 text-xs font-bold transition-all shadow-md shadow-emerald-950/40 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                      title="Copiar el subtotal imputado al campo Importe Total de la OP"
                    >
                      <span>⚡ Igualar Importe OP a {formatMoney(totalImputed)}</span>
                    </button>
                  )}
                </div>

                {/* Banner de NND reubicado debajo del Subtotal */}
                {totalDiscount > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300 animate-in fade-in">
                    <div className="flex items-center gap-2.5">
                      <Receipt className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Se emitirá automáticamente una <strong>Nuestra Nota de Débito (NND)</strong> por <strong>{formatMoney(totalDiscount)}</strong> para documentar el descuento comercial.
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded text-amber-200 shrink-0">
                      NND Automática
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Concepto & Observaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Concepto / Referencia
              </label>
              <input
                type="text"
                placeholder="ej: Pago a cuenta de mercaderías"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs"
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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs"
              />
            </div>
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
