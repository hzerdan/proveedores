import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentSummaryView, DocumentSellerHistory } from '../../types/database';
import { formatDate, formatDateTime, formatMoney } from '../../lib/formatters';
import { useAuth } from '../../context/AuthContext';
import { DocumentSellerChangeModal } from '../documents/DocumentSellerChangeModal';
import {
  X,
  FileText,
  ArrowDownRight,
  Layers,
  UserCheck,
  History,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  UserPlus,
  Eye,
} from 'lucide-react';

interface DocumentDetailModalProps {
  documentId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenReferenceMovements?: (referenceId: number) => void;
  onOpenDocumentDetail?: (documentId: number) => void;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  documentId,
  isOpen,
  onClose,
  onOpenReferenceMovements,
  onOpenDocumentDetail,
}) => {
  const { hasPermission } = useAuth();
  const [doc, setDoc] = useState<DocumentSummaryView | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [referenceMovements, setReferenceMovements] = useState<any[]>([]);
  const [sellerHistory, setSellerHistory] = useState<DocumentSellerHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      // 1. Fetch Document Summary
      const { data: docData } = await supabase
        .from('v_document_summary')
        .select('*')
        .eq('document_id', documentId)
        .single();

      setDoc(docData || null);

      // 2. Fetch Movements emitted by this document
      const { data: movData } = await supabase
        .from('v_document_ledger')
        .select('*')
        .eq('document_id', documentId)
        .order('movement_id', { ascending: true });

      setMovements(movData || []);

      // 3. Fetch Movements affecting this document as reference (explaining the balance)
      const { data: refMovData } = await supabase
        .from('v_document_ledger')
        .select('*')
        .eq('reference_id', documentId)
        .order('movement_date', { ascending: true })
        .order('movement_id', { ascending: true });

      setReferenceMovements(refMovData || []);

      // 4. Fetch Seller History
      const { data: histData } = await supabase
        .from('document_seller_history')
        .select(`
          id,
          document_id,
          old_seller_id,
          new_seller_id,
          change_type,
          relation_validity_status,
          reason,
          changed_by,
          changed_at,
          old_seller:sellers!document_seller_history_old_seller_id_fkey(id, display_name, code),
          new_seller:sellers!document_seller_history_new_seller_id_fkey(id, display_name, code),
          changer:profiles!document_seller_history_changed_by_fkey(first_name, last_name, email)
        `)
        .eq('document_id', documentId)
        .order('changed_at', { ascending: false });

      setSellerHistory((histData as any) || []);
    } catch (err) {
      console.error('Error fetching document detail:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId || !isOpen) return;
    fetchDetail();
  }, [documentId, isOpen, fetchDetail]);

  if (!isOpen || !documentId) return null;

  const canAssignSeller = hasPermission('documents.assign_seller') && doc?.seller_id === null;
  const canChangeSeller = hasPermission('documents.change_seller') && doc?.seller_id !== null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <h2 className="text-base font-bold text-white font-mono">
                    {doc?.human_reference || `Documento #${documentId}`}
                  </h2>
                  <span className="text-[10px] text-slate-500 font-mono">ID #{documentId}</span>
                  {doc && (
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                      {doc.document_type_name}
                    </span>
                  )}
                  {doc?.seller_display_name ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-semibold flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      <span>Vendedor: {doc.seller_display_name}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
                      Sin Vendedor
                    </span>
                  )}

                  {/* Seller Action Button */}
                  {canAssignSeller && (
                    <button
                      type="button"
                      onClick={() => setSellerModalOpen(true)}
                      className="text-[10px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 transition-colors"
                      title="Asignar vendedor inicial (Regularización histórica)"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>Asignar</span>
                    </button>
                  )}

                  {canChangeSeller && (
                    <button
                      type="button"
                      onClick={() => setSellerModalOpen(true)}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600 px-2 py-0.5 rounded-lg font-medium flex items-center gap-1 transition-colors"
                      title="Corregir vendedor asignado (Operación auditada)"
                    >
                      <Edit3 className="w-3 h-3 text-sky-400" />
                      <span>Cambiar</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Proveedor: <strong className="text-slate-200">{doc?.supplier_trade_name}</strong> • Fecha: {doc ? formatDate(doc.issue_date) : '-'}
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
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            {loading ? (
              <div className="py-12 text-center text-slate-400">Cargando detalle del comprobante...</div>
            ) : doc ? (
              <>
                {/* Financial Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Importe Total</span>
                    <span className="text-base font-bold text-white font-mono">
                      {formatMoney(doc.total_amount)}
                    </span>
                  </div>

                  <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Total Renglones Emitidos</span>
                    <span className={`text-base font-bold font-mono ${doc.signed_total_amount < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatMoney(doc.signed_total_amount)}
                    </span>
                  </div>

                  <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Saldo de su Referencia</span>
                    <span className={`text-base font-bold font-mono ${
                      doc.reference_balance > 0 ? 'text-rose-400' : doc.reference_balance < 0 ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      {formatMoney(doc.reference_balance)}
                    </span>
                  </div>

                  <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Estado Contable</span>
                    <span className="text-xs font-bold text-sky-400 block mt-1">
                      {doc.derived_status}
                    </span>
                  </div>
                </div>

                {/* Renglones Económicos Emitidos (WHERE document_id = X) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-sky-400" />
                      <span>Renglones Económicos Emitidos por este Documento ({movements.length})</span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Suma total de renglones:{' '}
                      <strong className="font-mono text-white">
                        {formatMoney(movements.reduce((acc, m) => acc + m.amount, 0))}
                      </strong>
                    </span>
                  </div>

                  <div className="bg-slate-800/20 border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800/60 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5">ID Renglón</th>
                          <th className="px-4 py-2.5">Tipo de Movimiento</th>
                          <th className="px-4 py-2.5">Referencia Afectada</th>
                          <th className="px-4 py-2.5 text-right">Importe Firmado</th>
                          <th className="px-4 py-2.5">Notas / Concepto</th>
                          <th className="px-4 py-2.5 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {movements.map((mov) => (
                          <tr key={mov.movement_id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 text-slate-400 font-bold">#{mov.movement_id}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300 font-sans font-semibold">
                                {mov.movement_type}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-1.5">
                                <ArrowDownRight className="w-3.5 h-3.5 text-sky-400" />
                                <span className="font-bold text-white">{mov.reference_human_ref}</span>
                                <span className="text-[10px] text-slate-500 font-sans">
                                  (ID #{mov.reference_id})
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold">
                              <span className={mov.amount < 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {formatMoney(mov.amount)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-300 font-sans text-xs">
                              {mov.notes || '-'}
                            </td>
                            <td className="px-4 py-3 text-center font-sans">
                              {onOpenReferenceMovements && (
                                <button
                                  onClick={() => onOpenReferenceMovements(mov.reference_id)}
                                  className="text-sky-400 hover:text-sky-300 hover:underline text-[11px]"
                                >
                                  Ver Referencia
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Comprobantes y Pagos que Afectan el Saldo (Explicación del Saldo) */}
                {referenceMovements.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                        <History className="w-4 h-4 text-violet-400" />
                        <span>Comprobantes y Pagos que Afectan el Saldo</span>
                      </h3>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Saldo de Referencia:{' '}
                        <strong className={`font-bold ${
                          doc.reference_balance > 0 ? 'text-rose-400' : doc.reference_balance < 0 ? 'text-emerald-400' : 'text-slate-300'
                        }`}>
                          {formatMoney(doc.reference_balance)}
                        </strong>
                      </span>
                    </div>

                    <div className="bg-slate-800/20 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800/60 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                          <tr>
                            <th className="px-4 py-2.5">Fecha</th>
                            <th className="px-4 py-2.5">Comprobante Emisor</th>
                            <th className="px-4 py-2.5">Tipo de Movimiento</th>
                            <th className="px-4 py-2.5 text-right">Efecto Económico</th>
                            <th className="px-4 py-2.5">Concepto / Notas</th>
                            <th className="px-4 py-2.5 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {referenceMovements.map((mov) => (
                            <tr key={mov.movement_id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-4 py-3 text-slate-300 font-sans">{formatDate(mov.movement_date)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold text-white">{mov.document_human_ref}</span>
                                  <span className="text-[10px] text-slate-500 font-sans">
                                    (ID #{mov.document_id})
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300 font-sans font-semibold">
                                  {mov.movement_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-bold">
                                <span className={mov.amount < 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {mov.amount < 0 ? `-${formatMoney(Math.abs(mov.amount))}` : `+${formatMoney(mov.amount)}`}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-300 font-sans text-xs">
                                {mov.notes || '-'}
                              </td>
                              <td className="px-4 py-3 text-center font-sans">
                                {onOpenDocumentDetail && (
                                  <button
                                    onClick={() => onOpenDocumentDetail(mov.document_id)}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 inline-flex items-center space-x-1 text-[11px] px-2 py-1 transition-colors"
                                    title="Ver detalle del comprobante"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Ver Doc</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Seller Historical Audit Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                      <History className="w-4 h-4 text-amber-400" />
                      <span>Historial de Vendedor & Reclasificaciones ({sellerHistory.length})</span>
                    </h3>
                  </div>

                  {sellerHistory.length === 0 ? (
                    <div className="bg-slate-800/20 border border-slate-800/80 rounded-xl p-4 text-center text-slate-400">
                      <span>Este comprobante no presenta cambios o regularizaciones de vendedor en su historial.</span>
                    </div>
                  ) : (
                    <div className="bg-slate-800/20 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800/60 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                          <tr>
                            <th className="px-4 py-2.5">Fecha y Hora</th>
                            <th className="px-4 py-2.5">Tipo de Cambio</th>
                            <th className="px-4 py-2.5">Transición</th>
                            <th className="px-4 py-2.5">Condición de Vigencia</th>
                            <th className="px-4 py-2.5">Usuario</th>
                            <th className="px-4 py-2.5">Motivo Registrado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-[11px]">
                          {sellerHistory.map((hist) => {
                            const isAssignment = hist.change_type === 'HISTORICAL_ASSIGNMENT';
                            const isValid = hist.relation_validity_status === 'VALID_FOR_DOCUMENT_DATE';
                            return (
                              <tr key={hist.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-4 py-3 font-mono text-slate-300">
                                  {formatDateTime(hist.changed_at)}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                      isAssignment
                                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    }`}
                                  >
                                    {isAssignment ? 'Regularización' : 'Corrección'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">
                                      {hist.old_seller?.display_name || 'Sin asignar'}
                                    </span>
                                    <span className="text-sky-400 font-bold">➔</span>
                                    <span className="text-emerald-400 font-semibold">
                                      {hist.new_seller?.display_name || `Vendedor #${hist.new_seller_id}`}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    {isValid ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                    )}
                                    <span className={`text-[10px] ${isValid ? 'text-emerald-300' : 'text-amber-300'}`}>
                                      {isValid
                                        ? 'Válido en fecha comprobante'
                                        : 'Excepción fuera de período'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-300">
                                  {hist.changer
                                    ? `${hist.changer.first_name || ''} ${hist.changer.last_name || ''}`.trim() || hist.changer.email
                                    : `Usuario #${hist.changed_by}`}
                                </td>
                                <td className="px-4 py-3 text-slate-200 font-sans italic">
                                  "{hist.reason}"
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Document Metadata */}
                <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/40 text-slate-400 space-y-1 font-sans text-[11px]">
                  <div className="flex items-center justify-between">
                    <span>Registrado por: <strong className="text-slate-300">{doc.created_by_name}</strong></span>
                    <span>Fecha de alta: <strong className="text-slate-300 font-mono">{formatDate(doc.created_at)}</strong></span>
                  </div>
                  {doc.concept && <div>Concepto Comercial: <span className="text-slate-200">{doc.concept}</span></div>}
                  {doc.notes && <div>Observaciones: <span className="text-slate-200">{doc.notes}</span></div>}
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-rose-400">Documento no encontrado.</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-800/40">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Seller Assignment / Change Modal */}
      {sellerModalOpen && doc && (
        <DocumentSellerChangeModal
          isOpen={sellerModalOpen}
          onClose={() => setSellerModalOpen(false)}
          documentId={doc.document_id}
          supplierId={doc.supplier_id}
          supplierName={doc.supplier_trade_name}
          humanReference={doc.human_reference}
          issueDate={doc.issue_date}
          currentSellerId={doc.seller_id}
          currentSellerName={doc.seller_display_name}
          onSaved={() => {
            fetchDetail();
          }}
        />
      )}
    </>
  );
};
