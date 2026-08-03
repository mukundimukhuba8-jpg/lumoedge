/** Soft animated ambient field — supports UI, never competes with it. */
export function AmbientEnvironment() {
  return (
    <div className="ambient-env" aria-hidden>
      <div className="ambient-env-gradient" />
      <div className="ambient-env-glow ambient-env-glow-a" />
      <div className="ambient-env-glow ambient-env-glow-b" />
      <div className="ambient-env-glow ambient-env-glow-c" />
      <div className="ambient-env-particles">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} style={{ ['--p' as string]: i }} />
        ))}
      </div>
      <div className="ambient-env-veil" />
    </div>
  );
}
