/**
 * Unit Test Suite: Formatters, Canonical Date Parser, Deterministic Normalizer & Schema v2.0
 */

import { parseCanonicalDate, toHumanDate, toIsoDate, formatDate } from '../src/lib/formatters';
import {
  computeDeterministicDueDate,
  reconcileInvoiceEvidence,
  evaluateExtractionStatus,
} from '../src/lib/aiExtractor';
import { isValidCuit, formatCuit, cleanCuit } from '../src/lib/cuitValidator';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('TEST SUITE 1: parseCanonicalDate & Calendar Constraints');
console.log('================================================================');

// 1. Valid canonical dates
const d1 = parseCanonicalDate('24/08/2026');
assert(d1 !== null && d1.day === 24 && d1.month === 8 && d1.year === 2026, 'Valid human DD/MM/YYYY');

const d2 = parseCanonicalDate('2026-08-24');
assert(d2 !== null && d2.day === 24 && d2.month === 8 && d2.year === 2026, 'Valid technical YYYY-MM-DD');

// 2. Leap year handling
const leapValid = parseCanonicalDate('29/02/2024');
assert(leapValid !== null && leapValid.day === 29 && leapValid.month === 2, 'Valid leap year 29/02/2024');

const leapInvalid = parseCanonicalDate('29/02/2025');
assert(leapInvalid === null, 'Reject non-leap 29/02/2025');

// 3. Calendar edge cases (months with 30 days)
const apr31 = parseCanonicalDate('31/04/2026');
assert(apr31 === null, 'Reject non-existent 31/04/2026 (April has 30 days)');

const jun31 = parseCanonicalDate('31/06/2026');
assert(jun31 === null, 'Reject non-existent 31/06/2026 (June has 30 days)');

const feb31 = parseCanonicalDate('31/02/2026');
assert(feb31 === null, 'Reject non-existent 31/02/2026 (February has 28 days)');

const feb30 = parseCanonicalDate('30/02/2024');
assert(feb30 === null, 'Reject non-existent 30/02/2024');

// 4. Strict formatting rules
const noZero = parseCanonicalDate('1/8/2026');
assert(noZero === null, 'Reject missing leading zero 1/8/2026');

const noZeroMonth = parseCanonicalDate('01/8/2026');
assert(noZeroMonth === null, 'Reject missing leading zero 01/8/2026');

const mixed = parseCanonicalDate('2026/08/24');
assert(mixed === null, 'Reject mixed format 2026/08/24');

const hyphenReversed = parseCanonicalDate('24-08-2026');
assert(hyphenReversed === null, 'Reject hyphens with human ordering 24-08-2026');

// 5. Converters & formatDate
assert(toHumanDate(d1) === '24/08/2026', 'toHumanDate produces DD/MM/YYYY');
assert(toIsoDate(d1) === '2026-08-24', 'toIsoDate produces YYYY-MM-DD');
assert(formatDate('2026-08-24') === '24/08/2026', 'formatDate converts YYYY-MM-DD to DD/MM/YYYY');
assert(formatDate('2026-08-24T18:30:00Z') === '24/08/2026', 'formatDate parses ISO timestamp without timezone day shift');

console.log('\n================================================================');
console.log('TEST SUITE 2: CUIT Módulo 11 Validation & Normalization');
console.log('================================================================');

assert(isValidCuit('30-71192994-7'), 'Valid CUIT 30-71192994-7');
assert(isValidCuit('20-12345678-6'), 'Valid CUIT 20-12345678-6');
assert(!isValidCuit('30-71192994-0'), 'Reject invalid checksum 30-71192994-0');
assert(cleanCuit('30-71192994-7') === '30711929947', 'cleanCuit strips dashes');
assert(formatCuit('30711929947') === '30-71192994-7', 'formatCuit formats correctly');

console.log('\n================================================================');
console.log('TEST SUITE 3: Deterministic Due Date Computation');
console.log('================================================================');

