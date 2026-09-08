/**
 * AI Document Extraction Service, Deterministic Normalizer & Schema v2.0
 * Regla: La IA extrae evidencias; el código calcula y compara; el operador decide; el sistema audita.
 */

import { supabase } from './supabase';
import { isValidCuit, formatCuit, cleanCuit } from './cuitValidator';
import { parseCanonicalDate, toHumanDate, toIsoDate } from './formatters';

export interface ExtractedSupplier {
  tax_id: string | null;
  legal_name: string | null;
  trade_name: string | null;
  is_valid_cuit?: boolean;
}

export interface ExtractedReceiver {
  tax_id: string | null;
  name: string | null;
}

export type DueDateSource = 'EXPLICIT_PRINTED' | 'CALCULATED_FROM_PAYMENT_TERMS' | 'MANUAL_REQUIRED';

export interface ExtractedDocument {
  type_code: 'FACTURA' | 'NOTA_DEBITO' | 'NOTA_CREDITO' | 'RECIBO' | 'OTRO' | null;
  letter: 'A' | 'B' | 'C' | 'M' | null;
  point_of_sale: string | null;      // Preserva ceros a la izquierda (ej: '00008')
  point_of_sale_num?: number | null; // Valor numérico para PostgreSQL
  document_number: string | null;    // Preserva ceros a la izquierda (ej: '00030893')
  document_number_num?: number | null;// Valor numérico para PostgreSQL
  
  // Fechas y Plazos Canónicos v2.1
  invoice_date?: string | null;         // Formato ISO YYYY-MM-DD
  due_date?: string | null;             // Formato ISO YYYY-MM-DD (vencimiento comercial resuelto)
  payment_terms_text?: string | null;   // Texto de condición comercial (ej: '30 días fecha factura')
  payment_terms_days?: number | null;   // Plazo en días (ej: 30)
  cae_expiration_date?: string | null;  // Formato ISO YYYY-MM-DD (fecha fiscal regulatoria AFIP)
  due_date_source?: DueDateSource | null;// Origen del vencimiento comercial determinado

  // Compatibilidad con campos previos
  issue_date: string | null;         // Formato canónico DD/MM/YYYY
  issue_date_iso?: string | null;    // Formato técnico YYYY-MM-DD
  printed_due_date: string | null;   // Formato canónico DD/MM/YYYY (comercial, nunca CAE)
  printed_due_date_iso?: string | null;
  payment_condition_text: string | null;
  payment_term_days: number | null;
  payment_term_basis: 'ISSUE_DATE' | 'RECEIPT_DATE' | 'DELIVERY_DATE' | 'OTHER' | 'UNKNOWN' | null;
  calculated_due_date: string | null; // Calculado determinísticamente en DD/MM/YYYY
  calculated_due_date_iso?: string | null;
  due_date_inconsistency: boolean;
  currency: 'ARS' | 'USD' | 'EUR' | null;
  net_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  arithmetic_balanced?: boolean;
  cae: string | null;
  cae_due_date: string | null;       // Formato canónico DD/MM/YYYY
  cae_due_date_iso?: string | null;
  concept: string | null;
}

export interface ExtractionReason {
  code: string;
  field: string;
  message: string;
}

export type ExtractionStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface ExtractedInvoicePayload {
  schema_version: string;
  status: ExtractionStatus;
  status_reasons: string[];
  structured_reasons?: ExtractionReason[];
  supplier: ExtractedSupplier;
  receiver: ExtractedReceiver;
  document: ExtractedDocument;
  uncertain_fields: string[];
  warnings: string[];
  missing_fields: string[];
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedInvoicePayload;
  file_id?: number;
  extraction_id?: number;
  raw_response?: any;
  error?: string;
}

/**
 * Clasificación determinística del estado de extracción:
 * - SUCCESS: están presentes y son formalmente válidos todos los campos críticos exigibles.
 * - PARTIAL: existe información aprovechable, pero uno o más campos críticos están ausentes,
 *            son inválidos, inciertos o requieren revisión.
 * - FAILED: no existe información mínima utilizable o falló el procesamiento técnico.
 */
