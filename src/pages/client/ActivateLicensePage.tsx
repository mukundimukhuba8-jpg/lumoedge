import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

export function ActivateLicensePage() {
  const navigate = useNavigate();
  const { user, accessStatus, activateWithLicense } = useApp();
  const { claimLicense, eas, profile } = useAdmin();
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
    const ea = eas.find((item) => item.id === result.license.eaId);
    activateWithLicense(result.license.key, {
      name: ea?.name ?? result.license.eaName ?? profile.eaDisplayName,
      displayName: ea?.name ?? result.license.eaName ?? profile.eaDisplayName,
      mainText: profile.mainText,
      symbols: ea?.symbols,
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
        Enter the unique license key generated for you in the Super Admin portal.
      </p>

      <form className="glow-card" onSubmit={onActivate} style={{ textAlign: 'left' }}>
        <div className="field">
          <label>License Key *</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            required
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
