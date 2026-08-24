/**
 * Formatea una fecha YYYY-MM-DD o ISO a formato argentino / latino: DD-MM-YYYY
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-';
  
  // Si ya viene como YYYY-MM-DD
  const cleanStr = dateString.split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) {
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }

  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Formatea fecha y hora: DD-MM-YYYY HH:mm
 */
export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

/**
 * Formatea moneda argentina
 */
export function formatMoney(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '$0,00';
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