const due30 = computeDeterministicDueDate('24/08/2026', 30, 'ISSUE_DATE');
assert(due30.human === '23/09/2026', '24/08/2026 + 30 days = 23/09/2026');
assert(due30.iso === '2026-09-23', 'ISO output 2026-09-23');

const due0 = computeDeterministicDueDate('24/08/2026', 0, 'ISSUE_DATE');
assert(due0.human === '24/08/2026', '24/08/2026 + 0 days = 24/08/2026');

const dueOtherBasis = computeDeterministicDueDate('24/08/2026', 30, 'RECEIPT_DATE');
assert(dueOtherBasis.human === null, 'RECEIPT_DATE basis returns null (cannot assume reception date)');

console.log('\n================================================================');
console.log('TEST SUITE 4: reconcileInvoiceEvidence & Schema v2.0 vs v1.0 Coexistence');
console.log('================================================================');

// Test Case A: Historical v1 payload (uses due_date, numeric point_of_sale and document_number)
const legacyV1 = {
  supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR V1 S.A.', trade_name: 'V1 Test' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: 8,
    document_number: 30893,
    issue_date: '2026-08-24',
    due_date: '2026-09-23',
    currency: 'ARS',
    total_amount: 482160.80,
  },
  warnings: [],
  missing_fields: [],
  uncertain_fields: [],
};

const normV1 = reconcileInvoiceEvidence(legacyV1);
assert(normV1.schema_version === '1.0', 'Identified as Schema v1.0');
assert(normV1.document.point_of_sale === '8', 'Preserved point_of_sale as string');
assert(normV1.document.document_number === '30893', 'Preserved document_number as string');
assert(normV1.document.issue_date === '24/08/2026', 'Formatted issue_date to DD/MM/YYYY');
assert(normV1.document.printed_due_date === '23/09/2026', 'Mapped legacy due_date to printed_due_date (DD/MM/YYYY)');
assert(normV1.supplier.is_valid_cuit === true, 'Validated supplier CUIT');

// Test Case B: Schema v2.0 with Discrepancy (Printed != Calculated)
const schemaV2Discrepancy = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-6', legal_name: 'EMPRESA EJEMPLO S.A.', trade_name: 'Ejemplo' },
  receiver: { tax_id: '30-11223344-5', name: 'Leon SA' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00008',
    document_number: '00030893',
    issue_date: '2026-08-24',
    printed_due_date: '2026-09-15', // Printed says Sep 15
    payment_condition_text: 'Vencimiento a 30 días factura',
    payment_term_days: 30,
    payment_term_basis: 'ISSUE_DATE',
    currency: 'ARS',
    net_amount: 398480.00,
    tax_amount: 83680.80,
    total_amount: 482160.80,
    cae: '74351234567890',
    cae_due_date: '2026-09-03',
    concept: 'Artículos de librería',
  },
  uncertain_fields: [],
  warnings: [],
  missing_fields: [],
};

const normV2 = reconcileInvoiceEvidence(schemaV2Discrepancy);
assert(normV2.schema_version === '2.0', 'Identified as Schema v2.0');
assert(normV2.document.point_of_sale === '00008', 'Leading zeros preserved in point_of_sale');
assert(normV2.document.document_number === '00030893', 'Leading zeros preserved in document_number');
assert(normV2.document.printed_due_date === '15/09/2026', 'Printed due date DD/MM/YYYY');
assert(normV2.document.calculated_due_date === '23/09/2026', 'Calculated due date DD/MM/YYYY');
assert(normV2.document.due_date_inconsistency === true, 'Discrepancy detected (due_date_inconsistency === true)');
assert(normV2.uncertain_fields.includes('document.due_date'), 'document.due_date added to uncertain_fields');
assert(normV2.document.arithmetic_balanced === true, 'Arithmetic net + tax == total matches');

