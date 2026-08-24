import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { extractInvoiceFromStorage, ExtractedInvoicePayload } from '../../lib/aiExtractor';
import { X, Smartphone, Loader2, CheckCircle2, Copy, AlertCircle } from 'lucide-react';

interface MobileCaptureQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtractionReady: (data: ExtractedInvoicePayload, fileId?: number) => void;
}

export const MobileCaptureQRModal: React.FC<MobileCaptureQRModalProps> = ({
  isOpen,
  onClose,
  onExtractionReady,
}) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'INITIALIZING' | 'WAITING_PHOTO' | 'EXTRACTING' | 'DONE' | 'EXPIRED' | 'ERROR'>('INITIALIZING');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize Session
  useEffect(() => {
    if (!isOpen) {
      setSessionToken(null);
      setStatus('INITIALIZING');
      return;
    }

    const createSession = async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_create_upload_session', {
          p_expires_in_minutes: 15,
        });

        if (error) throw error;
        if (data && data.session_token) {
          setSessionToken(data.session_token);
          setStatus('WAITING_PHOTO');
        } else {
          throw new Error('No se pudo generar la sesión de carga');
        }
      } catch (err: any) {
        console.error('Error creating upload session:', err);
        setErrorMsg(err.message || 'Error al iniciar sesión de captura móvil');
        setStatus('ERROR');
      }
    };

    createSession();
  }, [isOpen]);

  // Polling for mobile upload completion
  useEffect(() => {
    if (!isOpen || !sessionToken || status !== 'WAITING_PHOTO') return;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_get_upload_session_status', {
          p_session_token: sessionToken,
        });

        if (error) return;

        if (data) {
          if (data.status === 'EXPIRED') {
            setStatus('EXPIRED');
            clearInterval(interval);
          } else if (data.status === 'UPLOADED' && data.storage_path) {
            setStatus('EXTRACTING');
            clearInterval(interval);

            // Execute AI Extraction
            const extractionRes = await extractInvoiceFromStorage(
              data.storage_path,
              data.file_name || 'mobile_capture.jpg',
              data.mime_type || 'image/jpeg',
              data.file_id
            );

            setStatus('DONE');
            setTimeout(() => {
              onExtractionReady(extractionRes.data, extractionRes.file_id);
              onClose();
            }, 600);
          }
        }
      } catch (err) {
        console.error('Error checking session status:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isOpen, sessionToken, status, onExtractionReady, onClose]);

  if (!isOpen) return null;

  const mobileUrl = sessionToken
    ? `${window.location.origin}/?capture_token=${sessionToken}`
    : '';

  // Quick Google Chart API QR Generator (or standard vector SVG)
  const qrCodeUrl = mobileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(mobileUrl)}&bgcolor=0f172a&color=38bdf8&margin=8`
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-center">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-2.5 text-left">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Captura desde Celular</h3>
              <p className="text-[11px] text-slate-400">Escaneá el código con la cámara de tu móvil</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {status === 'INITIALIZING' && (
            <div className="py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Generando sesión segura...</p>
            </div>
          )}

          {status === 'WAITING_PHOTO' && (
            <div className="space-y-4">
              {/* QR Code Container */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 inline-block shadow-inner">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="QR Captura Móvil"
                    className="w-56 h-56 rounded-xl mx-auto border border-sky-500/20"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-slate-500 text-xs">
                    Cargando QR...
                  </div>
                )}
              </div>

              {/* Status Pulse */}
              <div className="flex items-center justify-center space-x-2 text-xs text-sky-300">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
                </span>
                <span className="font-medium">Esperando foto desde el celular...</span>
              </div>

              {/* Copy URL option */}
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/60 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400 truncate max-w-[240px]">{mobileUrl}</span>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Sesión temporal válida por 15 minutos. No requiere iniciar sesión en el celular.
              </p>
            </div>
          )}

          {status === 'EXTRACTING' && (
            <div className="py-12 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">¡Foto recibida del celular!</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Extrayendo datos fiscales y comprobante con IA...
                </p>
              </div>
            </div>
          )}

          {status === 'DONE' && (
            <div className="py-12 space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-xs font-bold text-white">¡Extracción completada!</p>
            </div>
          )}

          {status === 'EXPIRED' && (
            <div className="py-8 space-y-3 text-amber-300">
              <AlertCircle className="w-8 h-8 mx-auto" />
              <p className="text-xs">La sesión temporal ha expirado.</p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold"
              >
                Cerrar y Reintentar
              </button>
            </div>
          )}

          {status === 'ERROR' && (
            <div className="py-8 space-y-3 text-rose-400">
              <AlertCircle className="w-8 h-8 mx-auto" />
              <p className="text-xs">{errorMsg || 'Error inesperado'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
