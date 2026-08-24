import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentSummaryView } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, FileText, ArrowDownRight, Layers } from 'lucide-react';

interface DocumentDetailModalProps {
  documentId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenReferenceMovements?: (referenceId: number) => void;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  documentId,
  isOpen,
  onClose,
  onOpenReferenceMovements,
}) => {
  const [doc, setDoc] = useState<DocumentSummaryView | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId || !isOpen) return;

    const fetchDetail = async () => {
      setLoading(true);
      try {
        // 1. Fetch Document Summary
        const { data: docData } = await supabase
          .from('v_document_summary')
          .select('*')
          .eq('document_id', documentId)
          .single();

        setDoc(docData || null);

        // 2. Fetch Movements emitted by this document (WHERE document_id = X)
        const { data: movData } = await supabase
          .from('v_document_ledger')
          .select('*')
          .eq('document_id', documentId)
          .order('movement_id', { ascending: true });

        setMovements(movData || []);
      } catch (err) {
        console.error('Error fetching document detail:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [documentId, isOpen]);

  if (!isOpen || !documentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white font-mono">
                  {doc?.human_reference || `Documento #${documentId}`}
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">ID #{documentId}</span>
                {doc && (
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                    {doc.document_type_name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
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
                  <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Importe Facial</span>
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
  );
};
