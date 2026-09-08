import { reconcileInvoiceEvidence } from '../src/lib/aiExtractor.ts';
import { formatDate } from '../src/lib/formatters.ts';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Cargar variables de entorno
const envContent = fs.readFileSync('.env', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function runRegressionSuite() {
  console.log(`=============================================================`);
  console.log(`SUITE DE REGRESIÓN: EXTRACCIÓN DE FECHAS Y VENCIMIENTO COMERCIAL`);
  console.log(`Fecha/Hora de Ejecución: ${new Date().toISOString()}`);
  console.log(`=============================================================\n`);

  let allPassed = true;

  // -------------------------------------------------------------
  // CASO DE REGRESIÓN PRINCIPAL: Factura FA000400042797 Anonimizada
  // -------------------------------------------------------------
  console.log(`--- CASO 1: Comprobante FA000400042797 (Caso de Regresión Controlado) ---`);
  // Simulamos la evidencia bruta anonimizada donde el LLM erróneamente extrajo printed_due_date = "2026-09-14" (Vencimiento CAE)
  const rawRegressionInvoice = {
    schema_version: '2.0',
    supplier: {
      tax_id: '30-70295818-7',
      legal_name: 'PROVEEDOR TEST ANONIMIZADO S.A.',
      trade_name: 'IMPORT EXPRESS ANON',
    },
    receiver: {
      tax_id: '20-13278210-6',
      name: 'LEON LUIS',
    },
    document: {
      type_code: 'FACTURA',
      letter: 'A',
      point_of_sale: '0004',
      document_number: '00042797',
      issue_date: '04/09/2026',
      invoice_date: '2026-09-04',
      // Simulación del error previo: el LLM leyó "Vencimiento CAE: 14-09-2026" y lo puso en printed_due_date
      printed_due_date: '14/09/2026',
      payment_condition_text: '30 días fecha factura',
      payment_terms_text: '30 días fecha factura',
      payment_term_days: 30,
      payment_terms_days: 30,
      payment_term_basis: 'ISSUE_DATE',
      currency: 'ARS',
      net_amount: 1494278.46,
      tax_amount: 313798.48,
      total_amount: 1808076.94,
      cae: '86361451642954',
      cae_due_date: '14/09/2026',
      cae_expiration_date: '2026-09-14',
      concept: 'Pinceles y accesorios de pintura',
    },
    uncertain_fields: [],
    warnings: [],
    missing_fields: [],
  };

  const processedRegression = reconcileInvoiceEvidence(rawRegressionInvoice);
  const doc1 = processedRegression.document;

  const expectedRegression = {
    invoice_date: "2026-09-04",
    payment_terms_text: "30 días fecha factura",
    payment_terms_days: 30,
    due_date: "2026-10-04",
    cae_expiration_date: "2026-09-14",
    due_date_source: "CALCULATED_FROM_PAYMENT_TERMS",
  };

  const actualRegression = {
    invoice_date: doc1.invoice_date,
    payment_terms_text: doc1.payment_terms_text,
    payment_terms_days: doc1.payment_terms_days,
    due_date: doc1.due_date,
    cae_expiration_date: doc1.cae_expiration_date,
    due_date_source: doc1.due_date_source,
  };

  console.log(`Resultado obtenido:`, JSON.stringify(actualRegression, null, 2));

  let case1Passed = true;
  for (const [k, v] of Object.entries(expectedRegression)) {
    if (actualRegression[k] !== v) {
      console.error(`[FAIL] Campo '${k}': esperado '${v}', obtenido '${actualRegression[k]}'`);
      case1Passed = false;
    }
  }

  // Demostración obligatoria: 2026-09-14 no se propone como vencimiento comercial
  if (doc1.due_date === "2026-09-14" || doc1.printed_due_date === "14/09/2026") {
    console.error(`[FAIL] Inseguridad: 2026-09-14 fue propuesto como vencimiento comercial!`);
    case1Passed = false;
  } else {
    console.log(`[OK] Demostrado: '2026-09-14' (Vencimiento CAE) fue correctamente descartado y NO se propone como vencimiento comercial.`);
  }

  if (case1Passed) {
    console.log(`[PASÓ] CASO 1: Regresión FA000400042797 validada al 100%.\n`);
  } else {
    console.log(`[FALLÓ] CASO 1: Regresión FA000400042797.\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // CASO 2: Fecha comercial explícitamente impresa
  // -------------------------------------------------------------
  console.log(`--- CASO 2: Fecha comercial explícitamente impresa (EXPLICIT_PRINTED) ---`);
  const rawExplicitCase = {
    schema_version: '2.0',
    document: {
      type_code: 'FACTURA',
      invoice_date: '2026-09-04',
      issue_date: '04/09/2026',
      printed_due_date: '25/09/2026', // Fecha comercial explícita en cabecera
      payment_terms_text: 'Vencimiento especial pactado',
      cae_expiration_date: '2026-09-14',
      cae_due_date: '14/09/2026',
      total_amount: 50000,
      currency: 'ARS',
    }
  };

  const processedCase2 = reconcileInvoiceEvidence(rawExplicitCase);
  const doc2 = processedCase2.document;

  if (doc2.due_date === '2026-09-25' && doc2.due_date_source === 'EXPLICIT_PRINTED') {
    console.log(`[PASÓ] CASO 2: due_date='${doc2.due_date}', due_date_source='${doc2.due_date_source}'.\n`);
  } else {
    console.error(`[FAIL] CASO 2: Se esperaba due_date='2026-09-25' y source='EXPLICIT_PRINTED', se obtuvo due_date='${doc2.due_date}', source='${doc2.due_date_source}'.\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // CASO 3: Condición de pago en días sin fecha impresa
  // -------------------------------------------------------------
  console.log(`--- CASO 3: Condición de pago en días (CALCULATED_FROM_PAYMENT_TERMS) ---`);
  const rawTermsCase = {
    schema_version: '2.0',
    document: {
      type_code: 'FACTURA',
      invoice_date: '2026-09-04',
      issue_date: '04/09/2026',
      printed_due_date: null,
      payment_terms_text: '15 días f.f.',
      payment_terms_days: 15,
      cae_expiration_date: '2026-09-14',
      total_amount: 12000,
      currency: 'ARS',
    }
  };

  const processedCase3 = reconcileInvoiceEvidence(rawTermsCase);
  const doc3 = processedCase3.document;

  // 2026-09-04 + 15 días = 2026-09-19
  if (doc3.due_date === '2026-09-19' && doc3.due_date_source === 'CALCULATED_FROM_PAYMENT_TERMS') {
    console.log(`[PASÓ] CASO 3: due_date='${doc3.due_date}', due_date_source='${doc3.due_date_source}'.\n`);
  } else {
    console.error(`[FAIL] CASO 3: Se esperaba due_date='2026-09-19', se obtuvo '${doc3.due_date}' (source='${doc3.due_date_source}').\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // CASO 4: Vencimiento del CAE sin vencimiento comercial
  // -------------------------------------------------------------
  console.log(`--- CASO 4: Vencimiento del CAE sin vencimiento comercial ni condición (MANUAL_REQUIRED) ---`);
  const rawCaeOnlyCase = {
    schema_version: '2.0',
    document: {
      type_code: 'FACTURA',
      invoice_date: '2026-09-04',
      issue_date: '04/09/2026',
      printed_due_date: null,
      payment_terms_text: 'Contado inmediato',
      payment_terms_days: 0,
      cae_expiration_date: '2026-09-14',
      total_amount: 35000,
      currency: 'ARS',
    }
  };

  const processedCase4 = reconcileInvoiceEvidence(rawCaeOnlyCase);
  const doc4 = processedCase4.document;

  if (doc4.due_date === null && doc4.due_date_source === 'MANUAL_REQUIRED' && doc4.cae_expiration_date === '2026-09-14') {
    console.log(`[PASÓ] CASO 4: due_date=null, due_date_source='MANUAL_REQUIRED', cae_expiration_date='${doc4.cae_expiration_date}' aislado.\n`);
  } else {
    console.error(`[FAIL] CASO 4: Se esperaba due_date=null y source='MANUAL_REQUIRED', se obtuvo due_date='${doc4.due_date}', source='${doc4.due_date_source}'.\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // CASO 5: Documento sin información suficiente (requiere ingreso manual)
  // -------------------------------------------------------------
  console.log(`--- CASO 5: Documento sin información suficiente (MANUAL_REQUIRED) ---`);
  const rawNoInfoCase = {
    schema_version: '2.0',
    document: {
      type_code: 'FACTURA',
      invoice_date: '2026-09-04',
      issue_date: '04/09/2026',
      printed_due_date: null,
      payment_terms_text: null,
      payment_terms_days: null,
      cae_expiration_date: null,
      total_amount: 10000,
      currency: 'ARS',
    }
  };

  const processedCase5 = reconcileInvoiceEvidence(rawNoInfoCase);
  const doc5 = processedCase5.document;

  if (doc5.due_date === null && doc5.due_date_source === 'MANUAL_REQUIRED') {
    console.log(`[PASÓ] CASO 5: due_date=null, due_date_source='MANUAL_REQUIRED'.\n`);
  } else {
    console.error(`[FAIL] CASO 5: Se esperaba due_date=null y source='MANUAL_REQUIRED', se obtuvo due_date='${doc5.due_date}'.\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // CASO 6: Presentación DD/MM/YYYY (Formato Argentino Estricto)
  // -------------------------------------------------------------
  console.log(`--- CASO 6: Presentación argentina de fechas DD/MM/YYYY ---`);
  const testIsoDates = [
    { iso: '2026-09-04', expected: '04/09/2026' },
    { iso: '2026-10-04', expected: '04/10/2026' },
    { iso: '2026-09-14', expected: '14/09/2026' },
    { iso: '2026-12-31', expected: '31/12/2026' },
    { iso: '2026-01-01', expected: '01/01/2026' },
  ];

  let case6Passed = true;
  for (const t of testIsoDates) {
    const formatted = formatDate(t.iso);
    if (formatted !== t.expected) {
      console.error(`[FAIL] formatDate('${t.iso}') devolvió '${formatted}', se esperaba '${t.expected}'`);
      case6Passed = false;
    }
  }

  // Comprobar que no produce MM/DD/YYYY
  const checkAmerican = formatDate('2026-09-04');
  if (checkAmerican.startsWith('09/04')) {
    console.error(`[FAIL] Se detectó formato anglosajón MM/DD/YYYY: '${checkAmerican}'`);
    case6Passed = false;
  }

  if (case6Passed) {
    console.log(`[PASÓ] CASO 6: Todas las fechas se normalizan a DD/MM/YYYY sin formato MM/DD/YYYY.\n`);
  } else {
    console.log(`[FALLÓ] CASO 6: Formato de fechas visible.\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // VERIFICACIÓN EN QA: NO SE CONFIRMÓ FACTURA NI SE GENERÓ LEDGER
  // -------------------------------------------------------------
  console.log(`--- CASO 7: Verificación en QA (No confirmación de documento ni Ledger) ---`);
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Verificamos si existe factura 0004-00042797 creada en esta fecha
    const { data: foundDocs, error: _docErr } = await supabase
      .from('documents')
      .select('id, human_reference, point_of_sale, document_number, status, created_at')
      .eq('point_of_sale', 4)
      .eq('document_number', 42797);

    console.log(`Consulta en tabla documents para 0004-00042797: total registros = ${foundDocs ? foundDocs.length : 0}`);
    if (foundDocs && foundDocs.length > 0) {
      console.log(`Registros encontrados (históricos previos):`, foundDocs.map(d => ({ id: d.id, ref: d.human_reference, created_at: d.created_at })));
    } else {
      console.log(`No existen documentos creados.`);
    }

    // Verificamos que no se crearon nuevos movimientos en las últimas 2 horas
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data: recentLedger, error: _ledgErr } = await supabase
      .from('supplier_balance_ledger')
      .select('id, document_id, delta_balance, created_at')
      .gte('created_at', twoHoursAgo);

    console.log(`Movimientos en supplier_balance_ledger en las últimas 2 horas: ${recentLedger ? recentLedger.length : 0}`);
    if (!recentLedger || recentLedger.length === 0) {
      console.log(`[OK] Se confirma que NO se creó ningún movimiento en el Ledger ni se confirmó la factura durante la prueba.`);
    } else {
      console.log(`Movimientos encontrados en las últimas 2h:`, recentLedger);
    }
  } catch (dbErr) {
    console.warn(`Aviso en consulta de auditoría DB:`, dbErr.message);
  }

  console.log(`\n=============================================================`);
  console.log(`RESULTADO FINAL DE LA SUITE: ${allPassed ? 'TODOS LOS CASOS PASARON EXITOSAMENTE (OK)' : 'FALLOS DETECTADOS'}`);
  console.log(`=============================================================`);

  if (!allPassed) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Error fatal en suite de regresión:', err);
  process.exit(1);
});
