import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, formatMoney, formatDate } from '../../lib/formatters';
import {
  ClipboardList,
  AlertTriangle,
  Undo2,
  UserCheck,
  CheckCircle2,
  Bot,
  Eye,
  X,
  ExternalLink,
  Download,
  FileText,
  Sparkles,
  Layers,
  AlertCircle
} from 'lucide-react';

export const AuditLogsMaster: React.FC = () => {
  const [dupLogs, setDupLogs] = useState<any[]>([]);
  const [revLogs, setRevLogs] = useState<any[]>([]);
  const [sellerLogs, setSellerLogs] = useState<any[]>([]);
  const [aiLogs, setAiLogs] = useState<any[]>([]);
  const [currentTab, setCurrentTab] = useState<'duplicates' | 'reversals' | 'seller_changes' | 'ai_extractions'>('duplicates');
  const [loading, setLoading] = useState(true);

  // Deep link filter by documentId
  const [filterDocId, setFilterDocId] = useState<number | null>(null);

  // Selected extraction modal state
  const [selectedExtraction, setSelectedExtraction] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [derivativeUrl, setDerivativeUrl] = useState<string | null>(null);
  const [derivativeFile, setDerivativeFile] = useState<any | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'compare' | 'payload' | 'technical'>('compare');

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

      // 3. Fetch seller change audit logs
      const { data: scData } = await supabase
        .from('document_seller_history')
        .select(`
          id,
          reason,
          change_type,
          relation_validity_status,
          changed_at,
          document:documents!document_seller_history_document_id_fkey (
            id,
            human_reference,
            total_amount,
            issue_date,
            supplier:suppliers(trade_name)
          ),
          old_seller:sellers!document_seller_history_old_seller_id_fkey (
            id,
            display_name,
            code
          ),
          new_seller:sellers!document_seller_history_new_seller_id_fkey (
            id,
            display_name,
            code
          ),
          changer:profiles!document_seller_history_changed_by_fkey (
            first_name,
            last_name,
            email
          )
        `)
        .order('changed_at', { ascending: false });
      setSellerLogs(scData || []);

      // 4. Fetch AI extraction logs
      const { data: aiData } = await supabase
        .from('document_ai_extractions')
        .select(`
          id,
          file_id,
          document_id,
          model_name,
          model_provider,
          extracted_raw_payload,
          confidence_score,
          extraction_duration_ms,
          status,
          error_message,
          confirmed_payload_diff,
          extracted_at,
          file:document_files!document_ai_extractions_file_id_fkey (
            id,
            file_name,
            file_role,
            storage_bucket,
            storage_path,
            mime_type,
            file_size_bytes
          ),
          document:documents!document_ai_extractions_document_id_fkey (
            id,
            human_reference,
            total_amount,
            issue_date,
            supplier:suppliers(trade_name)
          ),
          creator:profiles!document_ai_extractions_created_by_fkey (
            first_name,
            last_name,
            email
          )
        `)
        .order('extracted_at', { ascending: false });
      setAiLogs(aiData || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Listen to deep navigation from DocumentViewerModal or elsewhere
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string; subtab?: string; documentId?: number }>;
      if (customEvent.detail?.tab === 'audit_logs') {
        if (customEvent.detail.subtab === 'ai_extractions') {
          setCurrentTab('ai_extractions');
          if (customEvent.detail.documentId) {
            setFilterDocId(customEvent.detail.documentId);
          }
        }
      }
    };
    window.addEventListener('leon:navigate_tab', handleNavigate);
    return () => window.removeEventListener('leon:navigate_tab', handleNavigate);
  }, []);

  // Load files and signed URLs for selected extraction
  const handleOpenExtractionDetail = useCallback(async (extraction: any) => {
    setSelectedExtraction(extraction);
    setActiveModalTab('compare');
    setModalLoading(true);
    setOriginalUrl(null);
    setDerivativeUrl(null);
    setDerivativeFile(null);

    try {
      // 1. Fetch signed URL for original file via security-definer RPC
      if (extraction.file_id) {
        const { data: origAuth } = await supabase.rpc('rpc_get_document_file_url', {
          p_file_id: extraction.file_id,
          p_document_id: extraction.document_id || null,
          p_expires_in: 300
        });

        if (origAuth && (origAuth as any).storage_path) {
          const meta = origAuth as { storage_bucket: string; storage_path: string; expires_in_seconds: number };
          const { data: sData } = await supabase.storage
            .from(meta.storage_bucket || 'supplier-documents')
            .createSignedUrl(meta.storage_path, meta.expires_in_seconds || 300);
          if (sData?.signedUrl) {
            setOriginalUrl(sData.signedUrl);
          }
        }
      }

      // 2. Look for AI_DERIVATIVE file associated with document or parent file
      let derivQuery = supabase.from('document_files').select('*').eq('file_role', 'AI_DERIVATIVE');
      if (extraction.document_id) {
        derivQuery = derivQuery.eq('document_id', extraction.document_id);
      } else if (extraction.file_id) {
        derivQuery = derivQuery.eq('parent_file_id', extraction.file_id);
      }

      const { data: dFiles } = await derivQuery.limit(1);
      const deriv = dFiles && dFiles.length > 0 ? dFiles[0] : null;
      setDerivativeFile(deriv);

      if (deriv) {
        // Request signed URL for derivative (audit.view required)
        const { data: derivAuth } = await supabase.rpc('rpc_get_document_file_url', {
          p_file_id: deriv.id,
          p_document_id: extraction.document_id || null,
          p_expires_in: 300
        });

        if (derivAuth && (derivAuth as any).storage_path) {
          const meta = derivAuth as { storage_bucket: string; storage_path: string; expires_in_seconds: number };
          const { data: sData } = await supabase.storage
            .from(meta.storage_bucket || 'supplier-documents')
            .createSignedUrl(meta.storage_path, meta.expires_in_seconds || 300);
          if (sData?.signedUrl) {
            setDerivativeUrl(sData.signedUrl);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching extraction detail files:', err);
    } finally {
      setModalLoading(false);
    }
  }, []);

  const filteredAiLogs = filterDocId
    ? aiLogs.filter((log) => log.document_id === filterDocId)
    : aiLogs;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl shadow-black/20">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Auditoría y Trazabilidad</h1>
            <p className="text-xs text-slate-400">
              Historial inmutable de excepciones, desimputaciones, reclasificaciones y extracciones de IA
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700/60 text-xs">
          <button
            type="button"
            onClick={() => {
              setCurrentTab('duplicates');
              setFilterDocId(null);
            }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              currentTab === 'duplicates'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Duplicados ({dupLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentTab('reversals');
              setFilterDocId(null);
            }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              currentTab === 'reversals'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Desimputaciones ({revLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentTab('seller_changes');
              setFilterDocId(null);
            }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              currentTab === 'seller_changes'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Vendedores ({sellerLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentTab('ai_extractions');
            }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
              currentTab === 'ai_extractions'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Extracciones IA ({aiLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Active Filter Pill if filtered by documentId */}
      {currentTab === 'ai_extractions' && filterDocId && (
        <div className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Filtrando extracciones del Comprobante <strong>#{filterDocId}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => setFilterDocId(null)}
            className="flex items-center gap-1 text-purple-300 hover:text-white px-2 py-0.5 rounded bg-purple-500/20"
          >
            <X size={13} />
            <span>Quitar filtro</span>
          </button>
        </div>
      )}

      {/* Tables */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
        <div className="overflow-x-auto">
          {/* 1. DUPLICATE OVERRIDE LOGS */}
          {currentTab === 'duplicates' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Fecha / Hora</th>
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
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No se han registrado autorizaciones de comprobantes duplicados.
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
                        <div className="text-[10px] text-slate-400">
                          {formatMoney(log.document?.total_amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-amber-300">
                          {log.matched_document?.human_reference}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatMoney(log.matched_document?.total_amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-200 bg-slate-800/20 max-w-xs rounded italic">
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
          )}

          {/* 2. REVERSAL LOGS */}
          {currentTab === 'reversals' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Fecha / Hora</th>
                  <th className="px-6 py-4">Comprobante Desimputador</th>
                  <th className="px-6 py-4">Imputación Afectada</th>
                  <th className="px-6 py-4">Importe Revertido</th>
                  <th className="px-6 py-4">Motivo de Reversión</th>
                  <th className="px-6 py-4">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Cargando reversiones...
                    </td>
                  </tr>
                ) : revLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No se han registrado desimputaciones o reversiones.
                    </td>
                  </tr>
                ) : (
                  revLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-violet-300">
                          {log.reversal_document?.human_reference || 'Comprobante APL-REV'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-1.5 font-mono text-slate-200">
                          <span>{log.application?.source_doc?.human_reference}</span>
                          <span className="text-slate-500">➔</span>
                          <span>{log.application?.target_doc?.human_reference}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-rose-400">
                        {formatMoney(log.application?.applied_amount)}
                      </td>
                      <td className="px-6 py-4 text-slate-200 bg-slate-800/20 max-w-xs rounded italic">
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

          {/* 3. SELLER CHANGES */}
          {currentTab === 'seller_changes' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Fecha / Hora</th>
                  <th className="px-6 py-4">Comprobante Afectado</th>
                  <th className="px-6 py-4">Naturaleza del Cambio</th>
                  <th className="px-6 py-4">Vendedor Anterior ➔ Nuevo</th>
                  <th className="px-6 py-4">Validación Temporal</th>
                  <th className="px-6 py-4">Motivo Justificativo</th>
                  <th className="px-6 py-4">Modificado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      Cargando modificaciones de vendedor...
                    </td>
                  </tr>
                ) : sellerLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No se han registrado modificaciones de vendedor en comprobantes.
                    </td>
                  </tr>
                ) : (
                  sellerLogs.map((log) => {
                    const isAssignment = log.change_type === 'HISTORICAL_ASSIGNMENT';
                    const isValid = log.relation_validity_status === 'VALID_FOR_DOCUMENT_DATE';
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                          {formatDateTime(log.changed_at)}
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-mono font-bold text-white">
                            {log.document?.human_reference}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {log.document?.supplier?.trade_name} • Fecha: {formatDate(log.document?.issue_date)}
                          </div>
                        </td>

                        <td className="px-6 py-4">
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

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-mono">
                              {log.old_seller?.display_name || 'Sin asignar'}
                            </span>
                            <span className="text-sky-400 font-bold">➔</span>
                            <span className="text-emerald-400 font-mono font-semibold">
                              {log.new_seller?.display_name}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
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

                        <td className="px-6 py-4 text-slate-200 bg-slate-800/20 max-w-xs rounded italic">
                          "{log.reason}"
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-200">
                            {log.changer?.first_name} {log.changer?.last_name}
                          </div>
                          <div className="text-[10px] text-slate-500">{log.changer?.email}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* 4. AI EXTRACTIONS AUDIT */}
          {currentTab === 'ai_extractions' && (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Fecha / Hora</th>
                  <th className="px-6 py-4">Comprobante / Proveedor</th>
                  <th className="px-6 py-4">Modelo & Proveedor</th>
                  <th className="px-6 py-4">Confianza & Duración</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Auditoría / Comparativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Cargando auditoría de extracciones de IA...
                    </td>
                  </tr>
                ) : filteredAiLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No se han registrado extracciones de IA.
                    </td>
                  </tr>
                ) : (
                  filteredAiLogs.map((log) => {
                    const isSuccess = log.status === 'SUCCESS';
                    const isPartial = log.status === 'PARTIAL';
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                          {formatDateTime(log.extracted_at)}
                        </td>

                        <td className="px-6 py-4">
                          {log.document ? (
                            <div>
                              <div className="font-mono font-bold text-white">
                                {log.document.human_reference}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {log.document.supplier?.trade_name || 'Proveedor'} • {formatMoney(log.document.total_amount)}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-slate-400 italic">Pre-confirmación (Archivo #{log.file_id})</span>
                              <div className="text-[10px] text-slate-500 font-mono">{log.file?.file_name}</div>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span>{log.model_name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{log.model_provider}</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-mono text-slate-200">
                            {log.confidence_score ? `${Math.round(log.confidence_score * 100)}%` : 'N/A'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {log.extraction_duration_ms ? `${log.extraction_duration_ms} ms` : 'Sin registro'}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              isSuccess
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : isPartial
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenExtractionDetail(log)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-300 bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 hover:text-white transition-colors"
                          >
                            <Eye size={13} />
                            <span>Comparar / Detalle</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Modal for AI Extraction Audit */}
      {selectedExtraction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 w-full max-w-5xl h-[88vh] rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Bot size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Auditoría de Extracción #{selectedExtraction.id}</span>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {selectedExtraction.model_name}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comprobante: {selectedExtraction.document?.human_reference || 'Pre-confirmación'} • Fecha: {formatDateTime(selectedExtraction.extracted_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Modal Tabs */}
                <div className="flex bg-slate-800 p-0.5 rounded-lg text-xs font-medium mr-2">
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('compare')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      activeModalTab === 'compare' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Comparativa Original vs Derivado
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('payload')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      activeModalTab === 'payload' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Datos Extraídos (JSON)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('technical')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      activeModalTab === 'technical' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Trazabilidad Técnica
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedExtraction(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-900/60">
              {modalLoading ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                  <span>Cargando autorizaciones seguras y URLs firmadas efímeras...</span>
                </div>
              ) : activeModalTab === 'compare' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[450px]">
                  {/* Left Column: Archivo Original */}
                  <div className="flex flex-col bg-slate-950/60 rounded-xl border border-slate-800 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                        <FileText size={15} />
                        <span>Comprobante Original</span>
                      </div>
                      {originalUrl && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => window.open(originalUrl, '_blank')}
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                            title="Abrir en pestaña"
                          >
                            <ExternalLink size={13} />
                          </button>
                          <a
                            href={originalUrl}
                            download={selectedExtraction.file?.file_name || 'original'}
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                            title="Descargar"
                          >
                            <Download size={13} />
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-3 flex items-center justify-center bg-slate-950">
                      {originalUrl ? (
                        selectedExtraction.file?.mime_type?.includes('pdf') ? (
                          <iframe
                            src={`${originalUrl}#toolbar=0`}
                            className="w-full h-full min-h-[380px] rounded border border-slate-800 bg-white"
                            title="Original PDF"
                          />
                        ) : (
                          <img
                            src={originalUrl}
                            alt="Original"
                            className="max-h-[380px] object-contain rounded"
                          />
                        )
                      ) : (
                        <div className="text-xs text-slate-500 text-center">
                          <AlertCircle className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                          <span>No se pudo generar enlace seguro para el original</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Derivado IA */}
                  <div className="flex flex-col bg-slate-950/60 rounded-xl border border-purple-900/40 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-purple-900/40 bg-purple-950/20">
                      <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
                        <Layers size={15} />
                        <span>Derivado Enviado a IA</span>
                      </div>
                      {derivativeUrl && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => window.open(derivativeUrl, '_blank')}
                            className="p-1 rounded bg-purple-950/60 text-purple-300 hover:text-white"
                            title="Abrir en pestaña"
                          >
                            <ExternalLink size={13} />
                          </button>
                          <a
                            href={derivativeUrl}
                            download={derivativeFile?.file_name || 'derivado_ia'}
                            className="p-1 rounded bg-purple-950/60 text-purple-300 hover:text-white"
                            title="Descargar"
                          >
                            <Download size={13} />
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-3 flex items-center justify-center bg-slate-950">
                      {derivativeUrl ? (
                        derivativeFile?.mime_type?.includes('pdf') ? (
                          <iframe
                            src={`${derivativeUrl}#toolbar=0`}
                            className="w-full h-full min-h-[380px] rounded border border-slate-800 bg-white"
                            title="Derivado PDF"
                          />
                        ) : (
                          <img
                            src={derivativeUrl}
                            alt="Derivado IA"
                            className="max-h-[380px] object-contain rounded"
                          />
                        )
                      ) : (
                        <div className="text-xs text-slate-500 text-center p-4">
                          <Bot className="w-6 h-6 mx-auto mb-1 text-purple-600" />
                          <p className="font-semibold text-slate-400">Sin derivado gráfico persistido</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            La IA procesó directamente el documento nativo o el texto extraído sin generar un archivo derivado separado.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeModalTab === 'payload' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2">
                      Campos Detectados por la IA
                    </h4>
                    <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-3 bg-slate-900 rounded-lg border border-slate-800/80 max-h-[400px]">
                      {JSON.stringify(selectedExtraction.extracted_raw_payload, null, 2)}
                    </pre>
                  </div>
                  {selectedExtraction.confirmed_payload_diff && (
                    <div className="p-4 bg-slate-950 rounded-xl border border-amber-800/40">
                      <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-2">
                        Diferencias / Modificaciones del Operador al Confirmar
                      </h4>
                      <pre className="text-xs font-mono text-amber-200/90 overflow-x-auto p-3 bg-slate-900 rounded-lg border border-slate-800/80">
                        {JSON.stringify(selectedExtraction.confirmed_payload_diff, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                /* Technical Metadata */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Modelo y Proveedor
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500">Modelo:</span>{' '}
                        <span className="font-mono text-white font-semibold">{selectedExtraction.model_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Proveedor:</span>{' '}
                        <span className="font-mono text-white">{selectedExtraction.model_provider}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Duración:</span>{' '}
                        <span className="font-mono text-sky-400">{selectedExtraction.extraction_duration_ms || 0} ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Score de Confianza:</span>{' '}
                        <span className="font-mono text-emerald-400">
                          {selectedExtraction.confidence_score ? `${Math.round(selectedExtraction.confidence_score * 100)}%` : 'No informado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Trazabilidad y Usuario
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500">Operador:</span>{' '}
                        <span className="text-white">
                          {selectedExtraction.creator?.first_name} {selectedExtraction.creator?.last_name} ({selectedExtraction.creator?.email})
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Fecha de Extracción:</span>{' '}
                        <span className="font-mono text-white">{formatDateTime(selectedExtraction.extracted_at)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">ID de Archivo Original:</span>{' '}
                        <span className="font-mono text-slate-300">#{selectedExtraction.file_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Comprobante Asociado:</span>{' '}
                        <span className="font-mono text-slate-300">
                          {selectedExtraction.document_id ? `#${selectedExtraction.document_id} (${selectedExtraction.document?.human_reference})` : 'No confirmado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
