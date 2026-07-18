import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { normalizeLicenseKey } from '../../lib/storage';

export function ActivateLicensePage() {
  const navigate = useNavigate();
  const { user, accessStatus, activateWithLicense } = useApp();
  const { claimLicense } = useAdmin();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
    else if (accessStatus === 'pending') navigate('/waiting', { replace: true });
    else if (accessStatus === 'approved') navigate('/subscribe', { replace: true });
    else if (accessStatus === 'licensed') navigate('/app', { replace: true });
    else if (accessStatus !== 'paid') navigate('/', { replace: true });
  }, [user, accessStatus, navigate]);

  const onActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const result = claimLicense(key, user.email);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const lic = result.license;
    activateWithLicense(lic.key, {
      name: lic.eaName,
      displayName: lic.eaName,
      mainText: lic.mainText,
      imageUrl: lic.eaImage,
      symbols: lic.symbols,
    });
    navigate('/app');
  };

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 56 }}>
      <div
        style={{
          width: 72,
          height: 72,
          margin: '0 auto 18px',
          borderRadius: 18,
          border: '1.5px solid rgba(59,130,246,0.8)',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 0 22px rgba(59,130,246,0.7)',
          background: '#0e1220',
        }}
      >
        <KeyRound color="#3b82f6" />
      </div>
      <h1 className="title-blue" style={{ fontSize: 26, marginBottom: 10 }}>
        Activate your license
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Paste the full key from your admin (starts with <strong>LUMO.</strong>). Issued for{' '}
        {user?.email}.
      </p>

      <form className="glow-card" onSubmit={onActivate} style={{ textAlign: 'left' }}>
        <div className="field">
          <label>License Key *</label>
          <textarea
            value={key}
            rows={4}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v.toUpperCase().startsWith('LUMO.')) {
                setKey(`LUMO.${v.slice(5)}`);
              } else {
                setKey(normalizeLicenseKey(v));
              }
            }}
            placeholder="LUMO.eyJ2IjoxLC..."
            required
            style={{ fontSize: 12, wordBreak: 'break-all' }}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-blue" type="submit">
          Activate & Open App
        </button>
      </form>
    </div>
  );
}