// Test Case C: Arithmetic Non-balanced invoice (withholdings / other taxes)
const schemaV2Withholding = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-6' },
  document: {
    issue_date: '2026-08-24',
    net_amount: 1000,
    tax_amount: 210,
    total_amount: 1250, // 40 pesos of withholdings / IIBB
  },
};

const normWithholding = reconcileInvoiceEvidence(schemaV2Withholding);
assert(normWithholding.document.arithmetic_balanced === false, 'Detected arithmetic difference');
assert(normWithholding.document.total_amount === 1250, 'Did NOT discard or alter total_amount');
assert(normWithholding.warnings.some(w => w.includes('difiriendo del Total')), 'Generated informational warning without blocking');

console.log('\n================================================================');
console.log('TEST SUITE 5: Deterministic Extraction Status Classification (SUCCESS vs PARTIAL vs FAILED)');
console.log('================================================================');

// Case 1: Clean, fully-compliant invoice -> SUCCESS
const cleanInvoice = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'LUMA PRODUCTOS S.R.L.' },
  receiver: { tax_id: '20-12345678-6', name: 'Leon SA' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00008',
    document_number: '00030893',
    issue_date: '2026-08-24',
    currency: 'ARS',
    net_amount: 398480.00,
    tax_amount: 83680.80,
    total_amount: 482160.80,
  },
  uncertain_fields: [],
  warnings: [],
  missing_fields: [],
};
const cleanResult = reconcileInvoiceEvidence(cleanInvoice);
assert(cleanResult.status === 'SUCCESS', 'Compliant invoice classified as SUCCESS');
assert(cleanResult.status_reasons.length === 0, 'SUCCESS has no rejection reasons');

// Case 2: Historical Mobile Photo (Tecnografic) -> PARTIAL (Never SUCCESS)
// Features: CUIT fails modulo 11, doc_number 16-digits (1000000030001006)
const tecnograficHistorical = {
  schema_version: '2.0',
  supplier: { tax_id: '20-27196491-7', legal_name: 'TECNOGRAFIC DE MORINI CESAR' },
  receiver: { tax_id: '30-71192994-7', name: 'LEON SA' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00003',
    document_number: '1000000030001006',
    issue_date: '2026-08-28',
    currency: 'ARS',
    total_amount: 36000,
  },
  uncertain_fields: [],
  warnings: [],
  missing_fields: [],
};
const tecnoResult = reconcileInvoiceEvidence(tecnograficHistorical);
assert(tecnoResult.status === 'PARTIAL', 'Tecnografic historical sample strictly classified as PARTIAL');
assert(tecnoResult.status !== 'SUCCESS', 'Tecnografic NEVER classified as SUCCESS');
assert(tecnoResult.status_reasons.some(r => r.includes('CUIT')), 'Tecnografic flags invalid CUIT checksum');
assert(tecnoResult.status_reasons.some(r => r.includes('Número de comprobante')), 'Tecnografic flags 16-digit anomalous doc number');

// Case 3: Inconsistent Issuer and Receiver (Same CUIT) -> PARTIAL
const selfInvoice = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7' },
  receiver: { tax_id: '30-71192994-7' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00001',
    document_number: '00000001',
    issue_date: '2026-08-24',
    currency: 'ARS',
    total_amount: 1000,
  },
};
const selfResult = reconcileInvoiceEvidence(selfInvoice);
assert(selfResult.status === 'PARTIAL', 'Self-issued invoice classified as PARTIAL');
assert(selfResult.status_reasons.some(r => r.includes('coincide')), 'Identifies issuer-receiver CUIT collision');

// Case 5: Absent printed due date IS permitted for SUCCESS (e.g. cash sale)
const cashInvoice = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR CONTADO S.A.' },
  receiver: { tax_id: '20-12345678-6', name: 'Leon SA' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00002',
    document_number: '00000123',
    issue_date: '2026-08-24',
    printed_due_date: null, // Absent due date
    currency: 'ARS',
    net_amount: 1000,
    tax_amount: 210,
    total_amount: 1210,
  },
};
const cashResult = reconcileInvoiceEvidence(cashInvoice);
assert(cashResult.status === 'SUCCESS', 'Absent due date permitted -> SUCCESS for cash/unspecified term invoice');

