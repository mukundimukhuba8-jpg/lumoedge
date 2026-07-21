/** Mentor Custom media — 2 profile + 3 background slots (image/video only). */

import { firebaseUploadDataUrl, firebaseUploadFile, firebaseSaveImage } from './firebaseDb';
import { isFirebaseConfigured } from './firebase';
import { saveEaImage } from './storage';

export type MentorMediaSlotId =
  | 'profile-1'
  | 'profile-2'
  | 'bg-1'
  | 'bg-2'
  | 'bg-3';

export type MentorMediaKind = 'image' | 'video';

export type MentorMediaItem = {
  slot: MentorMediaSlotId;
  kind: MentorMediaKind;
  url: string;
  updatedAt?: string;
};

export const PROFILE_SLOTS: { id: MentorMediaSlotId; label: string }[] = [
  { id: 'profile-1', label: 'Profile 1' },
  { id: 'profile-2', label: 'Profile 2' },
];

export const BACKGROUND_SLOTS: { id: MentorMediaSlotId; label: string }[] = [
  { id: 'bg-1', label: 'Background 1' },
  { id: 'bg-2', label: 'Background 2' },
  { id: 'bg-3', label: 'Background 3' },
];

export const ALL_MEDIA_SLOTS = [...PROFILE_SLOTS, ...BACKGROUND_SLOTS];

export const MEDIA_ACCEPT = 'image/*,video/*';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 28 * 1024 * 1024;

export function emptyCustomMedia(): MentorMediaItem[] {
  return [];
}

export function normalizeCustomMedia(raw: unknown): MentorMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(ALL_MEDIA_SLOTS.map((s) => s.id));
  const out: MentorMediaItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const slot = (item as MentorMediaItem).slot;
    const kind = (item as MentorMediaItem).kind;
    const url = String((item as MentorMediaItem).url || '').trim();
    if (!allowed.has(slot)) continue;
    if (kind !== 'image' && kind !== 'video') continue;
    if (!url) continue;
    out.push({
      slot,
      kind,
      url,
      updatedAt: (item as MentorMediaItem).updatedAt,
    });
  }
  // one entry per slot (last wins)
  const map = new Map<MentorMediaSlotId, MentorMediaItem>();
  for (const m of out) map.set(m.slot, m);
  return [...map.values()];
}

export function getMediaSlot(
  media: MentorMediaItem[] | undefined,
  slot: MentorMediaSlotId,
): MentorMediaItem | undefined {
  return (media || []).find((m) => m.slot === slot);
}

export function upsertMediaSlot(
  media: MentorMediaItem[] | undefined,
  item: MentorMediaItem,
): MentorMediaItem[] {
  const next = normalizeCustomMedia(media).filter((m) => m.slot !== item.slot);
  next.push({ ...item, updatedAt: item.updatedAt || new Date().toISOString() });
  return next;
}

export function removeMediaSlot(
  media: MentorMediaItem[] | undefined,
  slot: MentorMediaSlotId,
): MentorMediaItem[] {
  return normalizeCustomMedia(media).filter((m) => m.slot !== slot);
}

export function isAllowedMediaFile(file: File): { ok: true; kind: MentorMediaKind } | { ok: false; error: string } {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    return { ok: false, error: 'Only pictures and videos are allowed.' };
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image must be under 8 MB.' };
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: 'Video must be under 28 MB. Prefer MP4 (H.264).' };
  }
  return { ok: true, kind: isVideo ? 'video' : 'image' };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Upload data URL — local save first, then cloud with short timeouts. */