export function evaluateExtractionStatus(payload: {
  supplier: ExtractedSupplier;
  receiver?: ExtractedReceiver | null;
  document: ExtractedDocument;
  uncertain_fields?: string[];
  warnings?: string[];
  missing_fields?: string[];
}): { status: ExtractionStatus; reasons: string[]; structured_reasons: ExtractionReason[] } {
  const reasons: string[] = [];
  const structured_reasons: ExtractionReason[] = [];

  function addReason(code: string, field: string, message: string) {
    reasons.push(message);
    structured_reasons.push({ code, field, message });
  }
  const docType = payload.document?.type_code || 'OTRO';
  const isInvoiceOrNote = ['FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO'].includes(docType);
  const isReceipt = docType === 'RECIBO';

  const supplierCuit = payload.supplier?.tax_id ? cleanCuit(payload.supplier.tax_id) : '';
  const receiverCuit = payload.receiver?.tax_id ? cleanCuit(payload.receiver.tax_id) : '';

  // 1. Emisor (CUIT)
  if (isInvoiceOrNote || isReceipt) {
    if (!supplierCuit) {
      addReason('MISSING_ISSUER_CUIT', 'supplier.tax_id', 'Falta CUIT del emisor');
    } else if (!isValidCuit(supplierCuit)) {
      addReason('INVALID_ISSUER_CUIT', 'supplier.tax_id', `CUIT del emisor inválido (${payload.supplier.tax_id})`);
    }
  } else if (supplierCuit && !isValidCuit(supplierCuit)) {
    addReason('INVALID_ISSUER_CUIT', 'supplier.tax_id', `CUIT del emisor inválido (${payload.supplier.tax_id})`);
  }

  // 2. Tipo y Letra
  if (!payload.document?.type_code) {
    addReason('MISSING_DOCUMENT_TYPE', 'document.type_code', 'Falta tipo de comprobante');
  }
  if (isInvoiceOrNote) {
    if (!payload.document?.letter) {
      addReason('MISSING_LETTER', 'document.letter', 'Falta letra fiscal del comprobante');
    }
  }

  // 3. Punto de Venta
  const posStr = payload.document?.point_of_sale ? String(payload.document.point_of_sale).trim() : '';
  const posNum = payload.document?.point_of_sale_num ?? (posStr ? parseInt(posStr, 10) : null);
  if (isInvoiceOrNote) {
    if (!posStr || posNum === null || isNaN(posNum) || posNum <= 0 || posNum > 99999) {
      addReason('INVALID_POINT_OF_SALE', 'document.point_of_sale', `Punto de venta ausente o fuera de rango fiscal (${posStr || 'vacío'})`);
    }
  } else if (posStr && (posNum === null || isNaN(posNum) || posNum <= 0 || posNum > 99999)) {
    addReason('INVALID_POINT_OF_SALE', 'document.point_of_sale', `Punto de venta fuera de rango fiscal (${posStr})`);
  }

  // 4. Número de comprobante
  const numStr = payload.document?.document_number ? String(payload.document.document_number).trim() : '';
  const numVal = payload.document?.document_number_num ?? (numStr ? parseInt(numStr, 10) : null);
  if (isInvoiceOrNote || isReceipt) {
    if (!numStr || numVal === null || isNaN(numVal) || numVal <= 0 || numStr.length > 8 || numVal > 99999999) {
      addReason('INVALID_DOCUMENT_NUMBER', 'document.document_number', `Número de comprobante ausente o con longitud/valor anómalo (${numStr || 'vacío'})`);
    }
  }

  // 5. Fecha de Emisión
  const rawIssue = payload.document?.issue_date || payload.document?.issue_date_iso;
  let parsedIssueDate: { day: number; month: number; year: number } | null = null;
  if (!rawIssue) {
    addReason('MISSING_ISSUE_DATE', 'document.issue_date', 'Falta fecha de emisión');
  } else {
    parsedIssueDate = parseCanonicalDate(rawIssue);
    if (!parsedIssueDate) {
      addReason('INVALID_ISSUE_DATE', 'document.issue_date', `Fecha de emisión inválida o no canónica (${rawIssue})`);
    }
  }

  // 6. Moneda
  if (!payload.document?.currency) {
    addReason('MISSING_CURRENCY', 'document.currency', 'Falta moneda del comprobante');
  }

  // 7. Importe Total
  const total = payload.document?.total_amount;
  if (total === null || total === undefined || isNaN(total) || total <= 0) {
    addReason('INVALID_TOTAL_AMOUNT', 'document.total_amount', 'Importe total ausente o no confiable (menor o igual a cero)');
  }

  // 8. Vencimiento: Ausente está permitido (e.g. contado), pero Contradictorio produce PARTIAL
  if (payload.document?.due_date_inconsistency) {
    addReason('DUE_DATE_INCONSISTENCY', 'document.due_date', 'Discrepancia entre la fecha de vencimiento impresa y la condición de venta calculada');
  }
  const rawDueStr = payload.document?.printed_due_date || payload.document?.printed_due_date_iso || payload.document?.due_date;
  const rawDue = (rawDueStr && String(rawDueStr).toLowerCase() !== 'null') ? String(rawDueStr).trim() : null;
  if (rawDue) {
    const parsedDue = parseCanonicalDate(rawDue);
    if (!parsedDue) {
      addReason('INVALID_DUE_DATE', 'document.printed_due_date', `Fecha de vencimiento impresa inválida o no canónica (${rawDue})`);
    } else if (parsedIssueDate) {
      const issueTime = Date.UTC(parsedIssueDate.year, parsedIssueDate.month - 1, parsedIssueDate.day);
      const dueTime = Date.UTC(parsedDue.year, parsedDue.month - 1, parsedDue.day);
      if (dueTime < issueTime) {
        addReason('DUE_DATE_PRIOR_TO_ISSUE', 'document.printed_due_date', `Fecha de vencimiento (${rawDue}) anterior a la fecha de emisión (${rawIssue})`);
      }
    }
  }

  // 9. Consistencia aritmética no explicable
  if (
    payload.document?.net_amount !== null &&
    payload.document?.net_amount !== undefined &&
    payload.document?.tax_amount !== null &&
    payload.document?.tax_amount !== undefined &&
    total !== null &&
    total !== undefined
  ) {
    const sumNetTax = Math.round((payload.document.net_amount + payload.document.tax_amount) * 100) / 100;
    const roundedTotal = Math.round(total * 100) / 100;
    const diff = Math.abs(sumNetTax - roundedTotal);
    if (diff > 0.05) {
      addReason('ARITHMETIC_UNBALANCED', 'document.total_amount', `Inconsistencia aritmética no explicable: Neto ($${payload.document.net_amount}) + IVA ($${payload.document.tax_amount}) difiere de Total ($${total})`);
    }
  }

  // 10. Campos críticos declarados ausentes o inciertos según tipo documental
  const criticalMap: Record<string, string[]> = {
    FACTURA: ['supplier.tax_id', 'document.type_code', 'document.letter', 'document.point_of_sale', 'document.document_number', 'document.issue_date', 'document.total_amount', 'document.currency'],
    NOTA_DEBITO: ['supplier.tax_id', 'document.type_code', 'document.letter', 'document.point_of_sale', 'document.document_number', 'document.issue_date', 'document.total_amount', 'document.currency'],
    NOTA_CREDITO: ['supplier.tax_id', 'document.type_code', 'document.letter', 'document.point_of_sale', 'document.document_number', 'document.issue_date', 'document.total_amount', 'document.currency'],
    RECIBO: ['supplier.tax_id', 'document.type_code', 'document.document_number', 'document.issue_date', 'document.total_amount', 'document.currency'],
    OTRO: ['document.type_code', 'document.issue_date', 'document.total_amount', 'document.currency'],
  };
  const activeCritical = criticalMap[docType] || criticalMap.OTRO;

  const uncertain = payload.uncertain_fields || [];
  const uncertainCritical = uncertain.filter(f => activeCritical.some(c => f.includes(c) || c.includes(f)));
  if (uncertainCritical.length > 0) {
    addReason('UNCERTAIN_CRITICAL_FIELD', 'uncertain_fields', `Campos críticos con lectura incierta: ${uncertainCritical.join(', ')}`);
  }

  const missing = payload.missing_fields || [];
  const missingCritical = missing.filter(f => activeCritical.some(c => f.includes(c) || c.includes(f)));
  if (missingCritical.length > 0) {
    addReason('MISSING_CRITICAL_FIELD', 'missing_fields', `Campos críticos declarados ausentes: ${missingCritical.join(', ')}`);
  }

  // 11. Consistencia entre emisor y receptor
  if (supplierCuit && receiverCuit && supplierCuit === receiverCuit) {
    addReason('ISSUER_RECEIVER_COLLISION', 'supplier.tax_id', 'Inconsistencia: CUIT del emisor coincide con el CUIT del receptor');
  }

  if (reasons.length === 0) {
    return { status: 'SUCCESS', reasons: [], structured_reasons: [] };
  }

  // Criterio de FAILED: Si no existen al menos 2 elementos mínimos aprovechables
  const usableCount = [
    Boolean(payload.supplier?.legal_name || payload.supplier?.trade_name || (supplierCuit && isValidCuit(supplierCuit))),
    Boolean(total && total > 0),
    Boolean(rawIssue && parsedIssueDate),
    Boolean(numStr && numVal && numVal > 0 && numStr.length <= 8),
  ].filter(Boolean).length;

  if (usableCount >= 2) {
    return { status: 'PARTIAL', reasons, structured_reasons };
  }

  return { status: 'FAILED', reasons, structured_reasons };
}