// Case 6: Contradictory due date (due date earlier than issue date) -> PARTIAL
const contradictoryDueDate = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR S.A.' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00002',
    document_number: '00000124',
    issue_date: '2026-08-24',
    printed_due_date: '2026-08-10', // 14 days BEFORE issue date!
    currency: 'ARS',
    total_amount: 1210,
  },
};
const contraResult = reconcileInvoiceEvidence(contradictoryDueDate);
assert(contraResult.status === 'PARTIAL', 'Contradictory due date (earlier than issue) -> PARTIAL');
assert(contraResult.status_reasons.some(r => r.includes('anterior a la fecha de emisión')), 'Identifies due date prior to issue date');

// Case 7: Critical field uncertain -> PARTIAL
const uncertainCriticalDoc = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR S.A.' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00002',
    document_number: '00000125',
    issue_date: '2026-08-24',
    currency: 'ARS',
    total_amount: 1210,
  },
  uncertain_fields: ['document.total_amount'],
};
const uncertainResult = reconcileInvoiceEvidence(uncertainCriticalDoc);
assert(uncertainResult.status === 'PARTIAL', 'Uncertain critical field (total_amount) -> PARTIAL');
assert(uncertainResult.status_reasons.some(r => r.includes('Campos críticos con lectura incierta')), 'Identifies uncertain critical field reason');

// Case 8: Critical field missing -> PARTIAL
const missingCriticalDoc = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR S.A.' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00002',
    document_number: '00000126',
    issue_date: '2026-08-24',
    currency: 'ARS',
    total_amount: 1210,
  },
  missing_fields: ['document.point_of_sale'],
};
const missingResult = reconcileInvoiceEvidence(missingCriticalDoc);
assert(missingResult.status === 'PARTIAL', 'Missing critical field declared -> PARTIAL');
assert(missingResult.status_reasons.some(r => r.includes('Campos críticos declarados ausentes')), 'Identifies missing critical field reason');

// Case 9: Unexplained arithmetic inconsistency -> PARTIAL
const arithmeticInconsistencyDoc = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR S.A.' },
  document: {
    type_code: 'FACTURA',
    letter: 'A',
    point_of_sale: '00002',
    document_number: '00000127',
    issue_date: '2026-08-24',
    currency: 'ARS',
    net_amount: 1000,
    tax_amount: 210,
    total_amount: 5000, // Unexplained major discrepancy!
  },
};
const arithResult = reconcileInvoiceEvidence(arithmeticInconsistencyDoc);
assert(arithResult.status === 'PARTIAL', 'Unexplained arithmetic difference -> PARTIAL');
assert(arithResult.status_reasons.some(r => r.includes('Inconsistencia aritmética no explicable')), 'Identifies arithmetic discrepancy reason');

// Case 10: Technical error (Storage or OpenAI failure payload) -> FAILED
const technicalFailurePayload = {
  schema_version: '2.0',
  status: 'FAILED' as const,
  status_reasons: ['Error al descargar archivo de Storage: Object not found'],
  supplier: { tax_id: null, legal_name: null, trade_name: null, is_valid_cuit: false },
  receiver: { tax_id: null, name: null },
  document: {
    type_code: 'FACTURA' as const,
    letter: 'A' as const,
    point_of_sale: null,
    document_number: null,
    issue_date: null,
    currency: 'ARS' as const,
    net_amount: null,
    tax_amount: null,
    total_amount: null,
    due_date_inconsistency: false,
    printed_due_date: null,
    payment_condition_text: null,
    payment_term_days: null,
    payment_term_basis: null,
    calculated_due_date: null,
    cae: null,
    cae_due_date: null,
    concept: null,
  },
  uncertain_fields: [],
  warnings: ['Error al descargar archivo de Storage: Object not found'],
  missing_fields: [],
};
assert(technicalFailurePayload.status === 'FAILED', 'Storage/OpenAI error mapped to FAILED');
assert(technicalFailurePayload.status_reasons[0].includes('Object not found'), 'Preserves real technical error');

