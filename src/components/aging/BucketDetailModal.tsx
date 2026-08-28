import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { OpenDocumentDetail } from '../../types/database';
import { formatDate, formatMoney } from '../../lib/formatters';
import { X, FileText } from 'lucide-react';

interface BucketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  supplierId?: number;
  sellerId?: number;
  currency: string;
  context: 'AGING' | 'PROJECTION';
  bucketCode?: string;
  cutoffDate: string;
  weekStart?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  expectedAmount?: number;
}

export const BucketDetailModal: React.FC<BucketDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  supplierId,
  sellerId,
  currency,
  context,
  bucketCode,
  cutoffDate,
  weekStart,
  dateFrom,
  dateTo,
  expectedAmount,
}) => {
  const [documents, setDocuments] = useState<OpenDocumentDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || (!supplierId && !sellerId)) return;

    const fetchDetail = async () => {
      setLoading(true);
      try {
        if (sellerId) {
          const { data, error } = await supabase.rpc('rpc_get_seller_documents_detail', {
            p_seller_id: sellerId,
            p_currency: currency,
            p_context: context,
            p_bucket_code: bucketCode || null,
            p_cutoff_date: cutoffDate,
          });

          if (error) throw error;
          setDocuments(data || []);
        } else if (supplierId) {
          const { data, error } = await supabase.rpc('rpc_get_open_documents_detail', {
            p_supplier_id: supplierId,
            p_currency: currency,
            p_context: context,
            p_bucket_code: bucketCode || null,
            p_cutoff_date: cutoffDate,
            p_week_start: weekStart || null,
            p_date_from: dateFrom || null,
            p_date_to: dateTo || null,
          });

          if (error) throw error;
          setDocuments(data || []);
        }
      } catch (err) {
        console.error('Error fetching bucket documents detail:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [isOpen, supplierId, sellerId, currency, context, bucketCode, cutoffDate, weekStart, dateFrom, dateTo]);

  if (!isOpen) return null;

  const totalCalculated = documents.reduce((acc, d) => acc + (d.reference_balance || 0), 0);

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
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>{title}</span>
                <span className="text-xs font-mono font-normal bg-slate-800 text-sky-300 px-2 py-0.5 rounded border border-slate-700">
                  {currency}
                </span>
              </h2>
              <p className="text-xs text-slate-400">{subtitle}</p>
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Reconciliation Banner */}
          <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60 flex items-center justify-between font-mono">
            <div>
              <span className="text-[10px] text-slate-400 font-sans uppercase block">Comprobantes</span>
              <span className="font-bold text-white text-sm">{documents.length} documento(s)</span>
            </div>

            {expectedAmount !== undefined && (
              <div>
                <span className="text-[10px] text-slate-400 font-sans uppercase block">Importe de Celda</span>
                <span className="font-bold text-slate-300 text-sm">
                  {formatMoney(expectedAmount)} {currency}
                </span>
              </div>
            )}

            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-sans uppercase block">Suma del Detalle</span>
              <span className={`font-bold text-base ${totalCalculated < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatMoney(totalCalculated)} {currency}
              </span>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-12 text-center text-slate-400">Cargando comprobantes...</div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-slate-500 italic">No hay comprobantes en este rango.</div>
          ) : (
            <div className="bg-slate-800/20 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 whitespace-nowrap">ID Doc</th>
                    <th className="px-4 py-2.5">Comprobante</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Tipo</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Emisión</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Vencimiento</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">Importe Total</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">Saldo Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {documents.map((doc) => (
                    <tr key={doc.document_id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-bold">#{doc.document_id}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-white whitespace-nowrap">{doc.human_reference}</div>
                        {doc.concept && <div className="text-[10px] text-slate-400 font-sans truncate max-w-xs">{doc.concept}</div>}
                      </td>
                      <td className="px-4 py-3 font-sans whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300 font-semibold">
                          {doc.document_type_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-sans text-slate-300 whitespace-nowrap">
                        {formatDate(doc.issue_date)}
                      </td>
                      <td className="px-4 py-3 font-sans whitespace-nowrap">
                        {doc.due_date ? (
                          <span className={doc.due_date < cutoffDate ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                            {formatDate(doc.due_date)}
                          </span>
                        ) : (
                          <span className="text-amber-400 italic">Sin Vto</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 font-bold whitespace-nowrap">
                        {formatMoney(doc.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                        <span className={doc.reference_balance < 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {doc.reference_balance < 0 ? `-${formatMoney(Math.abs(doc.reference_balance))}` : `+${formatMoney(doc.reference_balance)}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
