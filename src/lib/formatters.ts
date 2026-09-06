/**
 * Utilidades de formateo y validación canónica de fechas y monedas
 * Regla obligatoria: Toda fecha humana visible debe ser DD/MM/YYYY.
 */

export interface ParsedDateComponents {
  day: number;
  month: number;
  year: number;
}

/**
 * Parsea y valida estrictamente una fecha canónica humana (DD/MM/YYYY) o técnica (YYYY-MM-DD).
 * - Rechaza fechas sin ceros iniciales (ej: '1/8/2026').
 * - Rechaza formatos mezclados o con separadores incorrectos.
 * - Rechaza fechas calendariamente inexistentes (ej: 31/02/2026, 31/04/2026, 29/02/2025).
 * - No realiza conversiones a hora local que produzcan desfases por huso horario.
 */
export function parseCanonicalDate(dateStr?: string | null): ParsedDateComponents | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  let d: number;
  let m: number;
  let y: number;

  // 1. Formato humano canónico estricto: DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    y = parseInt(parts[2], 10);
  }
  // 2. Formato técnico ISO estricto: YYYY-MM-DD
  else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else {
    return null;
  }

  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (y < 1900 || y > 2100) return null;

  // Validación inversa de componentes de calendario:
  // Comprobar que Date.UTC no ruede al mes siguiente por días inexistentes
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    utc.getUTCFullYear() !== y ||
    (utc.getUTCMonth() + 1) !== m ||
    utc.getUTCDate() !== d
  ) {
    return null;
  }

  return { day: d, month: m, year: y };
}

/**
 * Convierte componentes parseados a fecha canónica humana: DD/MM/YYYY
 */
export function toHumanDate(parsed: ParsedDateComponents | null): string | null {
  if (!parsed) return null;
  const dd = String(parsed.day).padStart(2, '0');
  const mm = String(parsed.month).padStart(2, '0');
  return `${dd}/${mm}/${parsed.year}`;
}

/**
 * Convierte componentes parseados a fecha técnica de persistencia: YYYY-MM-DD
 */
export function toIsoDate(parsed: ParsedDateComponents | null): string | null {
  if (!parsed) return null;
  const dd = String(parsed.day).padStart(2, '0');
  const mm = String(parsed.month).padStart(2, '0');
  return `${parsed.year}-${mm}-${dd}`;
}

/**
 * Formatea una fecha a formato canónico humano argentino: DD/MM/YYYY
 * Soporta strings YYYY-MM-DD, ISO Timestamps y DD/MM/YYYY.
 * Previene desfases de 1 día causados por zonas horarias.
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-';

  // Si incluye hora (ej: 2026-08-18T14:30:00Z), tomar la porción de fecha
  const cleanStr = dateString.split('T')[0];
  const parsed = parseCanonicalDate(cleanStr);
  if (parsed) {
    return toHumanDate(parsed)!;
  }

  // Fallback seguro solo si vino con otro separador pero componentes válidos
  const parts = cleanStr.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const val = parseCanonicalDate(`${parts[0]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      if (val) return toHumanDate(val)!;
    } else if (parts[2].length === 4) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const val = parseCanonicalDate(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${parts[2]}`);
      if (val) return toHumanDate(val)!;
    }
  }

  return dateString;
}

/**
 * Formatea fecha y hora: DD/MM/YYYY HH:mm
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

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formatea moneda argentina y multimoneda
 */
export function formatMoney(amount?: number | null, currency?: string): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return currency && currency !== 'ARS' ? `${currency} 0,00` : '$0,00';
  }
  const symbol = currency && currency !== 'ARS' ? `${currency} ` : '$';
  return `${symbol}${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