/**
 * Calcula determinísticamente la fecha de vencimiento a partir de la emisión y el plazo en días.
 * No delega este cómputo a la IA.
 */
export function computeDeterministicDueDate(
  issueDateStr: string | null,
  termDays: number | null,
  termBasis: string | null,
  conditionText?: string | null
): { human: string | null; iso: string | null } {
  if (!issueDateStr || termDays === null || termDays === undefined || termDays < 0) {
    return { human: null, iso: null };
  }

  // Se calcula si la base es explícitamente ISSUE_DATE o si el texto comercial denota fecha factura / días
  const isIssueDateBasis =
    termBasis === 'ISSUE_DATE' ||
    (conditionText && /fecha\s*factura|f\.?f\.?|emisi[oó]n|d[ií]as/i.test(conditionText)) ||
    (!termBasis && termDays > 0);

  if (!isIssueDateBasis) {
    return { human: null, iso: null };
  }

  const parsed = parseCanonicalDate(issueDateStr);
  if (!parsed) return { human: null, iso: null };

  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utc.setUTCDate(utc.getUTCDate() + termDays);

  const resParsed = {
    day: utc.getUTCDate(),
    month: utc.getUTCMonth() + 1,
    year: utc.getUTCFullYear(),
  };

  return {
    human: toHumanDate(resParsed),
    iso: toIsoDate(resParsed),
  };
}

