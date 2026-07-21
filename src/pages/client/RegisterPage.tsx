import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { useAppLogo } from '../../lib/appLogo';
import {
  normalizeRegistrationEmail,
  registrationEmailError,
  splitNameFromEmail,
} from '../../lib/registrationEmail';

export function RegisterPage() {
  const navigate = useNavigate();
  const { registerLocal } = useApp();
  const { openPortal, submitClientRegistration } = useAdmin();
  const appLogo = useAppLogo();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const taps = useRef(0);
  const timer = useRef<number | null>(null);

  const onLogoTap = () => {
    taps.current += 1;
    if (timer.current) window.clearTimeout(timer.current);
    if (taps.current >= 3) {
      taps.current = 0;
      openPortal();
      navigate('/admin/login');
      return;
    }
    timer.current = window.setTimeout(() => {
      taps.current = 0;
    }, 900);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailErr = registrationEmailError(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    const normalizedEmail = normalizeRegistrationEmail(email);
    const fromEmail = splitNameFromEmail(normalizedEmail);
    const profile = {
      email: normalizedEmail,
      firstName: firstName.trim() || fromEmail.firstName,
      lastName: lastName.trim() || fromEmail.lastName,
    };
    // Registration is recorded in the Super Admin Subscriptions queue —
    // no email is sent (the queue is the single source of truth)
    submitClientRegistration(profile);
    const next = await registerLocal(profile);
    // Already licensed (same email / vault) → home, not payment again
    if (next.accessStatus === 'licensed' || next.bot.licenseKey?.trim()) {
      navigate('/app', { replace: true });
      return;
    }
    if (next.accessStatus === 'approved' || next.accessStatus === 'paid') {
      navigate('/activate', { replace: true });
      return;
    }
    navigate('/waiting', { replace: true });
  };

  return (
    <div className="page cyber-page" style={{ textAlign: 'center', paddingTop: 48 }}>
      <button
        type="button"
        onClick={onLogoTap}
        style={{
          background: 'transparent',
          marginBottom: 18,
          borderRadius: 22,
          padding: 0,
        }}
      >
        <img
          src={appLogo}
          alt="Lumo Edge"
          width={92}
          height={92}
          style={{
            borderRadius: 22,
            display: 'block',
            objectFit: 'cover',
          }}
        />
      </button>
      <h1 className="title-blue" style={{ fontSize: 28, margin: '0 0 8px' }}>
        Lumo Edge
      </h1>
      <p className="muted" style={{ marginBottom: 28, fontSize: 14 }}>
        Create your account to get started — worldwide, email only required
      </p>

      <form className="glow-card" onSubmit={onSubmit} style={{ textAlign: 'left' }}>
        <div className="field">
          <label>Email *</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            inputMode="email"
          />
        </div>
        <div className="field">
          <label>First Name (optional)</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Optional"
            autoComplete="given-name"
          />
        </div>
        <div className="field">
          <label>Last Name (optional)</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Optional"
            autoComplete="family-name"
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-blue" type="submit">
          Access Lumo Edge
        </button>
      </form>
    </div>
  );
}
