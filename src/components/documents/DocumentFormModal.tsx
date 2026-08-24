import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier, DocumentType, IntakeSource } from '../../types/database';
import { DuplicateWarningModal } from './DuplicateWarningModal';
import { SupplierQuickCreateModal } from '../suppliers/SupplierQuickCreateModal';
import { ExtractedInvoicePayload } from '../../lib/aiExtractor';
import { cleanCuit } from '../../lib/cuitValidator';
import {
  X,
  FilePlus,
  Check,
  AlertCircle,
  Sparkles,
  Plus,
  Building2,
  AlertTriangle,
} from 'lucide-react';

interface DocumentFormModalProps {
  initialSupplierId?: number | null;
  initialData?: ExtractedInvoicePayload | null;
  fileId?: number | null;
  intakeSource?: IntakeSource;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const DocumentFormModal: React.FC<DocumentFormModalProps> = ({
  initialSupplierId,
  initialData,
  fileId,
  intakeSource = 'MANUAL',
  isOpen,
  onClose,
  onSaved,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);

  // Form fields
  const [supplierId, setSupplierId] = useState<number | ''>(initialSupplierId || '');
  const [documentTypeId, setDocumentTypeId] = useState<number | ''>('');
  const [letter, setLetter] = useState('A');
  const [pointOfSale, setPointOfSale] = useState('0001');
  const [documentNumber, setDocumentNumber] = useState('');
  const [customReference, setCustomReference] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [totalAmount, setTotalAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [notes, setNotes] = useState('');

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<any | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [unrecognizedSupplier, setUnrecognizedSupplier] = useState<{
    taxId: string;
    name: string;
  } | null>(null);

  const fetchSuppliersAndTypes = async () => {
    const { data: sups } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('trade_name');

    if (sups) setSuppliers(sups);

    const { data: types } = await supabase
      .from('document_types')
      .select('*')
      .eq('is_active', true)
      .neq('code', 'ORDEN_PAGO')
      .neq('code', 'APL')
      .order('id');

    if (types) {
      setDocTypes(types);
      if (types.length > 0 && !documentTypeId) {
        setDocumentTypeId(types[0].id);
      }
    }
  };

  useEffect(() => {
    fetchSuppliersAndTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Populate from initialData (AI Extraction)
  useEffect(() => {
    if (!initialData) return;

    if (initialData.document) {
      const doc = initialData.document;
      if (doc.letter) setLetter(doc.letter);
      if (doc.point_of_sale) setPointOfSale(doc.point_of_sale.toString().padStart(4, '0'));
      if (doc.document_number) setDocumentNumber(doc.document_number.toString());
      if (doc.issue_date) setIssueDate(doc.issue_date);
      if (doc.due_date) setDueDate(doc.due_date);
      if (doc.currency) setCurrency(doc.currency);
      if (doc.total_amount) setTotalAmount(doc.total_amount.toString());
      if (doc.concept) setConcept(doc.concept);

      // Match type
      if (doc.type_code && docTypes.length > 0) {
        const matched = docTypes.find((t) => t.code === doc.type_code);
        if (matched) setDocumentTypeId(matched.id);
      }
    }

    // Match Supplier
    if (initialData.supplier && initialData.supplier.tax_id && suppliers.length > 0) {
      const cleanTaxId = cleanCuit(initialData.supplier.tax_id);
      const found = suppliers.find(
        (s) => cleanCuit(s.tax_id) === cleanTaxId
      );

      if (found) {
        setSupplierId(found.id);
        setUnrecognizedSupplier(null);
      } else {
        setUnrecognizedSupplier({
          taxId: initialData.supplier.tax_id,
          name: initialData.supplier.trade_name || initialData.supplier.legal_name || 'Nuevo Proveedor',
        });
      }
    }
  }, [initialData, suppliers, docTypes]);

  useEffect(() => {
    if (initialSupplierId) setSupplierId(initialSupplierId);
  }, [initialSupplierId]);

  if (!isOpen) return null;

  const selectedType = docTypes.find((t) => t.id === Number(documentTypeId));
  const isFiscal = ['FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO'].includes(selectedType?.code || '');

  const computeHumanReference = () => {
    if (!selectedType) return '';
    const prefix =
      selectedType.code === 'FACTURA'
        ? 'FAC'
        : selectedType.code === 'NOTA_CREDITO'
        ? 'NC'
        : selectedType.code === 'NOTA_DEBITO'
        ? 'ND'
        : selectedType.code;

    if (isFiscal && (pointOfSale || documentNumber)) {
      const posFormatted = pointOfSale.padStart(4, '0');
      const numFormatted = documentNumber ? documentNumber.padStart(8, '0') : '00000000';
      return `${prefix} ${letter} ${posFormatted}-${numFormatted}`;
    }

    if (customReference) return customReference.trim();
    return `${prefix} ${new Date().getTime().toString().slice(-8)}`;
  };

  const currentHumanRef = computeHumanReference();

  const isFieldUncertain = (fieldName: string) => {
    return initialData?.uncertain_fields?.includes(fieldName) || false;
  };

  const handleConfirmDoc = async (overrideReason?: string) => {
    if (!supplierId || !documentTypeId || !totalAmount) return;
    setLoading(true);
    setError(null);

    try {
      const numAmount = parseFloat(totalAmount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('El importe total debe ser un número mayor a 0.');
      }

      // 1. Call RPC rpc_create_and_confirm_document
      const { data: confirmRes, error: rpcErr } = await supabase.rpc(
        'rpc_create_and_confirm_document',
        {
          p_supplier_id: Number(supplierId),
          p_document_type_id: Number(documentTypeId),
          p_letter: isFiscal ? letter : null,
          p_point_of_sale: isFiscal && pointOfSale ? parseInt(pointOfSale, 10) : null,
          p_document_number: isFiscal && documentNumber ? parseInt(documentNumber, 10) : null,
          p_human_reference: currentHumanRef,
          p_issue_date: issueDate,
          p_due_date: dueDate || null,
          p_total_amount: numAmount,
          p_concept: concept.trim() || null,
          p_notes: notes.trim() || null,
          p_override_reason: overrideReason || null,
        }
      );

      if (rpcErr) throw rpcErr;

      if (!confirmRes.success && confirmRes.is_duplicate) {
        // Show Duplicate Warning Modal
        setDuplicateInfo(confirmRes);
        setLoading(false);
        return;
      }

      // If document was confirmed and fileId is associated, link it to document_files
      if (confirmRes.success && confirmRes.document_id && fileId) {
        await supabase
          .from('document_files')
          .update({ document_id: confirmRes.document_id })
          .eq('id', fileId);

        await supabase
          .from('document_upload_sessions')
          .update({ document_id: confirmRes.document_id, status: 'COMPLETED' })
          .eq('file_id', fileId);
      }

      // Success
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error creating document:', err);
      setError(err.message || 'Error al guardar el comprobante');
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierCreated = (newSup: Supplier) => {
    setSuppliers((prev) => [newSup, ...prev.filter((s) => s.id !== newSup.id)]);
    setSupplierId(newSup.id);
    setUnrecognizedSupplier(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <FilePlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>Revisión y Carga de Comprobante</span>
                  {intakeSource !== 'MANUAL' && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 inline" />
                      <span>{intakeSource}</span>
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400">
                  Verificá los datos del comprobante antes de impactar el saldo en cuenta corriente
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

          {/* Form Body */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Warnings Banner if AI had doubts */}
            {initialData?.warnings && initialData.warnings.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1">
                <div className="flex items-center space-x-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Observaciones de la Extracción IA</span>
                </div>
                <ul className="list-disc list-inside pl-1 text-[11px] text-amber-200/90">
                  {initialData.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Unrecognized Supplier Suggestion Banner */}
            {unrecognizedSupplier && (
              <div className="p-4 rounded-2xl bg-sky-950/40 border border-sky-500/30 text-sky-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center space-x-2.5">
                  <Building2 className="w-5 h-5 text-sky-400 shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-sky-400 block">
                      Proveedor no registrado por CUIT
                    </span>
                    <span className="font-bold text-white text-xs">
                      {unrecognizedSupplier.name} (CUIT: {unrecognizedSupplier.taxId})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickCreateOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-sky-900/30 transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear Proveedor</span>
                </button>
              </div>
            )}

            {/* Supplier Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Proveedor Emisor *
                </label>
                <button
                  type="button"
                  onClick={() => setQuickCreateOpen(true)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Nuevo Proveedor</span>
                </button>
              </div>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className={`w-full bg-slate-800 border rounded-xl px-3.5 py-2 text-white font-medium focus:ring-2 focus:ring-sky-500/50 ${
                  isFieldUncertain('supplier.tax_id') ? 'border-amber-500/80 bg-amber-950/10' : 'border-slate-700'
                }`}
              >
                <option value="" disabled>
                  -- Seleccione un proveedor --
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.trade_name} ({s.tax_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type & Fiscal Attributes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Comprobante *
                </label>
                <select
                  value={documentTypeId}
                  onChange={(e) => setDocumentTypeId(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium"
                >
                  {docTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              {isFiscal ? (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Letra / Tipo
                    </label>
                    <select
                      value={letter}
                      onChange={(e) => setLetter(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-center"
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="M">M</option>
                      <option value="X">X</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Punto de Venta
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="0001"
                      value={pointOfSale}
                      onChange={(e) => setPointOfSale(e.target.value)}
                      className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white font-mono text-center ${
                        isFieldUncertain('document.point_of_sale') ? 'border-amber-500/80' : 'border-slate-700'
                      }`}
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Referencia Personalizada
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: REM-8910 o REC-2024-001"
                    value={customReference}
                    onChange={(e) => setCustomReference(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* Document Number & Generated Reference Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isFiscal && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Número de Comprobante *
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="12345678"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white font-mono font-bold ${
                      isFieldUncertain('document.document_number') ? 'border-amber-500/80' : 'border-slate-700'
                    }`}
                  />
                </div>
              )}

              <div className={isFiscal ? '' : 'sm:col-span-2'}>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Referencia Comercial Generada
                </label>
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 font-mono font-bold text-sky-400">
                  {currentHumanRef || '-'}
                </div>
              </div>
            </div>

            {/* Dates & Currency & Total Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Fecha Emisión *
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Fecha Vto. Pago
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white font-mono ${
                    isFieldUncertain('document.due_date') ? 'border-amber-500/80' : 'border-slate-700'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-center"
                >
                  <option value="ARS">ARS ($)</option>
                  <option value="USD">USD (U$S)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Importe Total *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  required
                  className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white font-mono font-bold text-right ${
                    isFieldUncertain('document.total_amount') ? 'border-amber-500/80' : 'border-slate-700'
                  }`}
                />
              </div>
            </div>

            {/* Concept & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Concepto / Detalle
                </label>
                <input
                  type="text"
                  placeholder="Ej: Insumos de producción y empaque"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Notas Internas
                </label>
                <input
                  type="text"
                  placeholder="Observaciones de auditoría o seguimiento"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-800 bg-slate-800/40">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleConfirmDoc()}
              disabled={loading || !supplierId || !documentTypeId || !totalAmount}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-lg shadow-sky-900/30 disabled:opacity-50 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Confirmando...' : 'Confirmar e Impactar Ledger'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Duplicate Warning & Override Modal */}
      {duplicateInfo && (
        <DuplicateWarningModal
          isOpen={Boolean(duplicateInfo)}
          duplicateInfo={duplicateInfo}
          onCancel={() => setDuplicateInfo(null)}
          onConfirmOverride={(reason: string) => {
            setDuplicateInfo(null);
            handleConfirmDoc(reason);
          }}
        />
      )}

      {/* Quick Create Supplier Modal */}
      {quickCreateOpen && (
        <SupplierQuickCreateModal
          isOpen={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          onSupplierCreated={handleSupplierCreated}
          initialTaxId={unrecognizedSupplier?.taxId || ''}
          initialName={unrecognizedSupplier?.name || ''}
        />
      )}
    </>
  );
};
