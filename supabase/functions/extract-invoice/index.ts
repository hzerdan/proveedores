// Supabase Edge Function: extract-invoice
// Deno runtime: Processes invoices (PDFs via OpenAI Files API, Images via Vision)
// Regla: La IA extrae evidencias; el código calcula y compara; el operador decide; el sistema audita.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_SCHEMA_INVOICE_V2 = {
  name: "invoice_extraction_v2",
  strict: true,
  schema: {
    type: "object",
    properties: {
      supplier: {
        type: "object",
        properties: {
          tax_id: { type: ["string", "null"], description: "CUIT del emisor fiscal (ej: 30-71192994-6 o números)" },
          legal_name: { type: ["string", "null"], description: "Razón Social legal del emisor" },
          trade_name: { type: ["string", "null"], description: "Nombre de fantasía o comercial" },
        },
        required: ["tax_id", "legal_name", "trade_name"],
        additionalProperties: false,
      },
      receiver: {
        type: "object",
        properties: {
          tax_id: { type: ["string", "null"], description: "CUIT del receptor/cliente si figura" },
          name: { type: ["string", "null"], description: "Nombre o Razón Social del receptor si figura" },
        },
        required: ["tax_id", "name"],
        additionalProperties: false,
      },
      document: {
        type: "object",
        properties: {
          type_code: {
            type: ["string", "null"],
            enum: ["FACTURA", "NOTA_DEBITO", "NOTA_CREDITO", "RECIBO", "OTRO", null],
            description: "Tipo de comprobante según encabezado",
          },
          letter: {
            type: ["string", "null"],
            enum: ["A", "B", "C", "M", null],
            description: "Letra fiscal del comprobante (A, B, C o M)",
          },
          point_of_sale: {
            type: ["string", "null"],
            description: "Punto de venta preservando ceros a la izquierda (ej: '00008')",
          },
          document_number: {
            type: ["string", "null"],
            description: "Número de comprobante preservando ceros a la izquierda (ej: '00030893')",
          },
          issue_date: {
            type: ["string", "null"],
            description: "Fecha de emisión en formato YYYY-MM-DD",
          },
          printed_due_date: {
            type: ["string", "null"],
            description: "Fecha de vencimiento impresa literal en el comprobante en formato YYYY-MM-DD (null si no está explícitamente escrita)",
          },
          payment_condition_text: {
            type: ["string", "null"],
            description: "Texto literal de la condición de venta/pago (ej: '30 días f.f.', 'Contado', 'Cta Cte 60 días')",
          },
          payment_term_days: {
            type: ["number", "null"],
            description: "Cantidad de días de plazo de pago deducida del texto (ej: 30 para '30 días', 0 para contado)",
          },
          payment_term_basis: {
            type: ["string", "null"],
            enum: ["ISSUE_DATE", "RECEIPT_DATE", "DELIVERY_DATE", "OTHER", "UNKNOWN", null],
            description: "Base del cómputo del plazo (ISSUE_DATE si es fecha factura f.f., RECEIPT_DATE si es contra recepción)",
          },
          currency: {
            type: ["string", "null"],
            enum: ["ARS", "USD", "EUR", null],
            description: "Moneda del comprobante",
          },
          net_amount: {
            type: ["number", "null"],
            description: "Importe neto gravado / subtotal sin IVA",
          },
          tax_amount: {
            type: ["number", "null"],
            description: "Importe liquidado de IVA",
          },
          total_amount: {
            type: ["number", "null"],
            description: "Importe total a pagar del comprobante",
          },
          cae: {
            type: ["string", "null"],
            description: "Código de Autorización Electrónico (CAE) de AFIP",
          },
          cae_due_date: {
            type: ["string", "null"],
            description: "Fecha de vencimiento del CAE en formato YYYY-MM-DD",
          },
          concept: {
            type: ["string", "null"],
            description: "Descripción resumida de los artículos o servicios facturados",
          },
        },
        required: [
          "type_code", "letter", "point_of_sale", "document_number",
          "issue_date", "printed_due_date", "payment_condition_text",
          "payment_term_days", "payment_term_basis", "currency",
          "net_amount", "tax_amount", "total_amount", "cae",
          "cae_due_date", "concept"
        ],
        additionalProperties: false,
      },
      uncertain_fields: {
        type: "array",
        items: { type: "string" },
        description: "Campos con lectura borrosa o dudosa",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Advertencias de inconsistencias encontradas en el documento",
      },
      missing_fields: {
        type: "array",
        items: { type: "string" },
        description: "Campos no presentes en el documento",
      },
    },
    required: ["supplier", "receiver", "document", "uncertain_fields", "warnings", "missing_fields"],
    additionalProperties: false,
  },
};

