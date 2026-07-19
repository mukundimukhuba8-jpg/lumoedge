import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isVideo) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    tryPlay();
    el.addEventListener('loadeddata', tryPlay);
    el.addEventListener('canplay', tryPlay);
    return () => {
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
    };
  }, [media, isVideo]);

  if (!media) return null;

  return (
    <div className={className} aria-hidden>
      {isVideo ? (
        <video
          key={media}
          ref={videoRef}
          className={videoClassName}
          src={media}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      ) : (
        <div
          className={imageClassName}
          style={{ backgroundImage: `url(${media})` }}
        />
      )}
      {washClassName ? <div className={washClassName} /> : null}
    </div>
  );
}
