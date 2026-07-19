/** Mentor Custom media — 2 profile + 3 background slots (image/video only). */

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

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

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
    return { ok: false, error: 'Image must be under 4 MB.' };
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: 'Video must be under 12 MB.' };
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

/** Upload data URL to server media store; returns a stable URL path. */
export async function uploadMentorMedia(
  key: string,
  dataUrl: string,
): Promise<{ url: string }> {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, dataUrl }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || 'Upload failed');
  }
  const data = (await res.json()) as { url: string };
  if (!data.url) throw new Error('Upload failed');
  return data;
}

export async function deleteMentorMedia(key: string): Promise<void> {
  try {
    await fetch(`/api/media/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {
    // offline / static host
  }
}

export function mediaKey(adminId: string, slot: MentorMediaSlotId): string {
  return `${adminId}-${slot}`;
}

export function resolveCustomBackdrop(
  customBg: string,
  eaImage: string,
  media: MentorMediaItem[] | undefined,
): { src: string; kind: MentorMediaKind } | null {
  if (!customBg || customBg === 'default') return null;
  if (customBg === 'interface-1') {
    return eaImage ? { src: eaImage, kind: 'image' } : null;
  }
  const hit = getMediaSlot(media, customBg as MentorMediaSlotId);
  if (hit?.url) return { src: hit.url, kind: hit.kind };
  return null;
}

export function looksLikeVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.startsWith('data:video/') ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)
  );
}
