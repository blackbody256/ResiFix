// Photo helpers for fault reports (PB-007). Phone cameras produce 3-12 MB images; the API
// accepts JPEG/PNG/WebP up to 5 MB, and residents are often on slow or metered data. So we
// downscale to MAX_EDGE px and re-encode as JPEG in the browser before uploading.

export const MAX_PHOTOS = 2; // PB-007: up to two photos per report
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // must match MAX_PHOTO_BYTES on the server
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_EDGE = 1600;
const QUALITY = 0.8;

/** Value for <input type="file" accept>. HEIC etc. are converted by most phone browsers. */
export const PHOTO_ACCEPT = 'image/*';

/**
 * Resize and re-encode an image to JPEG. Falls back to the original file when the browser
 * cannot decode it, as long as the original is already an accepted type and small enough.
 */
export async function preparePhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) throw new Error('encode failed');
    // Keep the original if it was already smaller (e.g. a small PNG screenshot).
    if (ACCEPTED.includes(file.type) && file.size <= blob.size) return checked(file);
    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return checked(new File([blob], `${name}.jpg`, { type: 'image/jpeg' }));
  } catch {
    return checked(file);
  }
}

function checked(file: File): File {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error(`${file.name}: photos must be JPEG, PNG or WebP.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than 5 MB.`);
  }
  return file;
}
