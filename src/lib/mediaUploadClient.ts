import {
  fileToDataUrl,
  isAllowedMediaFile,
  mediaKey,
  uploadMentorMediaFile,
  type MentorMediaKind,
  type MentorMediaSlotId,
} from './mentorMedia';
import { publishMentorMediaImage, saveEaImage } from './storage';

export type UploadProgress = { pct: number; stage: string };

export type BackgroundUploadResult = {
  url: string;
  kind: MentorMediaKind;
};

export const MAX_BACKGROUNDS = 3;

const STEP_TIMEOUT_MS = 25_000;
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

/** Background upload — same publish path as profile EA image. */
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
    onProgress?.({ pct: 100, stage: 'Complete' });
    return { url: result.url, kind: 'video' };
  }

  onProgress?.({ pct: 22, stage: 'Optimizing image…' });
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

  onProgress?.({ pct: 48, stage: 'Saving…' });
  onProgress?.({ pct: 62, stage: 'Syncing to cloud…' });
  const publishedRef = await publishMentorMediaImage(key, dataUrl);

  onProgress?.({ pct: 100, stage: 'Complete' });
  return {
    url: publishedRef,
    kind: 'image',
  };
}