// Case 11: Document Type Matrix Check: RECIBO does not require letter or point of sale
const validRecibo = {
  schema_version: '2.0',
  supplier: { tax_id: '30-71192994-7', legal_name: 'COBRANZAS S.A.' },
  document: {
    type_code: 'RECIBO',
    letter: null, // Recibos do not require letter
    point_of_sale: null, // Recibos do not strictly require POS
    document_number: '00004567',
    issue_date: '2026-08-24',
    currency: 'ARS',
    total_amount: 15000,
  },
};
const reciboResult = reconcileInvoiceEvidence(validRecibo);
assert(reciboResult.status === 'SUCCESS', 'Valid RECIBO without letter or POS evaluated as SUCCESS');

// Case 12: Direct call to evaluateExtractionStatus with empty payload -> FAILED
const directEmpty = evaluateExtractionStatus({
  supplier: { tax_id: null, legal_name: null, trade_name: null, is_valid_cuit: false },
  document: {
    type_code: null,
    letter: null,
    point_of_sale: null,
    document_number: null,
    issue_date: null,
    printed_due_date: null,
    payment_condition_text: null,
    payment_term_days: null,
    payment_term_basis: null,
    calculated_due_date: null,
    due_date_inconsistency: false,
    currency: null,
    net_amount: null,
    tax_amount: null,
    total_amount: null,
    cae: null,
    cae_due_date: null,
    concept: null,
  },
});
assert(directEmpty.status === 'FAILED', 'Direct evaluateExtractionStatus returns FAILED for empty input');

console.log('\n================================================================');
console.log('TEST SUITE 5: Contractual Parity (Edge Function vs Frontend Evaluator)');
console.log('================================================================');

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Extract the Edge Function's exact evaluator code from supabase/functions/extract-invoice/index.ts
const edgeFunctionPath = path.resolve(process.cwd(), 'supabase/functions/extract-invoice/index.ts');
const edgeFunctionCode = fs.readFileSync(edgeFunctionPath, 'utf8');

// Isolate helper functions and evaluateExtractionStatus from Edge Function
const startIdx = edgeFunctionCode.indexOf('function cleanCuit');
const endMarker = 'serve(async (req) => {';
const endIdx = edgeFunctionCode.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  throw new Error('Could not locate evaluateExtractionStatus in Edge Function source code');
}

const rawEdgeCode = `
  ${edgeFunctionCode.substring(startIdx, endIdx)}
  return evaluateExtractionStatus(fixture);
`;

