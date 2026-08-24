import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DocumentSummaryView } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, History, Layers, Eye } from 'lucide-react';

interface ReferenceMovementsModalProps {
  referenceId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDocumentDetail?: (documentId: number) => void;
}

export const ReferenceMovementsModal: React.FC<ReferenceMovementsModalProps> = ({
  referenceId,
  isOpen,
  onClose,
  onOpenDocumentDetail,
}) => {
  const [refDoc, setRefDoc] = useState<DocumentSummaryView | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!referenceId || !isOpen) return;

    const fetchReferenceHistory = async () => {
      setLoading(true);
      try {
        // 1. Fetch Reference Document Summary
        const { data: docData } = await supabase
          .from('v_document_summary')
          .select('*')
          .eq('document_id', referenceId)
          .single();

        setRefDoc(docData || null);

        // 2. Fetch Movements that affected this reference (WHERE reference_id = X)
        const { data: movData } = await supabase
          .from('v_document_ledger')
          .select('*')
          .eq('reference_id', referenceId)
          .order('movement_date', { ascending: true })
          .order('movement_id', { ascending: true });

        setMovements(movData || []);
      } catch (err) {
        console.error('Error fetching reference history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReferenceHistory();
  }, [referenceId, isOpen]);

  if (!isOpen || !referenceId) return null;

  const currentBalance = movements.reduce((acc, m) => acc + m.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white font-mono">
                  Historia de la Referencia: {refDoc?.human_reference || `Doc #${referenceId}`}
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">ID #{referenceId}</span>
              </div>
              <p className="text-xs text-slate-400">
                Todos los comprobantes, pagos, ajustes y APLs que afectaron el saldo de esta referencia
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
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Cargando historia de la referencia...</div>
          ) : refDoc ? (
            <>
              {/* Reference Balance Summary Banner */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 flex items-center justify-between font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans uppercase">Importe Original</span>
                  <span className="text-base font-bold text-white">
                    {formatMoney(refDoc.total_amount)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 block font-sans uppercase">Movimientos Aplicados</span>
                  <span className="text-base font-bold text-sky-400">
                    {movements.length} movimiento(s)
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-sans uppercase">Saldo Actual Resultante</span>
                  <span className={`text-xl font-bold ${
                    currentBalance > 0 ? 'text-rose-400' : currentBalance < 0 ? 'text-emerald-400' : 'text-slate-300'
                  }`}>
                    {formatMoney(currentBalance)}
                  </span>
                </div>
              </div>

              {/* Table of Movements affecting this reference (WHERE reference_id = X) */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <span>Desglose de Movimientos que Afectaron esta Referencia ({movements.length})</span>
                </h3>

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
                      {movements.map((mov) => (
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
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 inline-flex items-center space-x-1 text-[11px] px-2 py-1"
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
            </>
          ) : (
            <div className="py-12 text-center text-rose-400">Referencia no encontrada.</div>
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
