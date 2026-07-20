import { useAppLogo } from '../lib/appLogo';

/** Animated boot screen — dancing app logo + Welcome to Lumo Edge */
export function WelcomeSplash() {
  const logo = useAppLogo();
  return (
    <div className="welcome-splash" role="status" aria-label="Welcome to Lumo Edge">
      <div className="welcome-glow" aria-hidden />
      <img className="welcome-bot" src={logo} alt="" width={116} height={116} />
      <div className="welcome-shadow" aria-hidden />
      <h1 className="welcome-title">
        {'Welcome to'.split('').map((ch, i) => (
          <span key={`a-${i}`} style={{ animationDelay: `${0.15 + i * 0.045}s` }}>
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        ))}
        <br />
        <strong>
          {'Lumo Edge'.split('').map((ch, i) => (
            <span key={`b-${i}`} style={{ animationDelay: `${0.7 + i * 0.055}s` }}>
              {ch === ' ' ? '\u00A0' : ch}
            </span>
          ))}
        </strong>
      </h1>
      <div className="welcome-dots" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