export async function uploadMentorMedia(
  key: string,
  dataUrl: string,
): Promise<{ url: string }> {
  saveEaImage(key, dataUrl);

  const tryCloud = async (): Promise<string | null> => {
    if (isFirebaseConfigured()) {
      try {
        const hosted = await Promise.race([
          firebaseUploadDataUrl(`media/${key}`, dataUrl),
          new Promise<string | null>((resolve) =>
            window.setTimeout(() => resolve(null), 10_000),
          ),
        ]);
        if (hosted) return hosted;
        const saved = await Promise.race([
          firebaseSaveImage(key, dataUrl),
          new Promise<string | null>((resolve) =>
            window.setTimeout(() => resolve(null), 8_000),
          ),
        ]);
        if (saved) return dataUrl;
      } catch {
        // fall through
      }
    }

    try {
      const res = await Promise.race([
        fetch(`/api/images/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        }),
        new Promise<Response>((_, reject) =>
          window.setTimeout(() => reject(new Error('timeout')), 10_000),
        ),
      ]);
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { url?: string };
        return data.url || `/api/images/${encodeURIComponent(key)}`;
      }
    } catch {
      // try media endpoint next
    }

    try {
      const res = await Promise.race([
        fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, dataUrl }),
        }),
        new Promise<Response>((_, reject) =>
          window.setTimeout(() => reject(new Error('timeout')), 10_000),
        ),
      ]);
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { url?: string };
        return data.url || `/api/images/${encodeURIComponent(key)}`;
      }
    } catch {
      // ignore
    }

    return null;
  };

  const cloud = await tryCloud();
  if (cloud) {
    saveEaImage(key, cloud.startsWith('data:') ? dataUrl : cloud);
    return { url: cloud };
  }

  return { url: dataUrl };
}

/** Upload original File (videos prefer Firebase / binary; images fall back to data URL). */
export async function uploadMentorMediaFile(
  key: string,
  file: File,
): Promise<{ url: string; mime: string }> {
  const mime = file.type || 'application/octet-stream';

  if (isFirebaseConfigured()) {
    const url = await firebaseUploadFile(`media/${key}`, file, mime);
    if (url) return { url, mime };
  }

  // Try local binary media endpoint first (Range streaming for video)
  try {
    const res = await fetch('/api/media/binary', {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'X-Media-Key': key,
      },
      body: file,
    });
    if (res.ok) {
      const data = (await res.json()) as { url: string; mime?: string };
      if (data.url) return { url: data.url, mime: data.mime || mime };
    }
  } catch {
    // fall through to data-URL path
  }

  if (file.size > 2_500_000) {
    throw new Error(
      'File too large for cloud upload (max ~2.5 MB). Use a shorter MP4 or compress the image.',
    );
  }
  const dataUrl = await fileToDataUrl(file);
  const { url } = await uploadMentorMedia(key, dataUrl);
  return { url, mime };
}

export async function deleteMentorMedia(key: string): Promise<void> {
  try {
    await fetch(`/api/media/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
    // offline / static host
  }
  try {
    await fetch(`/api/images/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
    });
  } catch {
    // ignore
  }
}

export function mediaKey(adminId: string, slot: MentorMediaSlotId): string {
  return `${adminId}-${slot}`;
}

/** Stock / placeholder art — not a mentor-uploaded profile photo. */
export function isPlaceholderMentorImage(url?: string): boolean {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return true;
  return (
    u.includes('lumo-logo.png') ||
    u.includes('bull-hero.jpg') ||
    u.includes('bull-avatar.jpg')
  );
}

export function isMentorProfileImage(url?: string): boolean {
  return !isPlaceholderMentorImage(url);
}

/** True profile photo for client avatars — never stock placeholder art. */
export function resolveProfileImage(
  eaImage: string | undefined,
  customMedia?: MentorMediaItem[] | null,
): string {
  const isFakeLogo = isPlaceholderMentorImage;

  const resolveRef = (raw: string): string => {
    const fromEa = String(raw || '').trim();
    if (!fromEa || isFakeLogo(fromEa)) return '';
    if (fromEa.startsWith('img:')) {
      try {
        const key = fromEa.replace(/^img:/, '');
        const all = JSON.parse(
          localStorage.getItem('ub-web/ea-images-v1') || '{}',
        ) as Record<string, string>;
        const resolved = all[fromEa] || all[key] || all[`img:${key}`] || fromEa;
        return resolved && !isFakeLogo(resolved) ? resolved : '';
      } catch {
        return fromEa;
      }
    }
    return fromEa;
  };

  const fromEa = resolveRef(String(eaImage || ''));
  if (fromEa && !isFakeLogo(fromEa) && !fromEa.startsWith('img:')) return fromEa;

  const media = normalizeCustomMedia(customMedia);
  for (const slot of ['profile-1', 'profile-2'] as const) {
    const hit = media.find((m) => m.slot === slot && m.kind === 'image' && m.url);
    if (hit?.url) {
      const resolved = resolveRef(hit.url);
      if (resolved && !isFakeLogo(resolved) && !resolved.startsWith('img:')) {
        return resolved;
      }
    }
  }
  return fromEa.startsWith('img:') ? '' : fromEa;
}

export function resolveCustomBackdrop(
  customBg: string,
  eaImage: string,
  media: MentorMediaItem[] | undefined,
): { src: string; kind: MentorMediaKind } | null {
  if (!customBg || customBg === 'default') return null;
  if (customBg === 'interface-1') {
    return eaImage
      ? {
          src: eaImage,
          kind: looksLikeVideoUrl(eaImage) ? 'video' : 'image',
        }
      : null;
  }
  const hit = getMediaSlot(media, customBg as MentorMediaSlotId);
  if (hit?.url) {
    const kind =
      hit.kind === 'video' || looksLikeVideoUrl(hit.url) ? 'video' : 'image';
    return { src: hit.url, kind };
  }
  return null;
}

export function looksLikeVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.startsWith('data:video/') ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)
  );
}
