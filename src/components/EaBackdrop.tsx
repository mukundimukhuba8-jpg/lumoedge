import { looksLikeVideoUrl, type MentorMediaKind } from '../lib/mentorMedia';

/** Soft EA profile image / video behind the licensed client experience */
export function EaBackdrop({
  src,
  kind,
}: {
  src?: string;
  kind?: MentorMediaKind;
}) {
  const media = src?.trim();
  if (!media) return null;
  const isVideo = kind === 'video' || (!kind && looksLikeVideoUrl(media));

  return (
    <div className="ea-backdrop" aria-hidden>
      {isVideo ? (
        <video
          className="ea-backdrop-video"
          src={media}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <div
          className="ea-backdrop-img"
          style={{ backgroundImage: `url(${media})` }}
        />
      )}
      <div className="ea-backdrop-wash" />
    </div>
  );
}
