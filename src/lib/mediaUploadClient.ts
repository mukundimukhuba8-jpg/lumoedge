import {
  fileToDataUrl,
  isAllowedMediaFile,
  mediaKey,
  uploadMentorMedia,
  uploadMentorMediaFile,
  type MentorMediaKind,
  type MentorMediaSlotId,
} from './mentorMedia';

export type UploadProgress = { pct: number; stage: string };

const UPLOAD_TIMEOUT_MS = 45_000;

function timeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, timeoutPromise<T>(ms, message)]);
}

/** Client-side background upload with progress + timeout (no API changes). */
export async function uploadBackgroundMedia(
  adminId: string,
  slot: MentorMediaSlotId,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; kind: MentorMediaKind }> {
  const check = isAllowedMediaFile(file);
  if (!check.ok) throw new Error(check.error);

  onProgress?.({ pct: 8, stage: 'Reading file…' });
  const key = mediaKey(adminId, slot);

  onProgress?.({ pct: 25, stage: 'Uploading…' });

  let url: string;
  if (check.kind === 'image') {
    const isGif = file.type === 'image/gif';
    let dataUrl: string;
    if (isGif) {
      dataUrl = await fileToDataUrl(file);
    } else {
      const { compressImageFile } = await import('./storage');
      dataUrl = await compressImageFile(file, 1920, 0.82);
    }
    onProgress?.({ pct: 55, stage: 'Uploading image…' });
    const result = await raceTimeout(
      uploadMentorMedia(key, dataUrl),
      UPLOAD_TIMEOUT_MS,
      'Image upload timed out. Try a smaller file.',
    );
    url = result.url;
  } else {
    onProgress?.({ pct: 40, stage: 'Uploading video…' });
    const result = await raceTimeout(
      uploadMentorMediaFile(key, file),
      UPLOAD_TIMEOUT_MS,
      'Video upload timed out. Use a shorter MP4 under 28 MB.',
    );
    url = result.url;
  }

  onProgress?.({ pct: 92, stage: 'Finalizing…' });
  return { url, kind: check.kind };
}

export const MAX_BACKGROUNDS = 3;
