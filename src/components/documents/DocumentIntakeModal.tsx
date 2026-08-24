import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { extractInvoiceFromStorage, ExtractedInvoicePayload } from '../../lib/aiExtractor';
import {
  X,
  FileText,
  Image as ImageIcon,
  Smartphone,
  Edit3,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface DocumentIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectManual: () => void;
  onOpenMobileQR: () => void;
  onExtractionReady: (data: ExtractedInvoicePayload, fileId?: number, intakeSource?: string) => void;
}

export const DocumentIntakeModal: React.FC<DocumentIntakeModalProps> = ({
  isOpen,
  onClose,
  onSelectManual,
  onOpenMobileQR,
  onExtractionReady,
}) => {
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [acceptedMimeTypes, setAcceptedMimeTypes] = useState<string>('application/pdf');
  const [currentIntakeSource, setCurrentIntakeSource] = useState<'PDF' | 'IMAGE'>('PDF');

  if (!isOpen) return null;

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Max 15MB
    if (file.size > 15 * 1024 * 1024) {
      setError('El archivo supera el tamaño máximo permitido de 15 MB.');
      return;
    }

    setProcessing(true);
    setError(null);
    setStatusMessage('Subiendo archivo al almacenamiento seguro...');

    try {
      // 1. Upload to Supabase Storage
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `intake-uploads/${Date.now()}_${sanitizedName}`;

      const { error: uploadErr } = await supabase.storage
        .from('supplier-documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // 2. Insert into document_files via RPC
      const { data: regData, error: regErr } = await supabase.rpc('rpc_register_document_file', {
        p_storage_path: storagePath,
        p_file_name: file.name,
        p_mime_type: file.type,
        p_file_size: file.size,
        p_file_category: currentIntakeSource === 'PDF' ? 'INVOICE_PDF' : 'INVOICE_IMAGE',
      });

      if (regErr) throw regErr;
      const fileId = regData?.file_id;

      // 3. AI Extraction
      setStatusMessage('Analizando comprobante y extrayendo campos fiscales con IA...');
      const extractionRes = await extractInvoiceFromStorage(
        storagePath,
        file.name,
        file.type,
        fileId
      );

      setStatusMessage('¡Extracción completada! Abriendo formulario de revisión...');
      setTimeout(() => {
        setProcessing(false);
        onExtractionReady(extractionRes.data, fileId, currentIntakeSource);
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('Error processing intake file:', err);
      setError(err.message || 'Error al procesar el comprobante');
      setProcessing(false);
    }
  };

  const handleTriggerFileInput = (type: 'PDF' | 'IMAGE') => {
    setCurrentIntakeSource(type);
    setAcceptedMimeTypes(type === 'PDF' ? 'application/pdf' : 'image/jpeg,image/png,image/webp');
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept={acceptedMimeTypes}
          onChange={handleFilePicked}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Nuevo Comprobante de Proveedor</h2>
              <p className="text-xs text-slate-400">Seleccioná cómo deseas ingresar el comprobante</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {processing ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mx-auto text-sky-400 shadow-lg shadow-sky-500/20">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Procesando Comprobante</h3>
                <p className="text-xs text-slate-400 mt-1">{statusMessage}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: Manual */}
              <button
                onClick={() => {
                  onSelectManual();
                  onClose();
                }}
                className="group p-5 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-sky-500/50 text-left transition-all flex flex-col justify-between space-y-3"
              >
                <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 w-fit group-hover:scale-105 transition-transform">
                  <Edit3 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-sky-300">
                    Carga Manual
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ingresar número, importes y fechas directamente en el formulario.
                  </p>
                </div>
              </button>

              {/* Option 2: PDF */}
              <button
                onClick={() => handleTriggerFileInput('PDF')}
                className="group p-5 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-rose-500/50 text-left transition-all flex flex-col justify-between space-y-3"
              >
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 w-fit group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-sm font-bold text-white group-hover:text-rose-300">
                      Cargar PDF
                    </h3>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.2 rounded font-mono">
                      IA
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Subir factura en PDF desde tu PC. La IA precompletará los campos.
                  </p>
                </div>
              </button>

              {/* Option 3: Image */}
              <button
                onClick={() => handleTriggerFileInput('IMAGE')}
                className="group p-5 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 text-left transition-all flex flex-col justify-between space-y-3"
              >
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit group-hover:scale-105 transition-transform">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-300">
                      Cargar Imagen
                    </h3>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded font-mono">
                      IA
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Subir foto o escaneo (JPG, PNG, WEBP) desde tu computadora.
                  </p>
                </div>
              </button>

              {/* Option 4: Mobile QR */}
              <button
                onClick={() => {
                  onOpenMobileQR();
                  onClose();
                }}
                className="group p-5 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-amber-500/50 text-left transition-all flex flex-col justify-between space-y-3"
              >
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit group-hover:scale-105 transition-transform">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-300">
                      Capturar con Celular
                    </h3>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 rounded font-mono">
                      QR
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Escanear QR y tomar foto directamente con la cámara del celular.
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
