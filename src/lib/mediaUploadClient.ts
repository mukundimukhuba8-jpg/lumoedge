import {
  fileToDataUrl,
  isAllowedMediaFile,
  mediaKey,
  uploadMentorMediaFile,
  type MentorMediaKind,
  type MentorMediaSlotId,
} from './mentorMedia';
import { compressImageFile, publishEaImage, saveEaImage } from './storage';

export type UploadProgress = { pct: number; stage: string };

export type BackgroundUploadResult = {
  url: string;
  kind: MentorMediaKind;
};

export const MAX_BACKGROUNDS = 3;

const STEP_TIMEOUT_MS = 20_000;
const VIDEO_TIMEOUT_MS = 90_000;
/** Keep under saveEaImage local cache limit so previews survive on phones */
const TARGET_DATA_URL_CHARS = 400_000;

function timeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, timeoutPromise<T>(ms, message)]);
}

function yieldMain(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

/**
 * Compress like profile upload (aggressive) so phones don't freeze and
 * Firebase /api writes don't silently drop the file.
 */
async function compressForBackground(file: File): Promise<string> {
  let maxSize = 960;
  let quality = 0.72;

  for (let attempt = 0; attempt < 5; attempt++) {
    await yieldMain();
    const dataUrl = await raceTimeout(
      compressImageFile(file, maxSize, quality),
      STEP_TIMEOUT_MS,
      'Image processing timed out — try a smaller JPG/PNG.',
    );
    if (dataUrl.length <= TARGET_DATA_URL_CHARS) return dataUrl;
    maxSize = Math.round(maxSize * 0.75);
    quality = Math.max(0.5, quality - 0.08);
  }

  await yieldMain();
  return raceTimeout(
    compressImageFile(file, 640, 0.55),
    STEP_TIMEOUT_MS,
    'Image processing timed out — try a smaller JPG/PNG.',
  );
}

/**
 * Background upload — same publish path as profile EA image
 * (compress → publishEaImage → hosted URL / img: ref).
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
  // Identical cloud path as profile EA image
  const published = await raceTimeout(
    publishEaImage(key, dataUrl),
    25_000,
    'Cloud sync timed out — try again on a stronger connection.',
  );

  const url =
    published.startsWith('http') || published.startsWith('/')
      ? published
      : published.startsWith('img:')
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
