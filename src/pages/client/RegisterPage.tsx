import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifySuperAdminEmail, useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

export function RegisterPage() {
  const navigate = useNavigate();
  const { registerLocal } = useApp();
  const { openPortal, submitClientRegistration } = useAdmin();
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
    if (!email.includes('@') || !firstName.trim() || !lastName.trim()) {
      setError('Enter email, first name and last name.');
      return;
    }
    const profile = {
      email: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };
    submitClientRegistration(profile);
    await registerLocal(profile);
    // Opens device mail app to notify Super Admin
    notifySuperAdminEmail(profile);
    navigate('/waiting');
  };

  return (
    <div className="page" style={{ textAlign: 'center' }}>
      <button
        type="button"
        onClick={onLogoTap}
        style={{
          background: 'transparent',
          marginBottom: 14,
          borderRadius: 22,
          boxShadow: '0 0 28px rgba(59,130,246,0.75)',
          padding: 0,
        }}
      >
        <img
          src="/bull-avatar.jpg"
          alt="Lumo Edge"
          width={88}
          height={88}
          style={{ borderRadius: 22, display: 'block' }}
        />
      </button>
      <h1 className="title-blue" style={{ fontSize: 34, margin: '0 0 8px' }}>
        Lumo Edge
      </h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Create your account to get started
      </p>

      <form className="glow-card" onSubmit={onSubmit} style={{ textAlign: 'left' }}>
        <div className="field">
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />
        </div>
        <div className="field">
          <label>First Name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Enter your first name"
          />
        </div>
        <div className="field">
          <label>Last Name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Enter your last name"
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
