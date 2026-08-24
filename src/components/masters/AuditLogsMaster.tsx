import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, formatMoney } from '../../lib/formatters';
import {
  ClipboardList,
  AlertTriangle,
  Undo2,
  ArrowRight,
} from 'lucide-react';

export const AuditLogsMaster: React.FC = () => {
  const [dupLogs, setDupLogs] = useState<any[]>([]);
  const [revLogs, setRevLogs] = useState<any[]>([]);
  const [currentTab, setCurrentTab] = useState<'duplicates' | 'reversals'>('duplicates');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // 1. Fetch duplicate override logs
      const { data: dlData } = await supabase
        .from('duplicate_override_logs')
        .select(`
          id,
          reason,
          authorized_at,
          document:documents!duplicate_override_logs_document_id_fkey (
            id,
            human_reference,
            total_amount
          ),
          matched_document:documents!duplicate_override_logs_matched_document_id_fkey (
            id,
            human_reference,
            total_amount
          ),
          authorizer:profiles!duplicate_override_logs_authorized_by_fkey (
            first_name,
            last_name,
            email
          )
        `)
        .order('authorized_at', { ascending: false });
      setDupLogs(dlData || []);

      // 2. Fetch application reversals
      const { data: arData } = await supabase
        .from('application_reversals')
        .select(`
          id,
          reversal_reason,
          created_at,
          reversal_document:documents!application_reversals_reversal_document_id_fkey (
            id,
            human_reference
          ),
          application:document_applications!application_reversals_application_id_fkey (
            id,
            applied_amount,
            source_document_id,
            target_document_id,
            source_doc:documents!document_applications_source_document_id_fkey(human_reference),
            target_doc:documents!document_applications_target_document_id_fkey(human_reference)
          ),
          creator:profiles!application_reversals_created_by_fkey (
            first_name,
            last_name,
            email
          )
        `)
        .order('created_at', { ascending: false });
      setRevLogs(arData || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl shadow-black/20">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Auditoría y Trazabilidad de Excepciones</h1>
            <p className="text-xs text-slate-400">
              Historial inmutable de excepciones de duplicados autorizadas y aplicaciones desimputadas
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700/60 text-xs">
          <button
            onClick={() => setCurrentTab('duplicates')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              currentTab === 'duplicates'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Excepciones de Duplicados ({dupLogs.length})</span>
          </button>

          <button
            onClick={() => setCurrentTab('reversals')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              currentTab === 'reversals'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Desimputaciones ({revLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Tables */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
        <div className="overflow-x-auto">
          {currentTab === 'duplicates' ? (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Fecha / Hora (DD-MM-YYYY)</th>
                  <th className="px-6 py-4">Comprobante Autorizado</th>
                  <th className="px-6 py-4">Comprobante Coincidente</th>
                  <th className="px-6 py-4">Motivo Justificativo de Excepción</th>
                  <th className="px-6 py-4">Autorizado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Cargando auditoría...
                    </td>
                  </tr>
                ) : dupLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      No se han registrado excepciones de comprobantes duplicados.
                    </td>
                  </tr>
                ) : (
                  dupLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.authorized_at)}
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-white">
                          {log.document?.human_reference}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          ID: #{log.document?.id} • {formatMoney(log.document?.total_amount)}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-amber-300">
                          {log.matched_document?.human_reference}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          ID: #{log.matched_document?.id} • {formatMoney(log.matched_document?.total_amount)}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-200 bg-slate-800/20 max-w-xs rounded">
                        "{log.reason}"
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-200">
                          {log.authorizer?.first_name} {log.authorizer?.last_name}
                        </div>
                        <div className="text-[10px] text-slate-500">{log.authorizer?.email}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Fecha / Hora (DD-MM-YYYY)</th>
                  <th className="px-6 py-4">Documento Desimputación</th>
                  <th className="px-6 py-4">Aplicación Neutralizada</th>
                  <th className="px-6 py-4 text-right">Importe Restaurado</th>
                  <th className="px-6 py-4">Motivo de Reversión</th>
                  <th className="px-6 py-4">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Cargando auditoría...
                    </td>
                  </tr>
                ) : revLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      No se han registrado desimputaciones de aplicaciones.
                    </td>
                  </tr>
                ) : (
                  revLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-violet-300">
                          {log.reversal_document?.human_reference}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          ID: #{log.reversal_document?.id}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-1.5 font-mono font-semibold">
                          <span className="text-emerald-400">
                            {log.application?.source_doc?.human_reference}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <span className="text-rose-400">
                            {log.application?.target_doc?.human_reference}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          App ID: #{log.application?.id}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                        {formatMoney(log.application?.applied_amount)}
                      </td>

                      <td className="px-6 py-4 text-slate-200 bg-slate-800/20 max-w-xs rounded">
                        "{log.reversal_reason}"
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-200">
                          {log.creator?.first_name} {log.creator?.last_name}
                        </div>
                        <div className="text-[10px] text-slate-500">{log.creator?.email}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
