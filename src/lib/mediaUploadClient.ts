import {
  fileToDataUrl,
  isAllowedMediaFile,
  mediaKey,
  uploadMentorMediaFile,
  type MentorMediaKind,
  type MentorMediaSlotId,
} from './mentorMedia';
import { imagePublicUrl, saveEaImage } from './storage';
import { firebaseUploadDataUrl } from './firebaseDb';
import { isFirebaseConfigured } from './firebase';

export type UploadProgress = { pct: number; stage: string };

export type BackgroundUploadResult = {
  url: string;
  kind: MentorMediaKind;
  /** True when saved on device but cloud sync is still running or failed */
  cloudPending?: boolean;
};

export const MAX_BACKGROUNDS = 3;

const STEP_TIMEOUT_MS = 25_000;
const CLOUD_STEP_TIMEOUT_MS = 30_000;
const VIDEO_TIMEOUT_MS = 90_000;
/** Keep under api MAX_DATA_URL_CHARS (8M) with JSON overhead */
const TARGET_DATA_URL_CHARS = 6_500_000;

function timeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, timeoutPromise<T>(ms, message)]);
}

async function tryApiImageUpload(key: string, dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imagePublicUrl(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      return body.url || imagePublicUrl(key);
    }
  } catch {
    // try alternate endpoint
  }

  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, dataUrl }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      return body.url || imagePublicUrl(key);
    }
  } catch {
    // ignore
  }

  return null;
}

async function tryFirebaseUpload(key: string, dataUrl: string): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    return await raceTimeout(
      firebaseUploadDataUrl(`media/${key}`, dataUrl),
      CLOUD_STEP_TIMEOUT_MS,
      'Firebase upload timed out',
    );
  } catch {
    return null;
  }
}

async function compressForBackground(file: File): Promise<string> {
  const { compressImageFile } = await import('./storage');
  let maxSize = 1280;
  let quality = 0.76;

  for (let attempt = 0; attempt < 6; attempt++) {
    const dataUrl = await raceTimeout(
      compressImageFile(file, maxSize, quality),
      STEP_TIMEOUT_MS,
      'Image processing timed out — try a smaller JPG/PNG.',
    );
    if (dataUrl.length <= TARGET_DATA_URL_CHARS) return dataUrl;
    maxSize = Math.round(maxSize * 0.72);
    quality = Math.max(0.48, quality - 0.06);
  }

  return raceTimeout(
    compressImageFile(file, 640, 0.52),
    STEP_TIMEOUT_MS,
    'Image processing timed out — try a smaller JPG/PNG.',
  );
}

/** Upload background bytes to cloud — returns displayable URL (data URL if cloud slow). */
async function syncBackgroundToCloud(key: string, dataUrl: string): Promise<string> {
  try {
    const apiUrl = await raceTimeout(
      tryApiImageUpload(key, dataUrl),
      CLOUD_STEP_TIMEOUT_MS,
      'Cloud upload slow',
    ).catch(() => null);
    if (apiUrl) {
      saveEaImage(key, dataUrl);
      return imagePublicUrl(key);
    }

    const hosted = await tryFirebaseUpload(key, dataUrl);
    if (hosted) {
      saveEaImage(key, dataUrl);
      return hosted.startsWith('data:') || hosted.startsWith('http') ? hosted : imagePublicUrl(key);
    }
  } catch {
    // local copy already saved
  }
  return dataUrl;
}

/** Background upload — local save first, cloud sync in background (never hangs). */
export async function uploadBackgroundMedia(
  adminId: string,
  slot: MentorMediaSlotId,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<BackgroundUploadResult> {
  const check = isAllowedMediaFile(file);
  if (!check.ok) throw new Error(check.error);

  const key = mediaKey(adminId, slot);
  onProgress?.({ pct: 10, stage: 'Reading file…' });

  if (check.kind === 'video') {
    onProgress?.({ pct: 30, stage: 'Uploading video…' });
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
    onProgress?.({ pct: 92, stage: 'Finalizing…' });
    return { url: result.url, kind: 'video' };
  }

  onProgress?.({ pct: 22, stage: 'Optimizing image…' });
  const isGif = file.type === 'image/gif';
  const dataUrl = isGif
    ? await raceTimeout(
        fileToDataUrl(file),
        STEP_TIMEOUT_MS,
        'Could not read GIF — try a smaller file.',
      )
    : await compressForBackground(file);

  onProgress?.({ pct: 48, stage: 'Saving locally…' });
  saveEaImage(key, dataUrl);

  onProgress?.({ pct: 62, stage: 'Uploading to cloud…' });
  const displayUrl = await syncBackgroundToCloud(key, dataUrl);

  onProgress?.({ pct: 92, stage: 'Finalizing…' });
  return {
    url: displayUrl.startsWith('data:') ? displayUrl : imagePublicUrl(key),
    kind: 'image',
    cloudPending: displayUrl.startsWith('data:'),
  };
}
