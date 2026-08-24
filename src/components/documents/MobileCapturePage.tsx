import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Camera, CheckCircle2, RotateCcw, Upload, AlertCircle, Building2, Loader2 } from 'lucide-react';

interface MobileCapturePageProps {
  captureToken: string;
}

export const MobileCapturePage: React.FC<MobileCapturePageProps> = ({ captureToken }) => {
  const [sessionInfo, setSessionInfo] = useState<any | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate session token on load
  useEffect(() => {
    const validateToken = async () => {
      setLoadingSession(true);
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con el servidor')), 8000)
        );

        const rpcPromise = supabase.rpc('rpc_get_upload_session_status', {
          p_session_token: captureToken,
        });

        const { data, error: rpcErr }: any = await Promise.race([rpcPromise, timeoutPromise]);

        if (rpcErr) throw rpcErr;
        if (!data || !data.valid) {
          throw new Error(data?.error || 'La sesión de captura no es válida o ha expirado.');
        }

        if (data.status !== 'PENDING') {
          throw new Error(`Esta sesión ya fue utilizada o se encuentra en estado: ${data.status}`);
        }

        setSessionInfo(data);
      } catch (err: any) {
        console.error('Error validating mobile capture session:', err);
        setError(err.message || 'Enlace inválido o expirado.');
      } finally {
        setLoadingSession(false);
      }
    };

    validateToken();
  }, [captureToken]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !sessionInfo) return;
    setUploading(true);
    setError(null);

    try {
      // 1. Prepare sanitized file path
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `temp-uploads/${sessionInfo.session_id}/${Date.now()}_${sanitizedName}`;

      // 2. Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('supplier-documents')
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // 3. Submit upload record via RPC
      const { data: submitRes, error: submitErr } = await supabase.rpc('rpc_submit_mobile_upload', {
        p_session_token: captureToken,
        p_storage_path: storagePath,
        p_file_name: selectedFile.name,
        p_mime_type: selectedFile.type || 'image/jpeg',
        p_file_size: selectedFile.size,
      });

      if (submitErr) throw submitErr;
      if (submitRes && submitRes.success) {
        setUploadSuccess(true);
      } else {
        throw new Error('No se pudo confirmar la recepción del comprobante');
      }
    } catch (err: any) {
      console.error('Error uploading mobile document:', err);
      setError(err.message || 'Error al enviar la imagen');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 font-sans">
      {/* Brand Header */}
      <header className="w-full max-w-md pt-4 flex items-center justify-center space-x-2.5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="text-left">
          <h1 className="text-base font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            León Proveedores
          </h1>
          <p className="text-[10px] text-sky-400 font-semibold tracking-wide uppercase">
            Captura Móvil de Comprobante
          </p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-md my-auto py-6">
        {loadingSession ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Verificando sesión segura...</p>
          </div>
        ) : error ? (
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-white">Sesión no disponible</h2>
            <p className="text-xs text-slate-400">{error}</p>
          </div>
        ) : uploadSuccess ? (
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-bold text-white">¡Comprobante Enviado!</h2>
            <p className="text-xs text-emerald-300/90 leading-relaxed">
              La imagen se transfirió exitosamente a la computadora. Ya puedes volver a la pantalla de tu PC para revisar los datos extraídos por la IA y confirmar el documento.
            </p>
            <div className="pt-4 text-[11px] text-slate-500">
              Puedes cerrar esta pestaña en tu celular.
            </div>
          </div>
        ) : previewUrl ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 max-h-96 flex items-center justify-center">
              <img src={previewUrl} alt="Preview Comprobante" className="object-contain max-h-96 w-full" />
            </div>

            <p className="text-[11px] text-center text-slate-400">
              Asegurate de que los números, fecha y CUIT sean legibles.
            </p>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={uploading}
                className="flex-1 flex items-center justify-center space-x-1.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Repetir Foto</span>
              </button>

              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 flex items-center justify-center space-x-1.5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Confirmar y Enviar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-6 shadow-2xl">
            <div className="space-y-2">
              <h2 className="text-base font-bold text-white">Fotografiar Comprobante</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Apuntá con buena luz enfocando el comprobante completo.
              </p>
            </div>

            {/* Hidden native input */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 rounded-3xl bg-gradient-to-b from-sky-500/20 to-sky-600/10 border-2 border-dashed border-sky-500/40 hover:border-sky-400 text-sky-300 flex flex-col items-center justify-center space-y-3 active:scale-98 transition-all"
            >
              <div className="w-16 h-16 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/30">
                <Camera className="w-8 h-8" />
              </div>
              <span className="text-sm font-bold text-white">Abrir Cámara</span>
              <span className="text-[11px] text-slate-400">o elegir foto de la galería</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md pb-4 text-center text-[10px] text-slate-600 font-mono">
        Sesión Segura • León Proveedores
      </footer>
    </div>
  );
};
