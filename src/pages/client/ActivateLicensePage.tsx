import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { isClaimableKey } from '../../lib/licenseClaim';
import { resolveProfileImage } from '../../lib/mentorMedia';
import { normalizeLicenseKey } from '../../lib/storage';

export function ActivateLicensePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPayment = Boolean(
    (location.state as { fromPayment?: boolean } | null)?.fromPayment,
  );
  const { user, accessStatus, activateWithLicense, bot } = useApp();
  const { claimLicense } = useAdmin();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
    else if (accessStatus === 'licensed' || bot.licenseKey?.trim()) {
      navigate('/app', { replace: true });
    }     else if (accessStatus === 'pending' && !fromPayment) {
      navigate('/waiting', { replace: true });
    } else if (
      accessStatus !== 'approved' &&
      accessStatus !== 'paid' &&
      !fromPayment
    ) {
      navigate('/', { replace: true });
    }
  }, [user, accessStatus, bot.licenseKey, navigate, fromPayment]);

  const onActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    const formatErr = isClaimableKey(key);
    if (formatErr) {
      setError(formatErr);
      return;
    }
    setBusy(true);
    setError('');
    setSlow(false);
    const slowTimer = window.setTimeout(() => setSlow(true), 8000);
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
        imageUrl:
          resolveProfileImage(lic.eaImage, lic.customMedia) || lic.eaImage || '',
        symbols: lic.symbols,
        customMedia: lic.customMedia,
      });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Activation failed. Check your connection and try again.',
      );
    } finally {
      window.clearTimeout(slowTimer);
      setSlow(false);
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
        {error ? (
          <div className="license-status-banner license-status-error" role="alert">
            <strong>Activation failed</strong>
            <p>{error}</p>
          </div>
        ) : null}
        {busy && slow && !error ? (
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Still connecting — slow network detected. This should finish within a few seconds.
          </p>
        ) : null}
        <button className="btn btn-blue" type="submit" disabled={busy || !key.trim()}>
          {busy ? (
            <>
              <Loader2 size={16} className="spin" style={{ marginRight: 8, verticalAlign: -3 }} />
              Activating…
            </>
          ) : (
            'Activate & Open App'
          )}
        </button>
      </form>
    </div>
  );
}
