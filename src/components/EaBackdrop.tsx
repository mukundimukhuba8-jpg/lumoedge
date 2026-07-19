/** Soft EA profile image behind the whole licensed client experience */
export function EaBackdrop({ src }: { src?: string }) {
  const image = src?.trim();
  if (!image) return null;
  return (
    <div className="ea-backdrop" aria-hidden>
      <div
        className="ea-backdrop-img"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="ea-backdrop-wash" />
    </div>
  );
}
