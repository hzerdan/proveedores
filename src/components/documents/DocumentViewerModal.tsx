import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  FileText,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { DocumentFile } from '../../types/database';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number | null;
  humanReference?: string;
  initialFileId?: number;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  documentId,
  humanReference = 'Comprobante',
  initialFileId
}) => {
  const { hasPermission } = useAuth();
  const canViewDocuments = hasPermission('documents.view');
  const canViewAudit = hasPermission('audit.view');

  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<DocumentFile | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingUrl, setLoadingUrl] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Check if there is an AI extraction or derivative for audit navigation
  const [hasAiAudit, setHasAiAudit] = useState<boolean>(false);

  // Image controls
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  // Load files for this document (strictly original files for habitual viewer)
  const loadFiles = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('document_files')
        .select('*')
        .eq('document_id', documentId)
        .order('id', { ascending: true });

      if (fetchErr) throw fetchErr;

      const loadedFiles: DocumentFile[] = data || [];
      setFiles(loadedFiles);

      // Check if there is an AI extraction or derivative
      const hasDeriv = loadedFiles.some(f => f.file_role === 'AI_DERIVATIVE');
      if (hasDeriv) {
        setHasAiAudit(true);
      } else {
        // Query if an AI extraction exists
        const { count } = await supabase
          .from('document_ai_extractions')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', documentId);
        setHasAiAudit((count || 0) > 0);
      }

      // Filter only originals for the normal viewer
      const originalFiles = loadedFiles.filter(f => f.file_role !== 'AI_DERIVATIVE');
      if (originalFiles.length > 0) {
        let initial: DocumentFile | undefined;
        if (initialFileId) {
          initial = originalFiles.find(f => f.id === initialFileId);
        }
        if (!initial) {
          initial = originalFiles[0];
        }
        setSelectedFile(initial);
      } else {
        setSelectedFile(null);
      }
    } catch (err: any) {
      console.error('Error loading document files:', err);
      setError(err.message || 'Error al cargar los archivos del comprobante.');
    } finally {
      setLoading(false);
    }
  }, [documentId, initialFileId]);

  // Request signed ephemeral URL (300s TTL) with backend permission check + storage RLS
  const fetchSignedUrl = useCallback(async (file: DocumentFile) => {
    if (!documentId) return;
    setLoadingUrl(true);
    setError(null);
    try {
      // 1. Authorize access via security definer RPC
      const { data: authData, error: rpcErr } = await supabase.rpc('rpc_get_document_file_url', {
        p_file_id: file.id,
        p_document_id: documentId,
        p_expires_in: 300
      });

      if (rpcErr) throw rpcErr;
      if (!authData || !(authData as any).storage_path) {
        throw new Error('No se pudo validar la autorización de acceso al comprobante.');
      }

      const meta = authData as { storage_bucket: string; storage_path: string; expires_in_seconds: number };

      // 2. Generate signed ephemeral URL (300s TTL) verified by storage.objects RLS
      const { data: signedData, error: signErr } = await supabase.storage
        .from(meta.storage_bucket || 'supplier-documents')
        .createSignedUrl(meta.storage_path, meta.expires_in_seconds || 300);

      if (signErr) throw signErr;
      if (!signedData?.signedUrl) {
        throw new Error('No se pudo generar el enlace seguro de descarga.');
      }

      setSignedUrl(signedData.signedUrl);
      // Reset image transform
      setZoom(1);
      setRotation(0);
    } catch (err: any) {
      console.error('Error fetching signed URL:', err);
      setError(err.message || 'No se pudo obtener la URL firmada de descarga.');
      setSignedUrl(null);
    } finally {
      setLoadingUrl(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen && documentId) {
      loadFiles();
    } else {
      setFiles([]);
      setSelectedFile(null);
      setSignedUrl(null);
      setError(null);
    }
  }, [isOpen, documentId, loadFiles]);

  useEffect(() => {
    if (selectedFile) {
      fetchSignedUrl(selectedFile);
    } else {
      setSignedUrl(null);
    }
  }, [selectedFile, fetchSignedUrl]);

  if (!isOpen) return null;

  // Habitual viewer strictly displays ORIGINAL / primary files.
  // AI derivatives are strictly segregated into Audit (audit.view required).
  const visibleFiles = files.filter(f => f.file_role !== 'AI_DERIVATIVE');

  const isPdf = selectedFile?.mime_type?.includes('pdf') || selectedFile?.file_name.toLowerCase().endsWith('.pdf');
  const isImage = selectedFile?.mime_type?.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif)$/i.test(selectedFile?.file_name || '');

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {humanReference}
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Original
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {selectedFile ? `${selectedFile.file_name} ${selectedFile.file_size ? `(${formatFileSize(selectedFile.file_size)})` : ''}` : 'Cargando comprobante...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Discreet audit link for ADMIN / ENCARGADO */}
            {canViewAudit && hasAiAudit && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('leon:navigate_tab', {
                      detail: { tab: 'audit_logs', subtab: 'ai_extractions', documentId }
                    })
                  );
                  onClose();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-900/60 transition-colors"
                title="Ver auditoría de extracción en Administración > Auditoría"
              >
                <ExternalLink size={13} />
                <span className="hidden sm:inline">Ver auditoría de extracción</span>
              </button>
            )}

            {/* External Tab / Download */}
            {signedUrl && (
              <>
                <button
                  type="button"
                  onClick={() => window.open(signedUrl, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 transition-colors"
                  title="Abrir en pestaña nueva"
                >
                  <ExternalLink size={14} />
                  <span className="hidden sm:inline">Abrir en pestaña</span>
                </button>
                <a
                  href={signedUrl}
                  download={selectedFile?.file_name || 'comprobante'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                  title="Descargar comprobante original"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Descargar</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
              aria-label="Cerrar visor"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* File Tabs (if multiple visible files) */}
        {visibleFiles.length > 1 && (
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 overflow-x-auto shrink-0">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-2 shrink-0">
              Archivos ({visibleFiles.length}):
            </span>
            {visibleFiles.map((file) => {
              const isSelected = selectedFile?.id === file.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedFile(file)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                >
                  <FileText size={13} />
                  <span className="truncate max-w-[150px]">{file.file_name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Image Controls toolbar (if image) */}
        {isImage && signedUrl && (
          <div className="flex items-center justify-between px-5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                title="Reducir zoom"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-slate-600 dark:text-slate-400 font-mono w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                title="Aumentar zoom"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={() => { setZoom(1); setRotation(0); }}
                className="px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs"
              >
                Restablecer
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                title="Rotar 90 grados a la derecha"
              >
                <RotateCw size={14} />
                <span>Rotar</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-auto bg-slate-200/50 dark:bg-slate-950 flex items-center justify-center p-4 relative">
          {!canViewDocuments ? (
            <div className="flex flex-col items-center justify-center text-center p-8 max-w-md">
              <ShieldAlert size={48} className="text-amber-500 mb-3" />
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
                Acceso no autorizado
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Se requiere el permiso <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">documents.view</code> para visualizar y descargar comprobantes originales.
              </p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Buscando archivos adjuntos...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center text-center p-6 max-w-md bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm">
              <AlertCircle size={40} className="text-red-500 mb-2" />
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                Error al acceder al archivo
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                {error}
              </p>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => fetchSignedUrl(selectedFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                >
                  <RefreshCw size={13} />
                  <span>Reintentar enlace seguro</span>
                </button>
              )}
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8 max-w-md">
              <FileText size={48} className="text-slate-300 dark:text-slate-700 mb-3" />
              <h4 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sin comprobante adjunto
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Este comprobante fue emitido o registrado de forma manual sin adjuntar un archivo digital.
              </p>
            </div>
          ) : loadingUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Generando acceso seguro al archivo...
              </span>
            </div>
          ) : isPdf && signedUrl ? (
            <iframe
              src={signedUrl}
              className="w-full h-full rounded-lg shadow-inner bg-white border border-slate-300 dark:border-slate-800"
              title={selectedFile?.file_name || 'Comprobante PDF'}
            />
          ) : isImage && signedUrl ? (
            <div className="w-full h-full flex items-center justify-center overflow-auto">
              <img
                src={signedUrl}
                alt={selectedFile?.file_name || 'Comprobante Original'}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-in-out'
                }}
                className="max-w-full max-h-full object-contain shadow-md rounded border border-slate-300 dark:border-slate-800 bg-white"
              />
            </div>
          ) : signedUrl ? (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-md">
              <FileText size={48} className="text-blue-500 mb-3" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
                {selectedFile?.file_name}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Este formato de archivo no permite visualización directa integrada.
              </p>
              <a
                href={signedUrl}
                download={selectedFile?.file_name}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Download size={15} />
                <span>Descargar archivo ({formatFileSize(selectedFile?.file_size)})</span>
              </a>
            </div>
          ) : null}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2 shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            {selectedFile && (
              <>
                <span>
                  <strong>Formato:</strong> {selectedFile.mime_type || 'Desconocido'}
                </span>
                {selectedFile.file_size && (
                  <span>
                    <strong>Tamaño:</strong> {formatFileSize(selectedFile.file_size)}
                  </span>
                )}
                <span>
                  <strong>Subido:</strong> {new Date(selectedFile.created_at).toLocaleString('es-AR')}
                </span>
                {selectedFile.file_role === 'AI_DERIVATIVE' && selectedFile.source_file_id && (
                  <span className="text-purple-600 dark:text-purple-400 font-medium">
                    Vinculado con original #{selectedFile.source_file_id}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Enlace efímero con vigencia de 300 segundos
            </span>
            {selectedFile && (
              <button
                type="button"
                onClick={() => fetchSignedUrl(selectedFile)}
                className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                title="Actualizar enlace de acceso"
              >
                <RefreshCw size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
