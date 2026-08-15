/**
 * ISBN-10 / ISBN-13 normalize, validate, and edition-safe pairing.
 * ISBN-10 and its ISBN-13 (978…) form are treated as the same edition.
 * 979 ISBN-13 values have no ISBN-10 pair and stay distinct.
 */

export function isbnDigits(value) {
  return String(value ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

function isbn10Checksum(d9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(d9[i]);
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? 'X' : String(rem);
}

function isbn13Checksum(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function isValidIsbn10(d) {
  const digits = isbnDigits(d);
  return /^[0-9]{9}[0-9X]$/.test(digits) && isbn10Checksum(digits.slice(0, 9)) === digits[9];
}

export function isValidIsbn13(d) {
  const digits = isbnDigits(d);
  return /^[0-9]{13}$/.test(digits) && isbn13Checksum(digits.slice(0, 12)) === digits[12];
}

export function isbn10To13(d) {
  const digits = isbnDigits(d);
  if (!isValidIsbn10(digits)) return null;
  const core = `978${digits.slice(0, 9)}`;
  return core + isbn13Checksum(core);
}

export function isbn13To10(d) {
  const digits = isbnDigits(d);
  if (!isValidIsbn13(digits) || !digits.startsWith('978')) return null;
  const d9 = digits.slice(3, 12);
  return d9 + isbn10Checksum(d9);
}

/**
 * @returns {{ canonical: string, isbn10: string | null, isbn13: string } | null}
 */
export function normalizeIsbn(value) {
  const d = isbnDigits(value);
  if (!d) return null;
  if (d.length === 10) {
    if (!isValidIsbn10(d)) return null;
    const isbn13 = isbn10To13(d);
    if (!isbn13) return null;
    return { canonical: isbn13, isbn10: d, isbn13 };
  }
  if (d.length === 13) {
    if (!isValidIsbn13(d)) return null;
    if (!d.startsWith('978') && !d.startsWith('979')) return null;
    return { canonical: d, isbn10: isbn13To10(d), isbn13: d };
  }
  return null;
}

export function isbnKeys(normalized) {
  if (!normalized) return [];
  return [...new Set([normalized.canonical, normalized.isbn13, normalized.isbn10].filter(Boolean))];
}

export function looksLikeBarcode(value) {
  const d = isbnDigits(value);
  return d.length >= 8 && d.length <= 14;
}

export function matchesIsbn(stored, normalized) {
  if (!stored || !normalized) return false;
  const keys = new Set(isbnKeys(normalized));
  const other = normalizeIsbn(stored);
  if (other) return keys.has(other.canonical);
  const digits = isbnDigits(stored);
  return keys.has(digits);
}