/**
 * Normalizador determinístico: sanea evidencias, calcula fechas, valida importes y CUIT.
 * Aplica precedencia estricta para determinar due_date y rechaza Vencimiento CAE como vencimiento comercial.
 */
export function reconcileInvoiceEvidence(raw: any): ExtractedInvoicePayload {
  const warnings: string[] = Array.isArray(raw?.warnings) ? [...raw.warnings] : [];
  const uncertainFields: string[] = Array.isArray(raw?.uncertain_fields) ? [...raw.uncertain_fields] : [];
  const missingFields: string[] = Array.isArray(raw?.missing_fields) ? [...raw.missing_fields] : [];

  // 1. Detección de versión de esquema y compatibilidad histórica
  const isV2 = raw?.schema_version === '2.0' || raw?.document?.printed_due_date !== undefined || raw?.document?.invoice_date !== undefined;
  const schemaVersion = isV2 ? '2.0' : '1.0';

  // 2. Extracción y normalización de Fechas
  const rawIssue = raw?.document?.invoice_date || raw?.document?.issue_date || null;
  const parsedIssue = parseCanonicalDate(rawIssue);
  const issueHuman = toHumanDate(parsedIssue);
  const issueIso = toIsoDate(parsedIssue);

  // CAE Vencimiento (Dato puramente fiscal de AFIP)
  const rawCaeDue = raw?.document?.cae_expiration_date || raw?.document?.cae_due_date || null;
  const parsedCaeDue = parseCanonicalDate(rawCaeDue);
  const caeDueHuman = toHumanDate(parsedCaeDue);
  const caeDueIso = toIsoDate(parsedCaeDue);

  // Vencimiento impreso (en v1 se leía como due_date)
  const rawPrintedDue = raw?.document?.printed_due_date || (!isV2 ? raw?.document?.due_date : null);
  const parsedPrintedDue = parseCanonicalDate(rawPrintedDue);
  let printedDueHuman = toHumanDate(parsedPrintedDue);
  let printedDueIso = toIsoDate(parsedPrintedDue);

  // 3. Validación determinística: Rechazar Vencimiento CAE como vencimiento comercial
  if (printedDueIso && caeDueIso && printedDueIso === caeDueIso) {
    warnings.push(
      `La fecha ${printedDueHuman} coincide con el Vencimiento CAE fiscal (AFIP) y fue descartada como fecha de vencimiento comercial de pago.`
    );
    printedDueHuman = null;
    printedDueIso = null;
  }

  // 4. Condición de Pago y Cálculo Determinístico de Vencimiento
  const conditionText = raw?.document?.payment_terms_text || raw?.document?.payment_condition_text || null;
  let termDays: number | null = raw?.document?.payment_terms_days !== undefined
    ? raw.document.payment_terms_days
    : (raw?.document?.payment_term_days !== undefined ? raw.document.payment_term_days : null);
  let termBasis: any = raw?.document?.payment_term_basis || null;

  // Si la IA no extrajo los días pero el texto contiene indicio numérico claro (ej. "30 días fecha factura", "7 dias FF")
  if (termDays === null && conditionText) {
    const match = conditionText.match(/(\d+)\s*d[ií]as/i);
    if (match) {
      termDays = parseInt(match[1], 10);
      if (/factura|f\.?f\.?|emisi[oó]n/i.test(conditionText)) {
        termBasis = 'ISSUE_DATE';
      } else {
        termBasis = 'UNKNOWN';
      }
    }
  }

  // Si la condición dice "fecha factura" o similar, la base es indiscutiblemente ISSUE_DATE
  if (conditionText && /fecha\s*factura|f\.?f\.?|emisi[oó]n/i.test(conditionText)) {
    termBasis = 'ISSUE_DATE';
  }

  const { human: calcDueHuman, iso: calcDueIso } = computeDeterministicDueDate(issueIso || issueHuman, termDays, termBasis, conditionText);

  // 5. Precedencia para determinar due_date comercial y due_date_source:
  //    1. Vencimiento comercial explícitamente impreso (no CAE).
  //    2. Cálculo desde una condición comercial inequívoca (ej: 30 días fecha factura).
  //    3. Ingreso manual cuando no pueda determinarse.
  let finalDueDateIso: string | null;
  let dueDateSource: DueDateSource;

  if (printedDueIso) {
    finalDueDateIso = printedDueIso;
    dueDateSource = 'EXPLICIT_PRINTED';
  } else if (calcDueIso) {
    finalDueDateIso = calcDueIso;
    dueDateSource = 'CALCULATED_FROM_PAYMENT_TERMS';
  } else {
    finalDueDateIso = null;
    dueDateSource = 'MANUAL_REQUIRED';
  }

  // Regla de seguridad absoluta: Nunca usar cae_expiration_date como due_date
  if (finalDueDateIso && caeDueIso && finalDueDateIso === caeDueIso && dueDateSource !== 'CALCULATED_FROM_PAYMENT_TERMS') {
    warnings.push('Se bloqueó el uso del Vencimiento CAE fiscal como vencimiento comercial.');
    finalDueDateIso = null;
    dueDateSource = 'MANUAL_REQUIRED';
  }

  // 6. Comparación y Detección de Discrepancias de Vencimiento
  let dueDateInconsistency = false;
  if (printedDueHuman && calcDueHuman && printedDueHuman !== calcDueHuman) {
    dueDateInconsistency = true;
    uncertainFields.push('document.due_date');
    warnings.push(
      `Discrepancia en fecha de vencimiento: La fecha impresa es ${printedDueHuman}, pero la condición "${conditionText || `${termDays} días`}" determina ${calcDueHuman}. Verifique qué fecha debe utilizarse.`
    );
  }

  // 7. Normalización de Punto de Venta y Número preservando ceros iniciales
  const rawPos = raw?.document?.point_of_sale !== undefined && raw?.document?.point_of_sale !== null
    ? String(raw.document.point_of_sale).trim()
    : null;
  const rawNum = raw?.document?.document_number !== undefined && raw?.document?.document_number !== null
    ? String(raw.document.document_number).trim()
    : null;

  const posNum = rawPos ? parseInt(rawPos, 10) : null;
  const docNum = rawNum ? parseInt(rawNum, 10) : null;

  // Normalización estándar AFIP de strings para punto de venta (4 dígitos) y número (8 dígitos)
  const normalizedPosStr = posNum !== null && !isNaN(posNum) && posNum <= 99999
    ? posNum.toString().padStart(4, '0')
    : rawPos;
  const normalizedDocNumStr = docNum !== null && !isNaN(docNum) && docNum <= 99999999
    ? docNum.toString().padStart(8, '0')
    : rawNum;

  // 8. Normalización y Reconciliación Aritmética de Importes
  const netAmount = raw?.document?.net_amount !== undefined && raw?.document?.net_amount !== null
    ? parseFloat(raw.document.net_amount)
    : (raw?.document?.subtotal_amount ? parseFloat(raw.document.subtotal_amount) : null);
  const taxAmount = raw?.document?.tax_amount !== undefined && raw?.document?.tax_amount !== null
    ? parseFloat(raw.document.tax_amount)
    : null;
  const totalAmount = raw?.document?.total_amount !== undefined && raw?.document?.total_amount !== null
    ? parseFloat(raw.document.total_amount)
    : null;

  let arithmeticBalanced = true;
  if (netAmount !== null && taxAmount !== null && totalAmount !== null) {
    const expected = Math.round((netAmount + taxAmount) * 100) / 100;
    if (Math.abs(expected - totalAmount) > 0.05) {
      arithmeticBalanced = false;
      warnings.push(
        `Subtotal ($${netAmount.toFixed(2)}) + IVA ($${taxAmount.toFixed(2)}) suma $${expected.toFixed(2)}, difiriendo del Total ($${totalAmount.toFixed(2)}). Podría corresponder a percepciones u otros conceptos no desglosados.`
      );
    }
  }

  // 9. Normalización y Validación CUIT Módulo 11 del Emisor
  let supplierTaxId = raw?.supplier?.tax_id || null;
  let isValidSupplierCuit = false;
  if (supplierTaxId) {
    const cleaned = cleanCuit(supplierTaxId);
    if (isValidCuit(cleaned)) {
      supplierTaxId = formatCuit(cleaned);
      isValidSupplierCuit = true;
    } else {
      uncertainFields.push('supplier.tax_id');
      warnings.push(`El CUIT del emisor (${supplierTaxId}) no supera la validación de dígito verificador Módulo 11.`);
    }
  } else {
    missingFields.push('supplier.tax_id');
  }

  const preliminaryPayload = {
    schema_version: schemaVersion,
    supplier: {
      tax_id: supplierTaxId,
      legal_name: raw?.supplier?.legal_name || null,
      trade_name: raw?.supplier?.trade_name || null,
      is_valid_cuit: isValidSupplierCuit,
    },
    receiver: {
      tax_id: raw?.receiver?.tax_id ? formatCuit(cleanCuit(raw.receiver.tax_id)) : null,
      name: raw?.receiver?.name || null,
    },
    document: {
      type_code: (raw?.document?.type_code || 'FACTURA') as any,
      letter: (raw?.document?.letter || 'A') as any,
      point_of_sale: normalizedPosStr,
      point_of_sale_num: posNum,
      document_number: normalizedDocNumStr,
      document_number_num: docNum,

      // Contrato Canónico v2.1
      invoice_date: issueIso,
      due_date: finalDueDateIso,
      payment_terms_text: conditionText,
      payment_terms_days: termDays,
      cae_expiration_date: caeDueIso,
      due_date_source: dueDateSource,

      // Compatibilidad con campos existentes
      issue_date: issueHuman,
      issue_date_iso: issueIso,
      printed_due_date: printedDueHuman,
      printed_due_date_iso: printedDueIso,
      payment_condition_text: conditionText,
      payment_term_days: termDays,
      payment_term_basis: termBasis,
      calculated_due_date: calcDueHuman,
      calculated_due_date_iso: calcDueIso,
      due_date_inconsistency: dueDateInconsistency,
      currency: (raw?.document?.currency || 'ARS') as any,
      net_amount: netAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      arithmetic_balanced: arithmeticBalanced,
      cae: raw?.document?.cae || null,
      cae_due_date: caeDueHuman,
      cae_due_date_iso: caeDueIso,
      concept: raw?.document?.concept || null,
    },
    uncertain_fields: Array.from(new Set(uncertainFields)),
    warnings: Array.from(new Set(warnings)),
    missing_fields: Array.from(new Set(missingFields)),
  };

  const statusEval = evaluateExtractionStatus(preliminaryPayload);

  // La Edge Function persistida en DB es la fuente autoritativa.
  // El frontend no reemplaza el estado validado por backend; conserva el clasificador espejo
  // para paridad contractual y tests unitarios.
  const finalStatus: ExtractionStatus = (raw?.status as ExtractionStatus) || statusEval.status;
  const finalReasons: string[] = (Array.isArray(raw?.status_reasons) && raw.status_reasons.length > 0)
    ? raw.status_reasons
    : statusEval.reasons;
  const finalStructuredReasons: ExtractionReason[] = (Array.isArray(raw?.structured_reasons) && raw.structured_reasons.length > 0)
    ? raw.structured_reasons
    : statusEval.structured_reasons;

  return {
    ...preliminaryPayload,
    status: finalStatus,
    status_reasons: finalReasons,
    structured_reasons: finalStructuredReasons,
  };
}

