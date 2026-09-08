/**
 * Unit Test Suite: Punctual Payment Benefit Calculation, Statuses, Multi-filter & Invariants
 */

import {
  calculatePunctualPaymentStatus,
  calculateAggregatedSupplierStatus,
  calculatePunctualStatusFromSummary,
  PUNCTUAL_PAYMENT_CONFIGS,
  PunctualPaymentStatus,
} from '../src/lib/punctualPayment';

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
console.log('TEST SUITE 1: Single Document Punctual Payment Status');
console.log('================================================================');

// Fixed reference date: 2026-09-07
const refDateStr = '2026-09-07';

// 1. Overdue: due yesterday (2026-09-06)
const sOverdue = calculatePunctualPaymentStatus('2026-09-06', refDateStr);
assert(sOverdue === 'OVERDUE', 'Vencido: fecha anterior a fecha de corte -> OVERDUE (Rojo)');

// 2. Due today: 2026-09-07
const sToday = calculatePunctualPaymentStatus('2026-09-07', refDateStr);
assert(sToday === 'DUE_SOON', 'Vence hoy: fecha igual a fecha de corte -> DUE_SOON (Amarillo)');

// 3. Due in 3 days: 2026-09-10
const s3Days = calculatePunctualPaymentStatus('2026-09-10', refDateStr);
assert(s3Days === 'DUE_SOON', 'Vence en 3 días: entre 1 y 7 días corridos -> DUE_SOON (Amarillo)');

// 4. Due in exactly 7 days: 2026-09-14
const s7Days = calculatePunctualPaymentStatus('2026-09-14', refDateStr);
assert(s7Days === 'DUE_SOON', 'Vence en exactamente 7 días corridos (límite superior inclusive) -> DUE_SOON (Amarillo)');

// 5. Due in 8 days: 2026-09-15
const s8Days = calculatePunctualPaymentStatus('2026-09-15', refDateStr);
assert(s8Days === 'ON_TIME', 'Vence en 8 días: después de 7 días corridos -> ON_TIME (Verde)');

// 6. Due in 30 days: 2026-10-07
const s30Days = calculatePunctualPaymentStatus('2026-10-07', refDateStr);
assert(s30Days === 'ON_TIME', 'Vence en 30 días -> ON_TIME (Verde)');

// 7. No due date: null or empty
const sNull = calculatePunctualPaymentStatus(null, refDateStr);
assert(sNull === 'NO_DUE_DATE', 'Sin vencimiento (null) -> NO_DUE_DATE (Gris)');

const sUndefined = calculatePunctualPaymentStatus(undefined, refDateStr);
assert(sUndefined === 'NO_DUE_DATE', 'Sin vencimiento (undefined) -> NO_DUE_DATE (Gris)');

console.log('\n================================================================');
console.log('TEST SUITE 2: Supplier Aggregated Status (Open Obligations Hierarchy)');
console.log('================================================================');

// Case A: Supplier with no open debt
const aggEmpty = calculateAggregatedSupplierStatus([], refDateStr);
assert(aggEmpty.status === 'NO_DUE_DATE', 'Proveedor sin obligaciones abiertas -> NO_DUE_DATE');

// Case B: Overdue document present (trumps any other document)
const aggOverdue = calculateAggregatedSupplierStatus([
  { due_date: '2026-09-05', reference_balance: 1000 },
  { due_date: '2026-09-20', reference_balance: 5000 },
], refDateStr);
assert(aggOverdue.status === 'OVERDUE', 'Proveedor con al menos 1 obligación vencida -> OVERDUE (Rojo)');
assert(aggOverdue.urgentDueDate === '2026-09-05', 'Fecha más urgente identificada correctamente');

// Case C: No overdue, but has obligation due within 7 days
const aggDueSoon = calculateAggregatedSupplierStatus([
  { due_date: '2026-09-12', reference_balance: 2000 },
  { due_date: '2026-09-30', reference_balance: 8000 },
], refDateStr);
assert(aggDueSoon.status === 'DUE_SOON', 'Proveedor sin vencidas con vto ≤ 7 días -> DUE_SOON (Amarillo)');
assert(aggDueSoon.urgentDueDate === '2026-09-12', 'Fecha más urgente identificada correctamente');

// Case D: All obligations due after 7 days
const aggOnTime = calculateAggregatedSupplierStatus([
  { due_date: '2026-09-18', reference_balance: 3000 },
  { due_date: '2026-10-01', reference_balance: 4000 },
], refDateStr);
assert(aggOnTime.status === 'ON_TIME', 'Todas las obligaciones vencen después de 7 días -> ON_TIME (Verde)');

// Case E: All obligations lack due date
const aggNoDueDate = calculateAggregatedSupplierStatus([
  { due_date: null, reference_balance: 1500 },
  { due_date: null, reference_balance: 2500 },
], refDateStr);
assert(aggNoDueDate.status === 'NO_DUE_DATE', 'Todas las obligaciones sin vencimiento -> NO_DUE_DATE (Gris)');
assert(aggNoDueDate.hasNoDueDateDocs === true, 'hasNoDueDateDocs marcado en true');

