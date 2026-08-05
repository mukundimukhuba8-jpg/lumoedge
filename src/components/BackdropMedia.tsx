import { useEffect, useRef, useState } from 'react';
import { looksLikeVideoUrl, type MentorMediaKind } from '../lib/mentorMedia';

type Props = {
  src?: string;
  kind?: MentorMediaKind;
  className?: string;
  videoClassName?: string;
  imageClassName?: string;
  washClassName?: string;
};

/** Image or autoplaying muted loop video for app / layout backgrounds */
export function BackdropMedia({
  src,
  kind,
  className = 'ea-backdrop',
  videoClassName = 'ea-backdrop-video',
  imageClassName = 'ea-backdrop-img',
  washClassName = 'ea-backdrop-wash',
}: Props) {
  const media = src?.trim();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isVideo = Boolean(
    media && (kind === 'video' || (!kind && looksLikeVideoUrl(media))),
  );
  // Delay video mount on phones so first taps aren't crushed by decode
  const [videoReady, setVideoReady] = useState(!isVideo);

  useEffect(() => {
    if (!isVideo) {
      setVideoReady(true);
      return;
    }
    setVideoReady(false);
    const coarse =
      typeof window !== 'undefined' &&
      (window.matchMedia('(hover: none)').matches ||
        window.matchMedia('(max-width: 480px)').matches);
    const delay = coarse ? 900 : 200;
    const t = window.setTimeout(() => setVideoReady(true), delay);
    return () => window.clearTimeout(t);
  }, [media, isVideo]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isVideo || !videoReady) return;

    let gestureBound = false;
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.setAttribute('muted', '');

    const tryPlay = () => {
      if (document.hidden) return;
      if (!el.paused && !el.ended) return;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    const onVisibility = () => {
      if (document.hidden) el.pause();
      else tryPlay();
    };

    // One-shot user-gesture unlock for iOS — do NOT keep listening forever
    const onPointer = () => {
      tryPlay();
      if (gestureBound) {
        document.removeEventListener('pointerdown', onPointer);
        gestureBound = false;
      }
    };

    tryPlay();
    el.addEventListener('loadeddata', tryPlay, { once: true });
    el.addEventListener('canplay', tryPlay, { once: true });
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onPointer, { passive: true });
    gestureBound = true;

    // Single delayed retry — never a 1.2s interval (that froze phones on .com)
    const retry = window.setTimeout(tryPlay, 800);

    return () => {
      window.clearTimeout(retry);
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
      document.removeEventListener('visibilitychange', onVisibility);
      if (gestureBound) document.removeEventListener('pointerdown', onPointer);
    };
  }, [media, isVideo, videoReady]);

  if (!media) return null;

  return (
    <div className={className} aria-hidden data-backdrop-kind={isVideo ? 'video' : 'image'}>
      {isVideo && videoReady ? (
        <video
          key={media}
          ref={videoRef}
          className={videoClassName}
          src={media}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
        />
      ) : !isVideo ? (
        <div
          className={imageClassName}
          style={{ backgroundImage: `url(${media})` }}
        />
      ) : (
        <div className={imageClassName} />
      )}
      {washClassName ? <div className={washClassName} /> : null}
    </div>
  );
}