/**
 * Invoca la Edge Function extract-invoice sin ningún mock fallback engañoso.
 * En caso de error, devuelve el fallo real y audita como FAILED en DB.
 */
export async function extractInvoiceFromStorage(
  storagePath: string,
  fileName: string,
  mimeType: string,
  fileId?: number
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('extract-invoice', {
      body: {
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        file_id: fileId,
      },
    });

    if (edgeErr) {
      throw new Error(edgeErr.message || 'Error de invocación en Edge Function');
    }

    if (!edgeData || !edgeData.success || !edgeData.data) {
      throw new Error(edgeData?.error || 'La respuesta de la Edge Function no contiene datos válidos');
    }

    // Normalización determinística estricta en frontend
    const normalized = reconcileInvoiceEvidence(edgeData.data);

    return {
      success: true,
      data: normalized,
      file_id: fileId || edgeData.file_id,
      extraction_id: edgeData.extraction_id,
      raw_response: edgeData,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('AI Extraction failed:', err.message);

    // Registro seguro del incidente en document_ai_extractions como FAILED (sin datos ficticios)
    let failedExtractionId: number | undefined;
    if (fileId) {
      try {
        const { data: logData } = await supabase
          .from('document_ai_extractions')
          .insert({
            file_id: fileId,
            model_name: 'gpt-4o-mini',
            model_provider: 'OPENAI',
            extracted_raw_payload: { error: err.message, file_name: fileName },
            extraction_duration_ms: durationMs,
            status: 'FAILED',
            error_message: err.message,
            extracted_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (logData) failedExtractionId = logData.id;
      } catch (logErr) {
        console.warn('Could not record failed extraction log:', logErr);
      }
    }

    // Retorno de fallo transparente: CERO datos inventados
    return {
      success: false,
      error: err.message || 'Error al procesar el comprobante',
      file_id: fileId,
      extraction_id: failedExtractionId,
      data: {
        schema_version: '2.0',
        status: 'FAILED',
        status_reasons: [err.message || 'No se pudo completar la extracción automática por IA.'],
        supplier: { tax_id: null, legal_name: null, trade_name: null, is_valid_cuit: false },
        receiver: { tax_id: null, name: null },
        document: {
          type_code: 'FACTURA',
          letter: 'A',
          point_of_sale: null,
          point_of_sale_num: null,
          document_number: null,
          document_number_num: null,
          invoice_date: null,
          due_date: null,
          payment_terms_text: null,
          payment_terms_days: null,
          cae_expiration_date: null,
          due_date_source: 'MANUAL_REQUIRED',
          issue_date: null,
          issue_date_iso: null,
          printed_due_date: null,
          printed_due_date_iso: null,
          payment_condition_text: null,
          payment_term_days: null,
          payment_term_basis: null,
          calculated_due_date: null,
          calculated_due_date_iso: null,
          due_date_inconsistency: false,
          currency: 'ARS',
          net_amount: null,
          tax_amount: null,
          total_amount: null,
          arithmetic_balanced: true,
          cae: null,
          cae_due_date: null,
          cae_due_date_iso: null,
          concept: null,
        },
        uncertain_fields: [],
        warnings: [err.message || 'No se pudo completar la extracción automática por IA.'],
        missing_fields: [],
      },
    };
  }
}
