/**
 * Cover images for catalogue rows: validate, downscale, then park the file in the
 * public media bucket. Falls back to an inline data URL when storage is unavailable
 * so a jacket is never lost just because the bucket is missing.
 */

export const COVER_BUCKET = 'library-media';
export const COVER_EDGE = 640;
export const COVER_QUALITY = 0.82;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** @returns {string} an error message, or '' when the file is usable */
export function coverFileError(file) {
  if (!file) return 'Pick an image file for the cover.';
  if (!String(file.type || '').startsWith('image/')) return 'Pick an image file for the cover.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is too large — try one under 12 MB.';
  return '';
}

function readImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    img.src = url;
  });
}

export async function toCoverBlob(file) {
  const image = await readImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) throw new Error('That image could not be read.');
  const scale = Math.min(1, COVER_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('That image could not be prepared.'))),
      'image/jpeg',
      COVER_QUALITY,
    );
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be prepared.'));
    reader.readAsDataURL(blob);
  });
}

function safeKey(hint) {
  const cleaned = String(hint || 'cover').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'cover').slice(0, 48);
}

/** A fresh filename each time keeps the CDN from serving the previous jacket. */
export async function uploadCoverBlob(config, blob, keyHint = 'cover') {
  const root = String(config?.supabaseUrl || '').replace(/\/$/, '');
  if (!root || !config?.supabaseAnonKey) return '';
  const path = `covers/${safeKey(keyHint)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const res = await fetch(`${root}/storage/v1/object/${COVER_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: blob,
  });
  return res.ok ? `${root}/storage/v1/object/public/${COVER_BUCKET}/${path}` : '';
}

/**
 * Validate → downscale → upload. Throws with a readable message on bad input.
 * @returns {Promise<string>} the URL to store on the book row
 */
export async function makeCoverUrl(config, file, keyHint = 'cover') {
  const problem = coverFileError(file);
  if (problem) throw new Error(problem);
  const blob = await toCoverBlob(file);
  // Bucket first; if media storage is unavailable the jacket rides along on the row.
  return (await uploadCoverBlob(config, blob, keyHint)) || (await blobToDataUrl(blob));
}
