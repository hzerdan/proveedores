/**
 * Argentine CUIT / CUIL Validator & Formatter (Module 11)
 */

export function cleanCuit(cuit: string): string {
  return cuit.replace(/[^0-9]/g, '');
}

export function formatCuit(cuit: string): string {
  const clean = cleanCuit(cuit);
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10, 11)}`;
}

export function isValidCuit(cuit: string): boolean {
  const clean = cleanCuit(cuit);
  if (clean.length !== 11) return false;

  const validPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
  const prefix = clean.slice(0, 2);
  if (!validPrefixes.includes(prefix)) {
    return false;
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  let calculatedDigit = 11 - (sum % 11);
  if (calculatedDigit === 11) {
    calculatedDigit = 0;
  } else if (calculatedDigit === 10) {
    calculatedDigit = 9;
  }

  const checkDigit = parseInt(clean[10], 10);
  return calculatedDigit === checkDigit;
}
