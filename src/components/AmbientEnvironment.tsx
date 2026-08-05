import { useEffect, useState } from 'react';

/** Soft animated ambient field — supports UI, never competes with it. */
export function AmbientEnvironment() {
  const [particleCount, setParticleCount] = useState(0);

  useEffect(() => {
    // Small / touch phones: skip particles — GPU + hydrate was freezing taps
    const coarse =
      typeof window !== 'undefined' &&
      (window.matchMedia('(hover: none)').matches ||
        window.matchMedia('(max-width: 480px)').matches);
    setParticleCount(coarse ? 0 : 24);
  }, []);

  return (
    <div className="ambient-env" aria-hidden>
      <div className="ambient-env-gradient" />
      <div className="ambient-env-glow ambient-env-glow-a" />
      <div className="ambient-env-glow ambient-env-glow-b" />
      <div className="ambient-env-glow ambient-env-glow-c" />
      {particleCount > 0 ? (
        <div className="ambient-env-particles">
          {Array.from({ length: particleCount }).map((_, i) => (
            <span key={i} style={{ ['--p' as string]: i }} />
          ))}
        </div>
      ) : null}
      <div className="ambient-env-veil" />
    </div>
  );
}
