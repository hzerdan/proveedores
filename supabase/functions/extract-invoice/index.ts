// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code runs on Supabase Edge Functions (Deno runtime).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_SCHEMA_INVOICE = {
  name: "invoice_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      supplier: {
        type: "object",
        properties: {
          tax_id: { type: ["string", "null"], description: "CUIT del emisor en formato XX-XXXXXXXX-X o números" },
          legal_name: { type: ["string", "null"], description: "Razón Social legal del emisor" },
          trade_name: { type: ["string", "null"], description: "Nombre de fantasía o comercial" },
        },
        required: ["tax_id", "legal_name", "trade_name"],
        additionalProperties: false,
      },
      document: {
        type: "object",
        properties: {
          type_code: { 
            type: ["string", "null"], 
            enum: ["FACTURA", "NOTA_DEBITO", "NOTA_CREDITO", "RECIBO", "OTRO", null],
            description: "Tipo de comprobante" 
          },
          letter: { 
            type: ["string", "null"], 
            enum: ["A", "B", "C", "M", null],
            description: "Letra fiscal del comprobante" 
          },
          point_of_sale: { type: ["number", "null"], description: "Punto de venta (1 a 99999)" },
          document_number: { type: ["number", "null"], description: "Número de comprobante (1 a 99999999)" },
          issue_date: { type: ["string", "null"], description: "Fecha de emisión en formato YYYY-MM-DD" },
          due_date: { type: ["string", "null"], description: "Fecha de vencimiento de pago en formato YYYY-MM-DD" },
          currency: { 
            type: ["string", "null"], 
            enum: ["ARS", "USD", "EUR", null],
            description: "Moneda del comprobante" 
          },
          total_amount: { type: ["number", "null"], description: "Importe total final del comprobante" },
          cae: { type: ["string", "null"], description: "Código de Autorización Electrónico (CAE) de AFIP" },
          cae_due_date: { type: ["string", "null"], description: "Vencimiento del CAE en formato YYYY-MM-DD" },
          concept: { type: ["string", "null"], description: "Descripción resumida de los conceptos facturados" },
        },
        required: [
          "type_code", "letter", "point_of_sale", "document_number", 
          "issue_date", "due_date", "currency", "total_amount", 
          "cae", "cae_due_date", "concept"
        ],
        additionalProperties: false,
      },
      uncertain_fields: {
        type: "array",
        items: { type: "string" },
        description: "Lista de nombres de campos cuya lectura es dudosa o ilegible",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Observaciones de calidad o datos inconsistentes",
      },
      missing_fields: {
        type: "array",
        items: { type: "string" },
        description: "Campos que no fueron encontrados en el documento",
      },
    },
    required: ["supplier", "document", "uncertain_fields", "warnings", "missing_fields"],
    additionalProperties: false,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { storage_path, file_name, mime_type, file_id } = await req.json();

    if (!storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: "Parámetro storage_path requerido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_DOCUMENT_MODEL") || "gpt-4o-mini";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Download file from Storage
    const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
      .from("supplier-documents")
      .download(storage_path);

    if (downloadErr || !fileData) {
      throw new Error(`Error al descargar archivo de Storage: ${downloadErr?.message}`);
    }

    // If OPENAI_API_KEY is not configured, return clean notice for client fallback
    if (!openAiApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          fallback_required: true,
          message: "OPENAI_API_KEY no está configurada en los secretos de Supabase.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert file to Base64
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    const dataUrl = `data:${mime_type || "image/jpeg"};base64,${base64Data}`;

    // Call OpenAI Structured Outputs API
    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        messages: [
          {
            role: "system",
            content: "Eres un asistente contable senior especializado en extracción de datos de facturas y comprobantes fiscales de Argentina (AFIP). Extrae con precisión los campos requeridos. Si un campo no es visible o no existe, colócalo en null y regístralo en missing_fields o uncertain_fields.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extrae la información del comprobante adjunto (${file_name}).`,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: JSON_SCHEMA_INVOICE,
        },
        temperature: 0.1,
      }),
    });

    if (!openAiRes.ok) {
      const errBody = await openAiRes.text();
      throw new Error(`Error en API de OpenAI (${openAiRes.status}): ${errBody}`);
    }

    const openAiJson = await openAiRes.json();
    const structuredText = openAiJson.choices?.[0]?.message?.content;
    const extractedData = JSON.parse(structuredText);
    const durationMs = Date.now() - startTime;

    // Log extraction in document_ai_extractions
    let extractionId: number | null = null;
    if (file_id) {
      const { data: logData } = await supabaseAdmin
        .from("document_ai_extractions")
        .insert({
          file_id: file_id,
          model_name: openAiModel,
          model_provider: "OPENAI",
          extracted_raw_payload: extractedData,
          extraction_duration_ms: durationMs,
          status: "SUCCESS",
          extracted_at: new Date().toISOString(),
          created_by: 3,
        })
        .select("id")
        .single();

      if (logData) extractionId = logData.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        file_id: file_id,
        extraction_id: extractionId,
        model: openAiModel,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
