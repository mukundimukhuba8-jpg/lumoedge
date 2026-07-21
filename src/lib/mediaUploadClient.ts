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

export const MAX_BACKGROUNDS = 3;

const STEP_TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 35_000;

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
      STEP_TIMEOUT_MS,
      'Firebase upload timed out',
    );
  } catch {
    return null;
  }
}

/** Background upload — local save first, then cloud with short timeouts (never hangs). */
export async function uploadBackgroundMedia(
  adminId: string,
  slot: MentorMediaSlotId,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; kind: MentorMediaKind }> {
  const check = isAllowedMediaFile(file);
  if (!check.ok) throw new Error(check.error);

  const key = mediaKey(adminId, slot);
  const run = async (): Promise<{ url: string; kind: MentorMediaKind }> => {
    onProgress?.({ pct: 10, stage: 'Reading file…' });

    if (check.kind === 'video') {
      onProgress?.({ pct: 30, stage: 'Uploading video…' });
      const result = await raceTimeout(
        uploadMentorMediaFile(key, file),
        TOTAL_TIMEOUT_MS,
        'Video upload timed out. Use a shorter MP4 under 28 MB.',
      );
      saveEaImage(key, result.url);
      onProgress?.({ pct: 92, stage: 'Finalizing…' });
      return { url: result.url, kind: 'video' };
    }

    onProgress?.({ pct: 22, stage: 'Optimizing image…' });
    const isGif = file.type === 'image/gif';
    let dataUrl: string;
    if (isGif) {
      dataUrl = await raceTimeout(
        fileToDataUrl(file),
        STEP_TIMEOUT_MS,
        'Could not read GIF — try a smaller file.',
      );
    } else {
      const { compressImageFile } = await import('./storage');
      dataUrl = await raceTimeout(
        compressImageFile(file, 1280, 0.78),
        STEP_TIMEOUT_MS,
        'Image processing timed out — try a smaller JPG/PNG.',
      );
    }

    onProgress?.({ pct: 42, stage: 'Saving locally…' });
    saveEaImage(key, dataUrl);

    onProgress?.({ pct: 58, stage: 'Uploading to cloud…' });
    let apiUrl: string | null = null;
    try {
      apiUrl = await raceTimeout(
        tryApiImageUpload(key, dataUrl),
        STEP_TIMEOUT_MS,
        'Cloud upload slow',
      );
    } catch {
      apiUrl = null;
    }
    if (apiUrl) {
      saveEaImage(key, apiUrl.startsWith('data:') ? dataUrl : apiUrl);
      onProgress?.({ pct: 92, stage: 'Finalizing…' });
      return { url: apiUrl, kind: 'image' };
    }

    onProgress?.({ pct: 72, stage: 'Trying Firebase…' });
    const hosted = await tryFirebaseUpload(key, dataUrl);
    if (hosted) {
      saveEaImage(key, hosted);
      onProgress?.({ pct: 92, stage: 'Finalizing…' });
      return { url: hosted, kind: 'image' };
    }

    // Always succeed locally — clients resolve via saveEaImage / /api/images
    onProgress?.({ pct: 88, stage: 'Saved on this device…' });
    return { url: imagePublicUrl(key), kind: 'image' };
  };

  return raceTimeout(
    run(),
    TOTAL_TIMEOUT_MS,
    'Upload timed out — saved locally. Tap Replace to retry cloud sync.',
  );
}
