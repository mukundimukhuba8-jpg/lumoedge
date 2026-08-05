import {
  fileToDataUrl,
  isAllowedMediaFile,
  mediaKey,
  uploadMentorMediaFile,
  type MentorMediaKind,
  type MentorMediaSlotId,
} from './mentorMedia';
import { isFirebaseConfigured } from './firebase';
import { firebaseUploadFile } from './firebaseDb';
import { compressImageFile, publishMentorMediaImage, saveEaImage } from './storage';

export type UploadProgress = { pct: number; stage: string };

export type BackgroundUploadResult = {
  url: string;
  kind: MentorMediaKind;
};

export const MAX_BACKGROUNDS = 3;

const STEP_TIMEOUT_MS = 20_000;
const VIDEO_TIMEOUT_MS = 90_000;
/**
 * Keep under saveEaImage local cache limit AND small enough that Firebase
 * Storage/RTDB finishes on phone networks. Profile pics use 480px; backgrounds
 * need a bit more detail but the old 960px/400k target often hit the hard
 * 25s timeout and falsely failed the upload.
 */
const TARGET_DATA_URL_CHARS = 280_000;

function timeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, timeoutPromise<T>(ms, message)]);
}

function softTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

function yieldMain(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!m) return null;
    const mime = m[1] || 'image/jpeg';
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Compress closer to profile upload so phone cloud sync finishes.
 * Full-bleed still looks good at ~720px on mobile viewports.
 */
async function compressForBackground(file: File): Promise<string> {
  let maxSize = 720;
  let quality = 0.7;

  for (let attempt = 0; attempt < 5; attempt++) {
    await yieldMain();
    const dataUrl = await raceTimeout(
      compressImageFile(file, maxSize, quality),
      STEP_TIMEOUT_MS,
      'Image processing timed out — try a smaller JPG/PNG.',
    );
    if (dataUrl.length <= TARGET_DATA_URL_CHARS) return dataUrl;
    maxSize = Math.round(maxSize * 0.78);
    quality = Math.max(0.48, quality - 0.08);
  }

  await yieldMain();
  return raceTimeout(
    compressImageFile(file, 560, 0.5),
    STEP_TIMEOUT_MS,
    'Image processing timed out — try a smaller JPG/PNG.',
  );
}

/**
 * Background upload — same soft-timeout cloud path as profile EA image.
 * Never hard-fail with "Cloud sync timed out" after bytes are saved locally;
 * profile picture already falls back to img: refs and keeps success.
 */
export async function uploadBackgroundMedia(
  adminId: string,
  slot: MentorMediaSlotId,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<BackgroundUploadResult> {
  if (!adminId) throw new Error('Sign in to the portal before uploading backgrounds.');

  const check = isAllowedMediaFile(file);
  if (!check.ok) throw new Error(check.error);

  const key = mediaKey(adminId, slot);
  onProgress?.({ pct: 8, stage: 'Reading file…' });
  await yieldMain();

  if (check.kind === 'video') {
    onProgress?.({ pct: 28, stage: 'Uploading video…' });
    let result: { url: string; mime: string };
    try {
      result = await raceTimeout(
        uploadMentorMediaFile(key, file),
        VIDEO_TIMEOUT_MS,
        'Video upload timed out. Use a shorter MP4 under 28 MB.',
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error('Video upload failed.');
    }
    saveEaImage(key, result.url);
    onProgress?.({ pct: 100, stage: 'Complete' });
    return { url: result.url, kind: 'video' };
  }

  onProgress?.({ pct: 20, stage: 'Optimizing image…' });
  const isGif = file.type === 'image/gif';
  if (isGif && file.size > 6 * 1024 * 1024) {
    throw new Error('GIF too large — keep it under 6 MB.');
  }

  const dataUrl = isGif
    ? await raceTimeout(
        fileToDataUrl(file),
        STEP_TIMEOUT_MS,
        'Could not read GIF — try a smaller file.',
      )
    : await compressForBackground(file);

  // Show-ready bytes stay local immediately (same as profile)
  saveEaImage(key, dataUrl);
  saveEaImage(`img:${key}`, dataUrl);
  onProgress?.({ pct: 55, stage: 'Saving…' });
  await yieldMain();

  onProgress?.({ pct: 70, stage: 'Syncing to cloud…' });

  // Prefer Firebase Storage binary (faster than dumping base64 into RTDB)
  if (isFirebaseConfigured() && !isGif) {
    const blob = dataUrlToBlob(dataUrl);
    if (blob) {
      const hosted = await softTimeout(
        firebaseUploadFile(`images/${key}.jpg`, blob, blob.type || 'image/jpeg'),
        18_000,
        null,
      );
      if (hosted) {
        saveEaImage(key, hosted);
        onProgress?.({ pct: 100, stage: 'Complete' });
        return { url: hosted, kind: 'image' };
      }
    }
  }

  // Soft timeout — identical policy to profile updateProfile (never throw on slow cloud)
  const published = await publishMentorMediaImage(key, dataUrl, 22_000);

  const url =
    published.startsWith('http') ||
    published.startsWith('/') ||
    published.startsWith('img:')
      ? published
      : `img:${key}`;

  // Keep displayable bytes + short/public ref
  if (url.startsWith('http') || url.startsWith('/')) {
    saveEaImage(key, url);
  } else {
    saveEaImage(key, dataUrl);
    saveEaImage(url, dataUrl);
  }

  onProgress?.({ pct: 100, stage: 'Complete' });
  return { url, kind: 'image' };
}
