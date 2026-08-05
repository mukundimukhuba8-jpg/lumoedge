import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import {
  BACKGROUND_SLOTS,
  MEDIA_ACCEPT,
  normalizeCustomMedia,
  removeMediaSlot,
  upsertMediaSlot,
  type MentorMediaItem,
  type MentorMediaSlotId,
} from '../lib/mentorMedia';
import {
  MAX_BACKGROUNDS,
  uploadBackgroundMedia,
  type UploadProgress,
} from '../lib/mediaUploadClient';
import { resolveStoredMediaUrl } from '../lib/storage';

type Props = {
  adminId: string;
  customMedia: MentorMediaItem[];
  onSync: (next: MentorMediaItem[]) => Promise<void>;
  onMediaChange?: (next: MentorMediaItem[]) => void;
};

function resolvePreviewUrl(url: string): string {
  const resolved = resolveStoredMediaUrl(url) || String(url || '').trim();
  if (resolved.startsWith('img:')) {
    const key = resolved.replace(/^img:/, '');
    return `/api/images/${encodeURIComponent(key)}`;
  }
  return resolved;
}

export function BackgroundManager({ adminId, customMedia, onSync, onMediaChange }: Props) {
  const [localMedia, setLocalMedia] = useState<MentorMediaItem[]>(() =>
    normalizeCustomMedia(customMedia),
  );
  const [activeSlot, setActiveSlot] = useState<MentorMediaSlotId | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const snapshotRef = useRef<MentorMediaItem[]>(normalizeCustomMedia(customMedia));

  useEffect(() => {
    const incoming = normalizeCustomMedia(customMedia);
    setLocalMedia((prev) => {
      const prevFilled = prev.filter((m) => m.url && !m.url.startsWith('blob:')).length;
      const incomingFilled = incoming.filter((m) => m.url).length;
      // Don't wipe a fresher local upload with a thinner remote snapshot
      if (prevFilled > incomingFilled) return prev;
      snapshotRef.current = incoming;
      return incoming;
    });
  }, [customMedia]);

  const bgItems = useMemo(
    () =>
      BACKGROUND_SLOTS.map((slot) => ({
        ...slot,
        item: localMedia.find((m) => m.slot === slot.id),
      })),
    [localMedia],
  );

  const filledCount = bgItems.filter((s) => s.item?.url).length;
  const atMax = filledCount >= MAX_BACKGROUNDS;

  const onProgress = (p: UploadProgress) => setProgress(p);

  const onPick = async (slot: MentorMediaSlotId, file: File | null) => {
    setError('');
    setMessage('');
    setProgress(null);
    if (!file) return;
    if (!adminId) {
      setError('Sign in to the portal before uploading backgrounds.');
      return;
    }

    const before = normalizeCustomMedia(localMedia);
    snapshotRef.current = before;

    const replacing = Boolean(before.find((m) => m.slot === slot && m.url));
    if (!replacing && atMax) {
      setError('Maximum of 3 backgrounds allowed.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const previewKind = file.type.startsWith('video/') ? 'video' : 'image';
    const withPreview = upsertMediaSlot(before, {
      slot,
      kind: previewKind,
      url: previewUrl,
      updatedAt: new Date().toISOString(),
    });
    setLocalMedia(withPreview);
    onMediaChange?.(withPreview);

    try {
      setActiveSlot(slot);
      setProgress({ pct: 5, stage: 'Starting…' });

      const { url, kind } = await uploadBackgroundMedia(
        adminId,
        slot,
        file,
        onProgress,
      );
      const nextMedia = upsertMediaSlot(before, {
        slot,
        kind,
        url,
        updatedAt: new Date().toISOString(),
      });

      setLocalMedia(nextMedia);
      onMediaChange?.(nextMedia);
      setProgress({ pct: 96, stage: 'Syncing to clients…' });

      try {
        await onSync(nextMedia);
      } catch {
        // Cloud media already saved — profile sync can retry on next save
      }

      setProgress({ pct: 100, stage: 'Complete' });
      const label = BACKGROUND_SLOTS.find((s) => s.id === slot)?.label || slot;
      setMessage(
        url.startsWith('http') || url.startsWith('/')
          ? `${label} uploaded — synced to all clients.`
          : `${label} saved — syncing to clients in the background.`,
      );
    } catch (err) {
      setLocalMedia(before);
      onMediaChange?.(before);
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      URL.revokeObjectURL(previewUrl);
      setActiveSlot(null);
      setProgress(null);
      const input = inputRefs.current[slot];
      if (input) input.value = '';
    }
  };

  const onRemove = async (slot: MentorMediaSlotId) => {
    setError('');
    setMessage('');
    const before = normalizeCustomMedia(localMedia);
    const nextMedia = removeMediaSlot(localMedia, slot);
    setLocalMedia(nextMedia);
    onMediaChange?.(nextMedia);
    try {
      await onSync(nextMedia);
      setMessage('Background removed.');
    } catch {
      setLocalMedia(before);
      onMediaChange?.(before);
      setError('Could not sync removal — try again.');
    }
  };

  return (
    <div className="glow-card cyber-card bg-manager">
      <div className="bg-manager-head">
        <ImagePlus size={18} color="var(--electric)" />
        <div>
          <h3 style={{ margin: 0 }}>Background Manager</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {filledCount}/{MAX_BACKGROUNDS} backgrounds · same cloud save as profile picture
          </p>
        </div>
      </div>

      {atMax ? (
        <div className="bg-manager-limit" role="status">
          Maximum of 3 backgrounds allowed. Replace an existing slot to upload a new one.
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {message ? (
        <p className="bg-manager-success">
          <Check size={14} /> {message}
        </p>
      ) : null}

      {progress && activeSlot ? (
        <div className="bg-manager-progress-wrap">
          <div className="bg-manager-progress-meta">
            <Loader2 size={14} className="spin" />
            <span>{progress.stage}</span>
            <strong>{progress.pct}%</strong>
          </div>
          <div className="bg-manager-progress">
            <span style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      ) : null}

      <div className="media-slot-grid">
        {bgItems.map(({ id, label, item }) => {
          const uploading = activeSlot === id;
          const preview = item?.url ? resolvePreviewUrl(item.url) : '';
          const canUpload = Boolean(item?.url) || !atMax;
          return (
            <div key={id} className={`media-slot-card${uploading ? ' uploading' : ''}`}>
              <div className="media-slot-preview">
                {item?.kind === 'video' && preview ? (
                  <video src={preview} muted playsInline loop autoPlay />
                ) : preview ? (
                  <img src={preview} alt="" />
                ) : (
                  <span className="muted">{label}</span>
                )}
              </div>
              <div className="media-slot-meta">
                <strong>{label}</strong>
                <label
                  className={`media-slot-upload${!canUpload ? ' disabled' : ''}`}
                  title={!canUpload ? 'Maximum of 3 backgrounds allowed' : undefined}
                >
                  {uploading ? 'Uploading…' : item ? 'Replace' : 'Upload'}
                  <input
                    ref={(el) => {
                      inputRefs.current[id] = el;
                    }}
                    type="file"
                    accept={MEDIA_ACCEPT}
                    hidden
                    disabled={uploading || !canUpload}
                    onChange={(e) => void onPick(id, e.target.files?.[0] ?? null)}
                  />
                </label>
                {item ? (
                  <button
                    type="button"
                    className="btn btn-ghost bg-manager-remove"
                    onClick={() => void onRemove(id)}
                    disabled={uploading}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