function cleanCuit(cuit: string | null | undefined): string {
  if (!cuit) return "";
  return String(cuit).replace(/\D/g, "");
}

function isValidCuit(cuit: string | null | undefined): boolean {
  const clean = cleanCuit(cuit);
  if (clean.length !== 11) return false;

  const validTypes = ["20", "23", "24", "27", "30", "33", "34"];
  if (!validTypes.includes(clean.substring(0, 2))) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  const mod = sum % 11;
  const checkDigit = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return checkDigit === parseInt(clean[10], 10);
}

function parseDateParts(dateStr: string | null | undefined): { day: number; month: number; year: number } | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  let day: number, month: number, year: number;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else {
    const latMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (latMatch) {
      day = parseInt(latMatch[1], 10);
      month = parseInt(latMatch[2], 10);
      year = parseInt(latMatch[3], 10);
    } else {
      return null;
    }
  }

  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }

  return { day, month, year };
}

function isValidCanonicalDate(dateStr: string | null | undefined): boolean {
  return parseDateParts(dateStr) !== null;
}

function evaluateExtractionStatus(data: any): {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  reasons: string[];
  structured_reasons: { code: string; field: string; message: string }[];
} {
  const reasons: string[] = [];
  const structured_reasons: { code: string; field: string; message: string }[] = [];

  function addReason(code: string, field: string, message: string) {
    reasons.push(message);
    structured_reasons.push({ code, field, message });
  }

  const docType = data?.document?.type_code || "OTRO";
  const isInvoiceOrNote = ["FACTURA", "NOTA_DEBITO", "NOTA_CREDITO"].includes(docType);
  const isReceipt = docType === "RECIBO";

  const supplierCuit = cleanCuit(data?.supplier?.tax_id);
  const receiverCuit = cleanCuit(data?.receiver?.tax_id);

  // 1. Emisor (CUIT)
  if (isInvoiceOrNote || isReceipt) {
    if (!supplierCuit) {
      addReason("MISSING_ISSUER_CUIT", "supplier.tax_id", "Falta CUIT del emisor");
    } else if (!isValidCuit(supplierCuit)) {
      addReason("INVALID_ISSUER_CUIT", "supplier.tax_id", `CUIT del emisor inválido (${data?.supplier?.tax_id})`);
    }
  } else if (supplierCuit && !isValidCuit(supplierCuit)) {
    addReason("INVALID_ISSUER_CUIT", "supplier.tax_id", `CUIT del emisor inválido (${data?.supplier?.tax_id})`);
  }

  // 2. Tipo y Letra
  if (!data?.document?.type_code) {
    addReason("MISSING_DOCUMENT_TYPE", "document.type_code", "Falta tipo de comprobante");
  }
  if (isInvoiceOrNote) {
    if (!data?.document?.letter) {
      addReason("MISSING_LETTER", "document.letter", "Falta letra fiscal del comprobante");
    }
  }

  // 3. Punto de Venta
  const posStr = data?.document?.point_of_sale ? String(data.document.point_of_sale).trim() : "";
  const posNum = posStr ? parseInt(posStr, 10) : null;
  if (isInvoiceOrNote) {
    if (!posStr || posNum === null || isNaN(posNum) || posNum <= 0 || posNum > 99999) {
      addReason("INVALID_POINT_OF_SALE", "document.point_of_sale", `Punto de venta ausente o fuera de rango fiscal (${posStr || "vacío"})`);
    }
  } else if (posStr && (posNum === null || isNaN(posNum) || posNum <= 0 || posNum > 99999)) {
    addReason("INVALID_POINT_OF_SALE", "document.point_of_sale", `Punto de venta fuera de rango fiscal (${posStr})`);
  }

  // 4. Número de comprobante
  const numStr = data?.document?.document_number ? String(data.document.document_number).trim() : "";
  const numVal = numStr ? parseInt(numStr, 10) : null;
  if (isInvoiceOrNote || isReceipt) {
    if (!numStr || numVal === null || isNaN(numVal) || numVal <= 0 || numStr.length > 8 || numVal > 99999999) {
      addReason("INVALID_DOCUMENT_NUMBER", "document.document_number", `Número de comprobante ausente o con longitud/valor anómalo (${numStr || "vacío"})`);
    }
  }

  // 5. Fecha de emisión
  const rawIssue = data?.document?.issue_date;
  if (!rawIssue) {
    addReason("MISSING_ISSUE_DATE", "document.issue_date", "Falta fecha de emisión");
  } else if (!isValidCanonicalDate(rawIssue)) {
    addReason("INVALID_ISSUE_DATE", "document.issue_date", `Fecha de emisión inválida o no canónica (${rawIssue})`);
  }

  // 6. Moneda
  if (!data?.document?.currency) {
    addReason("MISSING_CURRENCY", "document.currency", "Falta moneda del comprobante");
  }

  // 7. Importe Total
  const total = data?.document?.total_amount;
  if (total === null || total === undefined || isNaN(total) || total <= 0) {
    addReason("INVALID_TOTAL_AMOUNT", "document.total_amount", "Importe total ausente o no confiable (menor o igual a cero)");
  }

  // 8. Vencimiento: Ausente está permitido (e.g. contado), pero Contradictorio produce PARTIAL
  if (data?.document?.due_date_inconsistency) {
    addReason("DUE_DATE_INCONSISTENCY", "document.due_date", "Discrepancia entre la fecha de vencimiento impresa y la condición de venta calculada");
  }
  const rawDueStr = data?.document?.printed_due_date || data?.document?.due_date;
  const rawDue = (rawDueStr && String(rawDueStr).toLowerCase() !== "null") ? String(rawDueStr).trim() : null;
  if (rawDue) {
    const pDue = parseDateParts(rawDue);
    if (!pDue) {
      addReason("INVALID_DUE_DATE", "document.printed_due_date", `Fecha de vencimiento impresa inválida o no canónica (${rawDue})`);
    } else if (rawIssue) {
      const pIssue = parseDateParts(rawIssue);
      if (pIssue) {
        const dueTime = Date.UTC(pDue.year, pDue.month - 1, pDue.day);
        const issueTime = Date.UTC(pIssue.year, pIssue.month - 1, pIssue.day);
        if (dueTime < issueTime) {
          addReason("DUE_DATE_PRIOR_TO_ISSUE", "document.printed_due_date", `Fecha de vencimiento (${rawDue}) anterior a la fecha de emisión (${rawIssue})`);
        }
      }
    }
  }

  // 9. Consistencia aritmética no explicable
  if (
    data?.document?.net_amount !== null &&
    data?.document?.net_amount !== undefined &&
    data?.document?.tax_amount !== null &&
    data?.document?.tax_amount !== undefined &&
    total !== null &&
    total !== undefined
  ) {
    const sumNetTax = Math.round((data.document.net_amount + data.document.tax_amount) * 100) / 100;
    const roundedTotal = Math.round(total * 100) / 100;
    const diff = Math.abs(sumNetTax - roundedTotal);
    if (diff > 0.05) {
      addReason("ARITHMETIC_UNBALANCED", "document.total_amount", `Inconsistencia aritmética no explicable: Neto ($${data.document.net_amount}) + IVA ($${data.document.tax_amount}) difiere de Total ($${total})`);
    }
  }

  // 10. Campos críticos declarados ausentes o inciertos según tipo documental
  const criticalMap: Record<string, string[]> = {
    FACTURA: ["supplier.tax_id", "document.type_code", "document.letter", "document.point_of_sale", "document.document_number", "document.issue_date", "document.total_amount", "document.currency"],
    NOTA_DEBITO: ["supplier.tax_id", "document.type_code", "document.letter", "document.point_of_sale", "document.document_number", "document.issue_date", "document.total_amount", "document.currency"],
    NOTA_CREDITO: ["supplier.tax_id", "document.type_code", "document.letter", "document.point_of_sale", "document.document_number", "document.issue_date", "document.total_amount", "document.currency"],
    RECIBO: ["supplier.tax_id", "document.type_code", "document.document_number", "document.issue_date", "document.total_amount", "document.currency"],
    OTRO: ["document.type_code", "document.issue_date", "document.total_amount", "document.currency"],
  };
  const activeCritical = criticalMap[docType] || criticalMap.OTRO;

  const uncertain = Array.isArray(data?.uncertain_fields) ? data.uncertain_fields : [];
  const uncertainCritical = uncertain.filter((f: string) => activeCritical.some((c) => f.includes(c) || c.includes(f)));
  if (uncertainCritical.length > 0) {
    addReason("UNCERTAIN_CRITICAL_FIELD", "uncertain_fields", `Campos críticos con lectura incierta: ${uncertainCritical.join(", ")}`);
  }

  const missing = Array.isArray(data?.missing_fields) ? data.missing_fields : [];
  const missingCritical = missing.filter((f: string) => activeCritical.some((c) => f.includes(c) || c.includes(f)));
  if (missingCritical.length > 0) {
    addReason("MISSING_CRITICAL_FIELD", "missing_fields", `Campos críticos declarados ausentes: ${missingCritical.join(", ")}`);
  }

  // 11. Consistencia emisor / receptor
  if (supplierCuit && receiverCuit && supplierCuit === receiverCuit) {
    addReason("ISSUER_RECEIVER_COLLISION", "supplier.tax_id", "Inconsistencia: CUIT del emisor coincide con el CUIT del receptor");
  }

  if (reasons.length === 0) {
    return { status: "SUCCESS", reasons: [], structured_reasons: [] };
  }

  // Criterio de FAILED: Si no existen al menos 2 elementos mínimos aprovechables
  const usableCount = [
    Boolean(data?.supplier?.legal_name || data?.supplier?.trade_name || (supplierCuit && isValidCuit(supplierCuit))),
    Boolean(total && total > 0),
    Boolean(rawIssue && isValidCanonicalDate(rawIssue)),
    Boolean(numStr && numVal && numVal > 0 && numStr.length <= 8),
  ].filter(Boolean).length;

  if (usableCount >= 2) {
    return { status: "PARTIAL", reasons, structured_reasons };
  }

  return { status: "FAILED", reasons, structured_reasons };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  let openaiFileId: string | null = null;
  let clientFileId: number | null = null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  const openAiModel = Deno.env.get("OPENAI_DOCUMENT_MODEL") || "gpt-4o-mini";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { storage_path, file_name, mime_type, file_id } = await req.json();
    clientFileId = file_id || null;

    if (!storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: "Parámetro storage_path requerido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!openAiApiKey) {
      throw new Error("OPENAI_API_KEY no está configurada en los secretos de Supabase.");
    }

    // 1. Determinar el usuario creador (sin hardcodeo)
    let creatorUserId: number | null = null;
    const authHeader = req.headers.get("Authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();
          if (profile) creatorUserId = profile.id;
        }
      } catch {
        // Fallback a file_id o upload_session
      }
    }

    if (!creatorUserId && clientFileId) {
      const { data: fileRecord } = await supabaseAdmin
        .from("document_files")
        .select("uploaded_by")
        .eq("id", clientFileId)
        .single();
      if (fileRecord?.uploaded_by) {
        creatorUserId = fileRecord.uploaded_by;
      }
    }

    if (!creatorUserId) {
      // Fallback: primer perfil admin activo
      const { data: fallbackProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .limit(1)
        .single();
      creatorUserId = fallbackProfile?.id || 1;
    }

    // 2. Descargar archivo desde Supabase Storage
    const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
      .from("supplier-documents")
      .download(storage_path);

    if (downloadErr || !fileData) {
      throw new Error(`Error al descargar archivo de Storage: ${downloadErr?.message}`);
    }

    const isPdf = (mime_type === "application/pdf") || (file_name && file_name.toLowerCase().endsWith(".pdf"));
    let userContent: any[] = [];

    // 3. Procesamiento específico por tipo de medio
    if (isPdf) {
      // Subir archivo a OpenAI Files API (purpose: "user_data")
      const fileBytes = await fileData.arrayBuffer();
      const formData = new FormData();
      formData.append("purpose", "user_data");
      formData.append("file", new Blob([fileBytes], { type: "application/pdf" }), file_name || "documento.pdf");

      const uploadRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiApiKey}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const uploadErrBody = await uploadRes.text();
        throw new Error(`Error al subir PDF a OpenAI Files API (${uploadRes.status}): ${uploadErrBody}`);
      }

      const uploadJson = await uploadRes.json();
      openaiFileId = uploadJson.id;

      userContent = [
        {
          type: "text",
          text: `Extrae la información fiscal del comprobante argentino adjunto (${file_name || "documento.pdf"}).
- Preserva el punto de venta y número con sus ceros a la izquierda (como cadenas de texto).
- Extrae la fecha de emisión y la fecha de vencimiento impresa literal si figura en el documento.
- Si hay condición de venta (ej: "30 días"), extrae el texto literal, plazo en días y base.
- Si no figura vencimiento explícito, printed_due_date debe ser null.`,
        },
        {
          type: "file",
          file: {
            file_id: openaiFileId,
          },
        },
      ];
    } else {
      // Imagen: Convertir a Data URL Base64
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      const dataUrl = `data:${mime_type || "image/jpeg"};base64,${base64Data}`;

      userContent = [
        {
          type: "text",
          text: `Extrae la información fiscal del comprobante adjunto (${file_name || "foto.jpg"}).
- Preserva punto de venta y número como strings con ceros a la izquierda.
- Extrae fecha de emisión, fecha de vencimiento impresa (si existe), condición de pago literal y plazo en días.
- Si la imagen está orientada o rotada, lee cuidadosamente todos los números y encabezados fiscales.`,
        },
        {
          type: "image_url",
          image_url: {
            url: dataUrl,
            detail: "high",
          },
        },
      ];
    }

    // 4. Invocación de OpenAI Chat Completions con Structured Outputs Schema v2.0
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
            content: "Eres un asistente contable senior especializado en comprobantes fiscales de Argentina (AFIP). Extrae con máxima precisión las evidencias fiscales según el esquema estricto. La IA solo extrae evidencias, no inventa datos ni asume vencimientos que no figuren impresos.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: JSON_SCHEMA_INVOICE_V2,
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

    // Clasificación determinística del estado (SUCCESS vs PARTIAL)
    const { status: extractionStatus, reasons: statusReasons, structured_reasons: structuredReasons } = evaluateExtractionStatus(extractedData);
    extractedData.status = extractionStatus;
    extractedData.status_reasons = statusReasons;
    extractedData.structured_reasons = structuredReasons;

    // 5. Persistir extracción en document_ai_extractions con estado determinístico
    let extractionId: number | null = null;
    if (clientFileId) {
      const { data: logData, error: insertErr } = await supabaseAdmin
        .from("document_ai_extractions")
        .insert({
          file_id: clientFileId,
          model_name: openAiModel,
          model_provider: "OPENAI",
          extracted_raw_payload: extractedData,
          extraction_duration_ms: durationMs,
          status: extractionStatus,
          extracted_at: new Date().toISOString(),
          created_by: creatorUserId,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.warn("Could not insert document_ai_extractions record:", insertErr);
      } else if (logData) {
        extractionId = logData.id;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        file_id: clientFileId,
        extraction_id: extractionId,
        model: openAiModel,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error("AI Extraction failed:", err.message);

    // Registro seguro de la falla en DB (status: FAILED, sin datos inventados)
    let failedExtractionId: number | null = null;
    if (clientFileId) {
      try {
        const { data: failLog } = await supabaseAdmin
          .from("document_ai_extractions")
          .insert({
            file_id: clientFileId,
            model_name: openAiModel,
            model_provider: "OPENAI",
            extracted_raw_payload: {
              error: err.message,
              status: "FAILED",
              status_reasons: [err.message],
              structured_reasons: [
                { code: "TECHNICAL_EXTRACTION_FAILURE", field: "system", message: err.message }
              ],
            },
            extraction_duration_ms: durationMs,
            status: "FAILED",
            error_message: err.message,
            extracted_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (failLog) failedExtractionId = failLog.id;
      } catch (logErr) {
        console.warn("Could not record extraction failure in DB:", logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        file_id: clientFileId,
        extraction_id: failedExtractionId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  } finally {
    // 6. Limpieza segura del archivo temporal en OpenAI Files API (Condición 5)
    if (openaiFileId && openAiApiKey) {
      try {
        const delRes = await fetch(`https://api.openai.com/v1/files/${openaiFileId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${openAiApiKey}`,
          },
        });
        if (!delRes.ok) {
          const delText = await delRes.text();
          console.warn(
            `[OPENAI_CLEANUP_FAILED] No se pudo eliminar el archivo temporal ${openaiFileId}: (${delRes.status}) ${delText}`
          );
        } else {
          console.log(`[OPENAI_CLEANUP_SUCCESS] Archivo temporal ${openaiFileId} eliminado exitosamente.`);
        }
      } catch (cleanupErr: any) {
        console.warn(
          `[OPENAI_CLEANUP_FAILED] Excepción al eliminar archivo temporal ${openaiFileId}: ${cleanupErr?.message}`
        );
      }
    }
  }
});
