import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier, DocumentType, IntakeSource, DocumentNumberingSeries, NumberingMode } from '../../types/database';
import { DuplicateWarningModal } from './DuplicateWarningModal';
import { SupplierQuickCreateModal } from '../suppliers/SupplierQuickCreateModal';
import { ExtractedInvoicePayload } from '../../lib/aiExtractor';
import { cleanCuit, isValidCuit } from '../../lib/cuitValidator';
import { parseCanonicalDate, toIsoDate, formatDate } from '../../lib/formatters';
import { SeriesSelector } from './SeriesSelector';
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
  extractionId?: number | null;
  intakeSource?: IntakeSource;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const DocumentFormModal: React.FC<DocumentFormModalProps> = ({
  initialSupplierId,
  initialData,
  fileId,
  extractionId,
  intakeSource = 'MANUAL',
  isOpen,
  onClose,
  onSaved,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);

  // Form fields
  const [supplierId, setSupplierId] = useState<number | ''>(initialSupplierId || '');
  const [sellerId, setSellerId] = useState<number | ''>('');
  const [validSellers, setValidSellers] = useState<any[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
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

  // Due Date Decision States
  const [effectiveExtractionId, setEffectiveExtractionId] = useState<number | null>(null);
  const [dueDateSelectionSource, setDueDateSelectionSource] = useState<'PRINTED' | 'CALCULATED' | 'MANUAL'>('MANUAL');
  const [manualReason, setManualReason] = useState<string>('');

  // Numbering Mode & Series State
  const [selectedSeries, setSelectedSeries] = useState<DocumentNumberingSeries | null>(null);
  const [numberingMode, setNumberingMode] = useState<NumberingMode>('EXTERNAL');
  const [seriesList, setSeriesList] = useState<DocumentNumberingSeries[]>([]);

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<any | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [unrecognizedSupplier, setUnrecognizedSupplier] = useState<{
    taxId: string;
    name: string;
  } | null>(null);

  // Resolve Effective Extraction ID (Prop or Query by fileId)
  useEffect(() => {
    if (extractionId) {
      setEffectiveExtractionId(extractionId);
    } else if (fileId) {
      supabase
        .from('document_ai_extractions')
        .select('id')
        .eq('file_id', fileId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setEffectiveExtractionId(data.id);
        });
    } else {
      setEffectiveExtractionId(null);
    }
  }, [extractionId, fileId]);

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

  // Fetch valid sellers whenever supplierId or issueDate changes
  useEffect(() => {
    if (!supplierId) {
      setValidSellers([]);
      setSellerId('');
      return;
    }

    const fetchSellersForSupplierAndDate = async () => {
      setLoadingSellers(true);
      try {
        const { data, error } = await supabase.rpc('fn_get_valid_sellers_for_supplier', {
          p_supplier_id: Number(supplierId),
          p_issue_date: issueDate || new Date().toISOString().split('T')[0],
        });

        if (error) throw error;
        const sellers = data || [];
        setValidSellers(sellers);

        if (sellers.length === 1) {
          setSellerId(sellers[0].seller_id);
        } else if (sellers.length > 1) {
          setSellerId((prev) => {
            const stillValid = sellers.some((s: any) => s.seller_id === Number(prev));
            return stillValid ? prev : '';
          });
        } else {
          setSellerId('');
        }
      } catch (err) {
        console.error('Error fetching valid sellers for supplier:', err);
      } finally {
        setLoadingSellers(false);
      }
    };

    fetchSellersForSupplierAndDate();
  }, [supplierId, issueDate]);

  // Populate from initialData (AI Extraction)
  useEffect(() => {
    if (!initialData) return;

    if (initialData.document) {
      const doc = initialData.document;
      if (doc.letter) setLetter(doc.letter);
      if (doc.point_of_sale) {
        const p = parseInt(doc.point_of_sale, 10);
        setPointOfSale(!isNaN(p) && p <= 99999 ? p.toString().padStart(4, '0') : doc.point_of_sale.padStart(4, '0'));
      }
      if (doc.document_number) {
        const n = parseInt(doc.document_number, 10);
        setDocumentNumber(!isNaN(n) && n <= 99999999 ? n.toString().padStart(8, '0') : doc.document_number);
      }
      
      const isoIssue = doc.invoice_date || doc.issue_date_iso || toIsoDate(parseCanonicalDate(doc.issue_date));
      if (isoIssue) setIssueDate(isoIssue);

      // Precedencia estricta para inicializar la fecha de vencimiento comercial
      if (doc.due_date_source === 'EXPLICIT_PRINTED' && doc.due_date) {
        setDueDate(doc.due_date);
        setDueDateSelectionSource('PRINTED');
      } else if (doc.due_date_source === 'CALCULATED_FROM_PAYMENT_TERMS' && doc.due_date) {
        setDueDate(doc.due_date);
        setDueDateSelectionSource('CALCULATED');
      } else if (doc.due_date) {
        setDueDate(doc.due_date);
        setDueDateSelectionSource(doc.printed_due_date ? 'PRINTED' : 'CALCULATED');
      } else {
        setDueDate('');
        setDueDateSelectionSource('MANUAL');
      }

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

    // Validación estricta de vendedor con >1 vigentes
    if (validSellers.length > 1 && !sellerId) {
      setError('Este proveedor posee múltiples vendedores vigentes. Debe seleccionar obligatoriamente a cuál atribuir el comprobante.');
      return;
    }

    // Validación de motivo manual ÚNICAMENTE cuando se sobreescribe una extracción de IA con discrepancias
    const isAiDiscrepancyOverride = Boolean(
      initialData?.document && (
        initialData.document.due_date_inconsistency ||
        (initialData.document.printed_due_date && initialData.document.calculated_due_date && initialData.document.printed_due_date !== initialData.document.calculated_due_date)
      )
    );

    const effectiveManualReason = manualReason.trim() || notes.trim() || concept.trim();

    if (isAiDiscrepancyOverride && dueDateSelectionSource === 'MANUAL' && dueDate) {
      if (!effectiveManualReason || effectiveManualReason.length < 3) {
        setError('La resolución manual sobre la discrepancia de vencimiento exige indicar un motivo (podés indicarlo en la tarjeta de discrepancia, en notas o en concepto).');
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const numAmount = parseFloat(totalAmount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('El importe total debe ser un número mayor a 0.');
      }

      // Rastrear modificaciones respecto a la extracción de IA
      const modifications: Record<string, { original: any; modified: any }> = {};
      if (initialData?.document) {
        const origDoc = initialData.document;
        if (letter !== origDoc.letter) modifications.letter = { original: origDoc.letter, modified: letter };
        if (pointOfSale !== (origDoc.point_of_sale || '')) modifications.point_of_sale = { original: origDoc.point_of_sale, modified: pointOfSale };
        if (documentNumber !== (origDoc.document_number || '')) modifications.document_number = { original: origDoc.document_number, modified: documentNumber };
        if (totalAmount !== (origDoc.total_amount?.toString() || '')) modifications.total_amount = { original: origDoc.total_amount, modified: totalAmount };
        const origDue = origDoc.printed_due_date_iso || toIsoDate(parseCanonicalDate(origDoc.printed_due_date)) || origDoc.due_date;
        if (dueDate !== (origDue || '')) modifications.due_date = { original: origDue, modified: dueDate };
      }

      const confirmedDiff = {
        due_date_decision: {
          selection_source: dueDateSelectionSource,
          selected_due_date: dueDate || null,
          printed_due_date: initialData?.document?.printed_due_date_iso || toIsoDate(parseCanonicalDate(initialData?.document?.printed_due_date)) || null,
          calculated_due_date: initialData?.document?.calculated_due_date_iso || toIsoDate(parseCanonicalDate(initialData?.document?.calculated_due_date)) || null,
          payment_condition_text: initialData?.document?.payment_condition_text || null,
          manual_reason: dueDateSelectionSource === 'MANUAL' ? (effectiveManualReason || null) : null,
        },
        field_modifications: modifications,
      };

      // 1. Invocación atómica de rpc_create_and_confirm_document con auditoría server-side
      if (numberingMode === 'INTERNAL_SEQUENCE') {
        if (seriesList.length === 0) {
          throw new Error('Bloqueado: No existen series de numeración activas para este tipo de comprobante. Configure una serie activa antes de confirmar.');
        }
        if (seriesList.length > 1 && !selectedSeries) {
          throw new Error('Debe seleccionar obligatoriamente una serie activa para la autonumeración.');
        }
      }

      const { data: confirmRes, error: rpcErr } = await supabase.rpc(
        'rpc_create_and_confirm_document',
        {
          p_supplier_id: Number(supplierId),
          p_document_type_id: Number(documentTypeId),
          p_seller_id: sellerId ? Number(sellerId) : null,
          p_letter: isFiscal ? letter : null,
          p_point_of_sale: numberingMode === 'INTERNAL_SEQUENCE' ? null : (isFiscal && pointOfSale ? parseInt(pointOfSale, 10) : null),
          p_document_number: numberingMode === 'INTERNAL_SEQUENCE' ? null : (isFiscal && documentNumber ? parseInt(documentNumber, 10) : null),
          p_human_reference: numberingMode === 'INTERNAL_SEQUENCE' ? null : currentHumanRef,
          p_issue_date: issueDate,
          p_due_date: dueDate || null,
          p_total_amount: numAmount,
          p_currency: currency,
          p_concept: concept.trim() || null,
          p_notes: notes.trim() || null,
          p_override_reason: overrideReason || null,
          p_ai_extraction_id: effectiveExtractionId,
          p_file_id: fileId || null,
          p_confirmed_payload_diff: confirmedDiff,
          p_numbering_series_id: numberingMode === 'INTERNAL_SEQUENCE' ? (selectedSeries?.id || null) : null,
        }
      );

      if (rpcErr) throw rpcErr;

      if (!confirmRes.success && confirmRes.is_duplicate) {
        // Show Duplicate Warning Modal
        setDuplicateInfo(confirmRes);
        setLoading(false);
        return;
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

            {/* AI Extraction Semantic Status Banner */}
            {initialData && (
              <>
                {initialData.status === 'SUCCESS' && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center space-x-2.5">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold block">Datos completos para revisión</span>
                      <span className="text-[11px] text-emerald-200/90">
                        Se superaron las validaciones automáticas, pero la confirmación humana continúa siendo obligatoria.
                      </span>
                    </div>
                  </div>
                )}

                {initialData.status === 'PARTIAL' && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                    <div className="flex items-center space-x-2 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Extracción Parcial — Revisión humana obligatoria</span>
                    </div>
                    {initialData.status_reasons && initialData.status_reasons.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-amber-300/90">Observaciones críticas detectadas:</span>
                        <ul className="list-disc list-inside pl-1 text-[11px] text-amber-200/90 space-y-0.5">
                          {initialData.status_reasons.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {initialData.warnings && initialData.warnings.length > 0 && (
                      <ul className="list-disc list-inside pl-1 text-[11px] text-amber-200/80 space-y-0.5">
                        {initialData.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    )}
                    {initialData.missing_fields && initialData.missing_fields.length > 0 && (
                      <div className="text-[11px] text-amber-300/80 pt-0.5">
                        <span className="font-semibold">Campos no detectados: </span>
                        <span className="font-mono text-amber-200">{initialData.missing_fields.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                {initialData.status === 'FAILED' && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1">
                    <div className="flex items-center space-x-2 font-bold">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Extracción Automática No Disponible</span>
                    </div>
                    <p className="text-[11px] text-rose-200/90">
                      No se obtuvo información mínima utilizable. Ingresá los datos del comprobante manualmente.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Unrecognized Supplier Suggestion Banner */}
            {unrecognizedSupplier && (() => {
              const isTaxIdValid = isValidCuit(unrecognizedSupplier.taxId);
              return (
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg ${
                    isTaxIdValid
                      ? 'bg-sky-950/50 border-sky-500/40 text-sky-200 shadow-sky-950/40'
                      : 'bg-amber-950/40 border-amber-500/60 text-amber-200 shadow-amber-950/30'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    {isTaxIdValid ? (
                      <Building2 className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider block ${
                            isTaxIdValid ? 'text-sky-400' : 'text-amber-400'
                          }`}
                        >
                          {isTaxIdValid
                            ? 'Proveedor no registrado por CUIT'
                            : 'Proveedor no registrado — CUIT observado'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white text-sm tracking-wide">
                          {unrecognizedSupplier.name}
                        </span>

                        {isTaxIdValid ? (
                          <span className="inline-flex items-center font-mono text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-sky-900/70 border border-sky-400/40 text-sky-200 tracking-wider">
                            CUIT: <span className="text-white ml-1.5 font-bold tracking-widest">{unrecognizedSupplier.taxId}</span>
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-amber-900/70 border border-amber-500/80 text-amber-100 tracking-wider shadow-sm">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>CUIT:</span>
                            <span className="text-white font-bold tracking-widest underline decoration-amber-400 decoration-wavy underline-offset-2">
                              {unrecognizedSupplier.taxId}
                            </span>
                            <span className="ml-1 px-1.5 py-0.2 rounded bg-rose-950/90 text-rose-300 border border-rose-500/70 text-[10px] font-bold uppercase tracking-wider">
                              Inválido Módulo 11
                            </span>
                          </div>
                        )}
                      </div>

                      {!isTaxIdValid && (
                        <p className="text-[11px] text-amber-300/90 mt-1.5 flex items-center gap-1.5 leading-snug">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            El CUIT extraído no supera la validación matemática de AFIP. Podés corregirlo al crear o asignar el proveedor.
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickCreateOpen(true)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-md transition-all shrink-0 active:scale-95 text-white ${
                      isTaxIdValid
                        ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-900/40'
                        : 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/40'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear Proveedor</span>
                  </button>
                </div>
              );
            })()}

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

            {/* Seller / Vendedor Section */}
            {supplierId && (
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <span>Vendedor Asociado</span>
                    {validSellers.length > 1 && (
                      <span className="text-amber-400 font-bold">* (Obligatorio)</span>
                    )}
                  </label>
                  {loadingSellers && (
                    <span className="text-[10px] text-slate-400 animate-pulse">
                      Consultando vigencias...
                    </span>
                  )}
                </div>

                {validSellers.length === 0 && !loadingSellers && (
                  <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="italic">Sin vendedor asignado (Este proveedor no posee vendedores vigentes para la fecha).</span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-medium">
                      Opcional
                    </span>
                  </div>
                )}

                {validSellers.length === 1 && !loadingSellers && (
                  <div className="flex items-center justify-between text-xs text-emerald-300 bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/30">
                    <div className="flex items-center space-x-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold">{validSellers[0].display_name}</span>
                      {validSellers[0].seller_code && (
                        <span className="text-[10px] font-mono text-emerald-400/80">({validSellers[0].seller_code})</span>
                      )}
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-medium">
                      Asignado Automáticamente
                    </span>
                  </div>
                )}

                {validSellers.length > 1 && !loadingSellers && (
                  <div className="space-y-1.5">
                    <select
                      value={sellerId}
                      onChange={(e) => setSellerId(Number(e.target.value))}
                      className={`w-full bg-slate-800 border rounded-xl px-3.5 py-2 text-white font-medium focus:ring-2 focus:ring-sky-500/50 ${
                        !sellerId ? 'border-amber-500/80 bg-amber-950/10' : 'border-slate-700'
                      }`}
                    >
                      <option value="" disabled>
                        -- Seleccione obligatoriamente un vendedor ({validSellers.length} vigentes) --
                      </option>
                      {validSellers.map((v: any) => (
                        <option key={v.seller_id} value={v.seller_id}>
                          {v.display_name} {v.seller_code ? `(${v.seller_code})` : ''}
                        </option>
                      ))}
                    </select>
                    {!sellerId && (
                      <p className="text-[11px] text-amber-400 font-medium">
                        El proveedor posee múltiples vendedores vigentes. Debe seleccionar cuál corresponde a este comprobante.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Document Type & Fiscal Attributes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Comprobante *
                </label>
                <select
                  value={documentTypeId}
                  onChange={(e) => setDocumentTypeId(Number(e.target.value))}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium text-sm focus:border-sky-500 transition-colors shadow-inner"
                >
                  {docTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              {isFiscal && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Letra / Tipo
                  </label>
                  <select
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono font-semibold text-base text-center focus:border-sky-500 transition-colors shadow-inner"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="M">M</option>
                    <option value="X">X</option>
                  </select>
                </div>
              )}

              {numberingMode === 'EXTERNAL' && isFiscal && (
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
                    className={`w-full bg-slate-800/90 border rounded-xl px-3.5 py-2.5 text-white font-mono font-semibold text-base tracking-widest text-center shadow-inner transition-colors ${
                      isFieldUncertain('document.point_of_sale') ? 'border-amber-500/80 focus:border-amber-400' : 'border-slate-700 focus:border-sky-500'
                    }`}
                  />
                </div>
              )}

              {numberingMode === 'EXTERNAL' && !isFiscal && (
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Referencia Personalizada
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: REM-8910 o REC-2024-001"
                    value={customReference}
                    onChange={(e) => setCustomReference(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono font-medium text-sm tracking-wide shadow-inner focus:border-sky-500 transition-colors"
                  />
                </div>
              )}
            </div>

            {/* Series Selector when INTERNAL_SEQUENCE */}
            <div className="space-y-3">
              <SeriesSelector
                documentTypeId={documentTypeId ? Number(documentTypeId) : null}
                letter={isFiscal ? letter : null}
                selectedSeriesId={selectedSeries?.id || null}
                onSelectSeries={setSelectedSeries}
                onModeLoaded={(mode, sList) => {
                  setNumberingMode(mode);
                  setSeriesList(sList);
                }}
              />
            </div>

            {/* Document Number & Generated Reference Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {numberingMode === 'EXTERNAL' && isFiscal && (
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
                    className={`w-full bg-slate-800/90 border rounded-xl px-3.5 py-2.5 text-white font-mono font-semibold text-base tracking-wider shadow-inner transition-colors ${
                      isFieldUncertain('document.document_number') ? 'border-amber-500/80 focus:border-amber-400' : 'border-slate-700 focus:border-sky-500'
                    }`}
                  />
                </div>
              )}

              <div className={numberingMode === 'EXTERNAL' && isFiscal ? '' : 'sm:col-span-2'}>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Referencia Comercial {numberingMode === 'INTERNAL_SEQUENCE' ? '(Estimada al Confirmar)' : 'Generada'}
                </label>
                <div className="bg-slate-950/90 border border-sky-500/30 rounded-xl px-4 py-2.5 font-mono font-semibold text-sm tracking-wider text-sky-400 shadow-inner flex items-center min-h-[44px]">
                  {numberingMode === 'INTERNAL_SEQUENCE'
                    ? selectedSeries
                      ? selectedSeries.next_number !== null
                        ? `${selectedSeries.letter ? `${selectedSeries.letter}-` : ''}${selectedSeries.point_of_sale.toString().padStart(4, '0')}-${selectedSeries.next_number.toString().padStart(8, '0')} (Estimada)`
                        : 'Serie agotada'
                      : 'Se asignará correlativamente al confirmar'
                    : currentHumanRef || '-'}
                </div>
              </div>
            </div>

            {/* Fiscal CAE Information Banner (Strictly Separated from Commercial Due Date) */}
            {initialData?.document?.cae && (
              <div className="flex flex-wrap items-center justify-between text-xs bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-400 gap-2">
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">CAE AFIP:</span>
                  <span className="font-mono font-semibold tracking-wider text-sky-300">{initialData.document.cae}</span>
                </div>
                {initialData?.document?.cae_expiration_date && (
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Vto. CAE:</span>
                    <span className="font-mono font-semibold tracking-wide text-slate-200">
                      {formatDate(initialData.document.cae_expiration_date)}
                    </span>
                    <span className="text-[10px] text-slate-500 italic bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">
                      Dato fiscal regulatorio (No es vencimiento de pago)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Due Date Decision Card if inconsistency exists or if both printed & calculated dates are present */}
            {(initialData?.document?.due_date_inconsistency || (initialData?.document?.printed_due_date && initialData?.document?.calculated_due_date && initialData.document.printed_due_date !== initialData.document.calculated_due_date)) && (
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Resolución de Fecha de Vencimiento Comercial</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                    Decisión del Operador
                  </span>
                </div>

                <div className="text-[11px] text-amber-200/90 space-y-1">
                  {initialData?.document?.printed_due_date && (
                    <div>• <strong>Fecha impresa en factura:</strong> {formatDate(initialData.document.printed_due_date)}</div>
                  )}
                  {initialData?.document?.calculated_due_date && (
                    <div>• <strong>Fecha calculada según condición ({initialData.document.payment_terms_text || initialData.document.payment_condition_text || `${initialData.document.payment_terms_days || initialData.document.payment_term_days} días`}):</strong> {formatDate(initialData.document.calculated_due_date)}</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {initialData?.document?.printed_due_date && (
                    <button
                      type="button"
                      onClick={() => {
                        setDueDateSelectionSource('PRINTED');
                        const iso = initialData.document.printed_due_date_iso || toIsoDate(parseCanonicalDate(initialData.document.printed_due_date)) || '';
                        setDueDate(iso);
                        setManualReason('');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        dueDateSelectionSource === 'PRINTED'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-slate-800 text-amber-300 border-amber-500/30 hover:bg-slate-700'
                      }`}
                    >
                      Usar Fecha Impresa ({formatDate(initialData.document.printed_due_date)})
                    </button>
                  )}

                  {initialData?.document?.calculated_due_date && (
                    <button
                      type="button"
                      onClick={() => {
                        setDueDateSelectionSource('CALCULATED');
                        const iso = initialData.document.calculated_due_date_iso || toIsoDate(parseCanonicalDate(initialData.document.calculated_due_date)) || '';
                        setDueDate(iso);
                        setManualReason('');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        dueDateSelectionSource === 'CALCULATED'
                          ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md shadow-sky-500/20'
                          : 'bg-slate-800 text-sky-300 border-sky-500/30 hover:bg-slate-700'
                      }`}
                    >
                      Usar Fecha Calculada ({formatDate(initialData.document.calculated_due_date)})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setDueDateSelectionSource('MANUAL');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      dueDateSelectionSource === 'MANUAL'
                        ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-500/20'
                        : 'bg-slate-800 text-purple-300 border-purple-500/30 hover:bg-slate-700'
                    }`}
                  >
                    Ingreso Manual
                  </button>
                </div>

                {dueDateSelectionSource === 'MANUAL' && (
                  <div className="pt-1.5">
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-purple-300 mb-1">
                      Motivo de la asignación manual * (Mínimo 3 caracteres)
                    </label>
                    <input
                      type="text"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Ej: Modificado según acuerdo comercial con el proveedor..."
                      className="w-full bg-slate-900 border border-purple-500/50 rounded-xl px-3 py-1.5 text-white text-xs font-medium focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Dates & Currency & Total Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Fecha Emisión *
                  </label>
                  {issueDate && (
                    <span className="text-[10px] font-mono text-sky-400">
                      {formatDate(issueDate)}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  required
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm tracking-wide shadow-inner focus:border-sky-500 transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Fecha Vto. Pago
                  </label>
                  {dueDate && (
                    <span className="text-[10px] font-mono text-sky-400">
                      {formatDate(dueDate)}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setDueDateSelectionSource('MANUAL');
                  }}
                  className={`w-full bg-slate-800/90 border rounded-xl px-3.5 py-2.5 text-white font-mono text-sm tracking-wide shadow-inner transition-colors ${
                    isFieldUncertain('document.due_date') ? 'border-amber-500/80 focus:border-amber-400' : 'border-slate-700 focus:border-sky-500'
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
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono font-semibold text-sm text-center shadow-inner focus:border-sky-500 transition-colors"
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
                  className={`w-full bg-slate-800/90 border rounded-xl px-3.5 py-2.5 text-white font-mono font-semibold text-base text-right tracking-wide shadow-inner transition-colors ${
                    isFieldUncertain('document.total_amount') ? 'border-amber-500/80 focus:border-amber-400' : 'border-slate-700 focus:border-sky-500'
                  }`}
                />
                {totalAmount && !isNaN(parseFloat(totalAmount)) && (
                  <div className="flex items-center justify-end gap-1.5 mt-1.5 text-emerald-400 font-mono text-xs font-semibold tracking-wider">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-normal font-sans">
                      Formateado:
                    </span>
                    <span>
                      {currency === 'USD' ? 'U$S' : currency === 'EUR' ? '€' : '$'}{' '}
                      {parseFloat(totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
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
