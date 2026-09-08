// Supabase Edge Function: mobile-upload
// Endpoint seguro para captura móvil sin credenciales de usuario.
// Valida el token QR con rpc_claim_upload_session_for_upload,
// almacena el archivo en la ruta única generada por backend y
// finaliza la sesión contrastando con storage.objects vía rpc_finalize_mobile_upload.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Método no permitido. Utilice POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Configuración de servidor incompleta." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const contentType = req.headers.get("content-type") || "";
    let sessionToken: string | null = null;
    let file: File | null = null;
    let fileName = "capture.jpg";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      sessionToken = (formData.get("session_token") as string) || req.headers.get("x-session-token");
      file = formData.get("file") as File;
      const customFileName = formData.get("file_name") as string;
      if (customFileName) fileName = customFileName;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Content-Type debe ser multipart/form-data." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sessionToken || sessionToken.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de sesión faltante o inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: "No se proporcionó ningún archivo." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.size <= 0 || file.size > 20971520) {
      return new Response(
        JSON.stringify({ success: false, error: "El archivo no puede estar vacío ni superar los 20 MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeType = file.type || "image/jpeg";
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedMimes.includes(mimeType)) {
      return new Response(
        JSON.stringify({ success: false, error: `Tipo MIME no permitido: ${mimeType}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Reclamar sesión y autorizar ruta generada por backend
    const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
      "rpc_claim_upload_session_for_upload",
      {
        p_session_token: sessionToken.trim(),
        p_file_name: file.name || fileName,
        p_mime_type: mimeType,
        p_file_size: file.size,
      }
    );

    if (claimError || !claimData?.success) {
      const errMsg = claimError?.message || claimData?.message || "Error al validar la sesión de subida.";
      return new Response(
        JSON.stringify({ success: false, error: errMsg, code: claimData?.error_code }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const assignedPath: string = claimData.storage_path;

    // 2. Almacenar el archivo en storage.objects usando el cliente seguro de backend
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from("supplier-documents")
      .upload(assignedPath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error al subir archivo a Storage:", uploadError);
      return new Response(
        JSON.stringify({ success: false, error: `Error de almacenamiento: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Finalizar y contrastar con storage.objects en la base de datos
    const { data: finalizeData, error: finalizeError } = await supabaseAdmin.rpc(
      "rpc_finalize_mobile_upload",
      {
        p_session_token: sessionToken.trim(),
        p_file_name: file.name || fileName,
      }
    );

    if (finalizeError || !finalizeData?.success) {
      // Limpieza de contingencia si falló la finalización
      await supabaseAdmin.storage.from("supplier-documents").remove([assignedPath]);
      const errMsg = finalizeError?.message || "Error al confirmar y registrar el archivo en la base de datos.";
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        session_id: finalizeData.session_id,
        file_id: finalizeData.file_id,
        storage_path: finalizeData.storage_path,
        status: finalizeData.status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Excepción no controlada en mobile-upload:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