// Case F: Mixed obligations: Dated obligation + Undated obligation
const aggMixed = calculateAggregatedSupplierStatus([
  { due_date: '2026-09-10', reference_balance: 1000 },
  { due_date: null, reference_balance: 2000 },
], refDateStr);
assert(aggMixed.status === 'DUE_SOON', 'Obligación fechada prevalece para color -> DUE_SOON');
assert(aggMixed.hasNoDueDateDocs === true, 'Indicación accesible de comprobantes sin vencimiento presente');

// Case G: Negative or zero balances (cancelled/paid docs) must NOT trigger badges
const aggZeroBal = calculateAggregatedSupplierStatus([
  { due_date: '2026-08-01', reference_balance: 0 },
  { due_date: '2026-09-20', reference_balance: 3000 },
], refDateStr);
assert(aggZeroBal.status === 'ON_TIME', 'Obligación vencida con saldo 0 no altera el estado de obligaciones abiertas');

console.log('\n================================================================');
console.log('TEST SUITE 3: Pre-aggregated Query Helper (Summary Parity)');
console.log('================================================================');

const sumOverdue = calculatePunctualStatusFromSummary('2026-09-01', false, refDateStr);
assert(sumOverdue.status === 'OVERDUE', 'calculatePunctualStatusFromSummary OVERDUE');

const sumDueSoon = calculatePunctualStatusFromSummary('2026-09-11', true, refDateStr);
assert(sumDueSoon.status === 'DUE_SOON' && sumDueSoon.hasNoDueDateDocs === true, 'calculatePunctualStatusFromSummary DUE_SOON with undated docs');

const sumOnTime = calculatePunctualStatusFromSummary('2026-09-25', false, refDateStr);
assert(sumOnTime.status === 'ON_TIME', 'calculatePunctualStatusFromSummary ON_TIME');

console.log('\n================================================================');
console.log('TEST SUITE 4: Badge Accessibility & Multi-filter Logic');
console.log('================================================================');

// 1. Accessibility configs have labels, descriptions, and icon definitions
const statuses: PunctualPaymentStatus[] = ['OVERDUE', 'DUE_SOON', 'ON_TIME', 'NO_DUE_DATE'];
for (const st of statuses) {
  const cfg = PUNCTUAL_PAYMENT_CONFIGS[st];
  assert(Boolean(cfg.label), `Config for ${st} has accessible label`);
  assert(Boolean(cfg.description), `Config for ${st} has accessible description`);
  assert(Boolean(cfg.iconName), `Config for ${st} has iconName`);
  assert(Boolean(cfg.badgeClass), `Config for ${st} has badgeClass`);
}

// 2. Multi-filter matching logic
const filterEmpty: PunctualPaymentStatus[] = [];
const filterRedYellow: PunctualPaymentStatus[] = ['OVERDUE', 'DUE_SOON'];
const filterGreen: PunctualPaymentStatus[] = ['ON_TIME'];

// Sample items with strict discount enabled
const itemRed = { hasDiscount: true, status: 'OVERDUE' as PunctualPaymentStatus };
const itemYellow = { hasDiscount: true, status: 'DUE_SOON' as PunctualPaymentStatus };
const itemGreen = { hasDiscount: true, status: 'ON_TIME' as PunctualPaymentStatus };
const itemGray = { hasDiscount: true, status: 'NO_DUE_DATE' as PunctualPaymentStatus };
const itemNoDiscount = { hasDiscount: false, status: 'OVERDUE' as PunctualPaymentStatus };

function matchesPunctualFilter(item: { hasDiscount: boolean; status: PunctualPaymentStatus }, filters: PunctualPaymentStatus[]): boolean {
  if (filters.length === 0) return true;
  if (!item.hasDiscount) return false;
  return filters.includes(item.status);
}

assert(matchesPunctualFilter(itemRed, filterEmpty) === true, 'Empty filter matches red');
assert(matchesPunctualFilter(itemNoDiscount, filterEmpty) === true, 'Empty filter includes supplier without discount');
assert(matchesPunctualFilter(itemRed, filterRedYellow) === true, 'Filter [OVERDUE, DUE_SOON] matches red');
assert(matchesPunctualFilter(itemYellow, filterRedYellow) === true, 'Filter [OVERDUE, DUE_SOON] matches yellow');
assert(matchesPunctualFilter(itemGreen, filterRedYellow) === false, 'Filter [OVERDUE, DUE_SOON] rejects green');
assert(matchesPunctualFilter(itemGray, filterRedYellow) === false, 'Filter [OVERDUE, DUE_SOON] rejects gray');
assert(matchesPunctualFilter(itemNoDiscount, filterRedYellow) === false, 'Filter excludes supplier without discount');
assert(matchesPunctualFilter(itemGreen, filterGreen) === true, 'Filter [ON_TIME] matches green');

console.log('\n----------------------------------------------------------------');
console.log(`TOTAL PUNCTUAL PAYMENT UNIT TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('----------------------------------------------------------------');

if (failed > 0) {
  process.exit(1);
}
