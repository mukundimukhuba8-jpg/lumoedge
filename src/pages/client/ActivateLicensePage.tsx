import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { normalizeLicenseKey } from '../../lib/storage';

export function ActivateLicensePage() {
  const navigate = useNavigate();
  const { user, accessStatus, activateWithLicense, bot } = useApp();
  const { claimLicense } = useAdmin();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
    else if (accessStatus === 'licensed' || bot.licenseKey?.trim()) {
      navigate('/app', { replace: true });
    } else if (accessStatus === 'pending') navigate('/waiting', { replace: true });
    else if (accessStatus !== 'approved' && accessStatus !== 'paid') {
      navigate('/', { replace: true });
    }
  }, [user, accessStatus, bot.licenseKey, navigate]);

  const onActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await claimLicense(key, user.email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const lic = result.license;
      activateWithLicense(lic.key, {
        name: lic.eaName,
        displayName: lic.eaName,
        mainText: lic.mainText,
        imageUrl: lic.eaImage || '',
        symbols: lic.symbols,
        customMedia: lic.customMedia,
      });
      navigate('/app');
    } finally {
      setBusy(false);
    }
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
      <h1 className="title-blue" style={{ fontSize: 18, marginBottom: 8 }}>
        Activate your license
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Your account is approved. Enter your license key from admin to open the
        app. Issued for {user?.email}.
      </p>

      <form className="glow-card" onSubmit={onActivate} style={{ textAlign: 'left' }}>
        <div className="field">
          <label>License Key *</label>
          <input
            value={key}
            onChange={(e) => setKey(normalizeLicenseKey(e.target.value))}
            placeholder="LUMO-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            required
            style={{ letterSpacing: 1, fontWeight: 700 }}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-blue" type="submit" disabled={busy}>
          {busy ? 'Checking key…' : 'Activate & Open App'}
        </button>
      </form>
    </div>
  );
}
