import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Camera, CheckCircle2, RotateCcw, RotateCw, Upload, AlertCircle, Building2, Loader2, Image as ImageIcon } from 'lucide-react';

interface MobileCapturePageProps {
  captureToken: string;
}

/**
 * Resizes, rotates and compresses image on the client before upload (max 2048px, JPEG 0.85)
 * Prevents mobile browser memory crashes, fixes orientation and ensures ultra-fast uploads
 */
function renderProcessedImage(
  img: HTMLImageElement,
  rotationDegrees: number = 0
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const MAX_DIM = 2048;
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > MAX_DIM) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      }
    } else {
      if (height > MAX_DIM) {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    const normRotation = ((rotationDegrees % 360) + 360) % 360;
    const isSwapped = normRotation === 90 || normRotation === 270;

    const canvas = document.createElement('canvas');
    canvas.width = isSwapped ? height : width;
    canvas.height = isSwapped ? width : height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('No se pudo inicializar el procesador de imágenes'));
      return;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((normRotation * Math.PI) / 180);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({ blob, dataUrl });
        } else {
          reject(new Error('Error al comprimir la imagen'));
        }
      },
      'image/jpeg',
      0.85
    );
  });
}

function loadAndProcessImage(file: File, rotationDegrees: number = 0): Promise<{ blob: Blob; dataUrl: string; imgElement: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const res = await renderProcessedImage(img, rotationDegrees);
          resolve({ ...res, imgElement: img });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export const MobileCapturePage: React.FC<MobileCapturePageProps> = ({ captureToken }) => {
  const [sessionInfo, setSessionInfo] = useState<any | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBlob, setSelectedBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState<string>('comprobante.jpg');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawImg, setRawImg] = useState<HTMLImageElement | null>(null);
  const [currentRotation, setCurrentRotation] = useState<number>(0);
  const [processingImage, setProcessingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setProcessingImage(true);
    setError(null);

    try {
      setFileName(file.name || 'comprobante.jpg');
      const { blob, dataUrl, imgElement } = await loadAndProcessImage(file, 0);
      setRawImg(imgElement);
      setCurrentRotation(0);
      setSelectedBlob(blob);
      setPreviewUrl(dataUrl);
    } catch (err: any) {
      console.error('Error processing captured photo:', err);
      setError(err.message || 'Error al procesar la foto');
    } finally {
      setProcessingImage(false);
    }
  };

  const handleRotate = async () => {
    if (!rawImg) return;
    const nextRotation = (currentRotation + 90) % 360;
    setCurrentRotation(nextRotation);
    setProcessingImage(true);
    try {
      const { blob, dataUrl } = await renderProcessedImage(rawImg, nextRotation);
      setSelectedBlob(blob);
      setPreviewUrl(dataUrl);
    } catch (err: any) {
      console.error('Error rotating photo:', err);
      setError('Error al rotar la foto');
    } finally {
      setProcessingImage(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedBlob || !sessionInfo) return;
    setUploading(true);
    setError(null);

    try {
      const sanitizedName = (fileName || 'comprobante.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `temp-uploads/${sessionInfo.session_id}/${Date.now()}_${sanitizedName}`;

      // Convert Blob to File
      const fileToUpload = new File([selectedBlob], sanitizedName, { type: 'image/jpeg' });

      // Upload to Storage
      const { error: uploadErr } = await supabase.storage
        .from('supplier-documents')
        .upload(storagePath, fileToUpload, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) {
        console.error('Storage upload error:', uploadErr);
        throw new Error(`Error de almacenamiento: ${uploadErr.message}`);
      }

      // Submit via RPC
      const { data: submitRes, error: submitErr } = await supabase.rpc('rpc_submit_mobile_upload', {
        p_session_token: captureToken,
        p_storage_path: storagePath,
        p_file_name: sanitizedName,
        p_mime_type: 'image/jpeg',
        p_file_size: selectedBlob.size,
      });

      if (submitErr) {
        console.error('RPC submit error:', submitErr);
        throw new Error(`Error al registrar subida: ${submitErr.message}`);
      }

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
      {/* Persistent Hidden Inputs */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={handleFilePicked}
        className="hidden"
      />
      <input
        type="file"
        accept="image/*"
        ref={galleryInputRef}
        onChange={handleFilePicked}
        className="hidden"
      />

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
        ) : processingImage ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-300 font-bold">Procesando foto del comprobante...</p>
            <p className="text-[11px] text-slate-500">Optimizando resolución para lectura fiscal...</p>
          </div>
        ) : previewUrl ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 max-h-96 flex items-center justify-center">
              <img src={previewUrl} alt="Preview Comprobante" className="object-contain max-h-96 w-full" />
            </div>

            <p className="text-[11px] text-center text-slate-400">
              Asegurate de que los números, fecha y CUIT sean legibles.
            </p>

            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center space-x-2 text-xs text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleRotate}
                disabled={uploading || processingImage}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-2xl bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/40 text-sky-300 hover:text-sky-200 text-xs font-bold transition-all disabled:opacity-50 active:scale-98"
              >
                <RotateCw className="w-4 h-4 text-sky-400" />
                <span>Rotar Foto 90° (Girar Vertical)</span>
              </button>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setRawImg(null);
                    setSelectedBlob(null);
                    setPreviewUrl(null);
                    setCurrentRotation(0);
                    if (cameraInputRef.current) cameraInputRef.current.value = '';
                    if (galleryInputRef.current) galleryInputRef.current.value = '';
                  }}
                  disabled={uploading || processingImage}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Repetir</span>
                </button>

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || processingImage}
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
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-5 shadow-2xl">
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-white">Fotografiar Comprobante</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Apuntá con buena luz enfocando el comprobante completo.
              </p>
            </div>

            {/* Direct Camera Button */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-6 rounded-3xl bg-gradient-to-b from-sky-500/20 to-sky-600/10 border-2 border-dashed border-sky-500/40 hover:border-sky-400 text-sky-300 flex flex-col items-center justify-center space-y-2 active:scale-98 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/30">
                <Camera className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-white">Tomar Foto con Cámara</span>
            </button>

            {/* Alternative Gallery Button */}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="w-full py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-slate-400" />
              <span>Elegir foto existente de la Galería</span>
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
