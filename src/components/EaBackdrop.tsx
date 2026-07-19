import type { MentorMediaKind } from '../lib/mentorMedia';
import { BackdropMedia } from './BackdropMedia';

/** Soft EA profile image / video behind the licensed client experience */
export function EaBackdrop({
  src,
  kind,
}: {
  src?: string;
  kind?: MentorMediaKind;
}) {
  return <BackdropMedia src={src} kind={kind} />;
}