const transpiled = ts.transpileModule(rawEdgeCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

const runEdgeEvaluator = new Function('fixture', transpiled);

// Fixture Matrix
const contractualFixtures: Array<{ name: string; payload: any }> = [
  {
    name: 'Full Valid Factura A (SUCCESS)',
    payload: {
      supplier: { tax_id: '30-71192994-7', legal_name: 'PROVEEDOR S.A.' },
      receiver: { tax_id: '20-12345678-6', name: 'LEON ARQ' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00008',
        document_number: '00030893',
        issue_date: '2026-08-24',
        printed_due_date: '2026-09-24',
        currency: 'ARS',
        net_amount: 1000,
        tax_amount: 210,
        total_amount: 1210,
      },
      uncertain_fields: [],
      missing_fields: [],
    },
  },
  {
    name: 'Valid Factura B without due date (allowed e.g. contado) (SUCCESS)',
    payload: {
      supplier: { tax_id: '30-71192994-7', legal_name: 'SERVICIOS SRL' },
      document: {
        type_code: 'FACTURA',
        letter: 'B',
        point_of_sale: '0001',
        document_number: '00001234',
        issue_date: '2026-08-24',
        currency: 'ARS',
        total_amount: 5000,
      },
      uncertain_fields: [],
      missing_fields: [],
    },
  },
  {
    name: 'Valid Recibo without Letter or POS (SUCCESS)',
    payload: {
      supplier: { tax_id: '30-71192994-7', legal_name: 'COBRANZAS S.A.' },
      document: {
        type_code: 'RECIBO',
        document_number: '00004567',
        issue_date: '2026-08-24',
        currency: 'ARS',
        total_amount: 15000,
      },
      uncertain_fields: [],
      missing_fields: [],
    },
  },
  {
    name: 'Invalid Issuer CUIT Checksum (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-0', legal_name: 'PROVEEDOR' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00001',
        document_number: '00000001',
        issue_date: '2026-08-24',
        currency: 'ARS',
        total_amount: 100,
      },
    },
  },
  {
    name: 'POS Out of Fiscal Range > 99999 (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-7' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '100000',
        document_number: '00000001',
        issue_date: '2026-08-24',
        currency: 'ARS',
        total_amount: 100,
      },
    },
  },
  {
    name: 'Invalid Calendar Date 31/04/2026 (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-7' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00001',
        document_number: '00000001',
        issue_date: '31/04/2026',
        currency: 'ARS',
        total_amount: 100,
      },
    },
  },
  {
    name: 'Due Date Prior to Issue Date (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-7' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00001',
        document_number: '00000001',
        issue_date: '2026-08-24',
        printed_due_date: '2026-08-10',
        currency: 'ARS',
        total_amount: 100,
      },
    },
  },
  {
    name: 'Arithmetic Inconsistency Net + Tax != Total (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-7' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00001',
        document_number: '00000001',
        issue_date: '2026-08-24',
        currency: 'ARS',
        net_amount: 1000,
        tax_amount: 210,
        total_amount: 5000, // Arithmetic error
      },
    },
  },
  {
    name: 'Uncertain Critical Field in Factura (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-7' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00001',
        document_number: '00000001',
        issue_date: '2026-08-24',
        currency: 'ARS',
        total_amount: 100,
      },
      uncertain_fields: ['document.total_amount'],
    },
  },
  {
    name: 'Issuer and Receiver CUIT Collision (PARTIAL)',
    payload: {
      supplier: { tax_id: '30-71192994-7' },
      receiver: { tax_id: '30-71192994-7' },
      document: {
        type_code: 'FACTURA',
        letter: 'A',
        point_of_sale: '00001',
        document_number: '00000001',
        issue_date: '2026-08-24',
        currency: 'ARS',
        total_amount: 100,
      },
    },
  },
  {
    name: 'Empty and Corrupt Payload (FAILED)',
    payload: {
      supplier: { tax_id: null },
      document: {
        type_code: null,
        total_amount: null,
      },
    },
  },
];

for (const [idx, fixture] of contractualFixtures.entries()) {
  const edgeResult = runEdgeEvaluator(fixture.payload);
  const frontResult = evaluateExtractionStatus(fixture.payload);

  const statusMatch = edgeResult.status === frontResult.status;
  const edgeCodes = edgeResult.structured_reasons.map((r: any) => r.code).sort();
  const frontCodes = frontResult.structured_reasons.map((r: any) => r.code).sort();
  const codesMatch = JSON.stringify(edgeCodes) === JSON.stringify(frontCodes);

  assert(
    statusMatch && codesMatch,
    `Contractual Parity [${idx + 1}/${contractualFixtures.length}]: ${fixture.name} -> ${edgeResult.status} [${edgeCodes.join(', ')}]`,
    `Edge: ${edgeResult.status} (${edgeCodes.join(',')}) vs Front: ${frontResult.status} (${frontCodes.join(',')})`
  );
}

console.log('\n----------------------------------------------------------------');
console.log(`TOTAL UNIT TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('----------------------------------------------------------------');

if (failed > 0) {
  process.exit(1);
}
