import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { MENTOR_AUTH_MSG, MENTOR_LOGIN_UI_TIMEOUT_MS } from '../../lib/mentorAuthUi';
import { useAppLogo } from '../../lib/appLogo';

export function AdminAuthPage() {
  const navigate = useNavigate();
  const { login, registerAdmin, admin } = useAdmin();
  const appLogo = useAppLogo();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitGuard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    mentorName: '',
    eaName: '',
    phone: '',
    mainText: '',
  });

  useEffect(() => {
    if (admin?.role === 'super' || admin?.role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [admin, navigate]);

  useEffect(
    () => () => {
      if (submitGuard.current) window.clearTimeout(submitGuard.current);
    },
    [],
  );

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const finishSubmit = () => {
    if (submitGuard.current) {
      window.clearTimeout(submitGuard.current);
      submitGuard.current = null;
    }
    setSubmitting(false);
  };

  const startSubmit = () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    if (submitGuard.current) window.clearTimeout(submitGuard.current);
    submitGuard.current = window.setTimeout(() => {
      console.warn('[mentor-auth] Login/register UI timeout — resetting spinner');
      setSubmitting(false);
      setError(MENTOR_AUTH_MSG.unavailable);
    }, MENTOR_LOGIN_UI_TIMEOUT_MS);
  };

  return (
    <div className="page cyber-page" style={{ textAlign: 'center' }}>
      <img
        src={appLogo}
        alt="Lumo Edge"
        width={72}
        height={72}
        style={{
          margin: '20px auto 14px',
          borderRadius: 18,
          display: 'block',
          objectFit: 'cover',
          boxShadow: '0 0 24px rgba(59,130,246,0.55)',
        }}
      />
      <h1 className="title-blue" style={{ fontSize: 30, margin: 0 }}>
        Admin Portal
      </h1>
      <p className="muted">
        {tab === 'register'
          ? 'Create a mentor account — Super Admin must approve before you can log in.'
          : 'Sign in after Super Admin has approved your mentor account.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #2a2a33', borderRadius: 14, overflow: 'hidden', margin: '18px 0 16px' }}>
        {(['login', 'register'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: 12,
              background: tab === t ? 'var(--electric)' : '#14141a',
              color: tab === t ? '#061018' : 'var(--muted)',
              fontWeight: 700,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <form
        className="glow-card"
        style={{ textAlign: 'left' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (submitting) return;
          startSubmit();
          if (tab === 'login') {
            void login(form.email, form.password)
              .then((err) => {
                if (err) setError(err);
                else navigate('/admin/dashboard');
              })
              .catch((err) => {
                console.error('[mentor-auth] Login failed', err);
                setError(MENTOR_AUTH_MSG.unableToSignIn);
              })
              .finally(finishSubmit);
          } else {
            void registerAdmin(form)
              .then((err) => {
                if (err) setError(err);
                else {
                  setSuccess(MENTOR_AUTH_MSG.registerSuccess);
                  setTab('login');
                }
              })
              .catch((err) => {
                console.error('[mentor-auth] Registration failed', err);
                setError(MENTOR_AUTH_MSG.registerUnavailable);
              })
              .finally(finishSubmit);
          }
        }}
      >
        {tab === 'register' ? (
          <>
            <p className="muted">Fields marked * are required</p>
            <div className="field"><label>Full Name *</label><input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Your full name" /></div>
            <div className="field"><label>Mentor Name</label><input value={form.mentorName} onChange={(e) => set('mentorName', e.target.value)} placeholder="e.g. John Smith" /></div>
            <div className="field"><label>EA Name</label><input value={form.eaName} onChange={(e) => set('eaName', e.target.value)} placeholder="e.g. Supreme Equinox" /></div>
            <div className="field"><label>Phone Number</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+27 60 000 0000" /></div>
            <div className="field"><label>Main Text (Top of Client App)</label><input value={form.mainText} onChange={(e) => set('mainText', e.target.value)} placeholder="e.g. LUMO EDGE" /></div>
            <hr style={{ borderColor: '#2a2a33' }} />
          </>
        ) : null}

        <div className="field">
          <label>Email *</label>
          <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Enter your email" autoComplete="email" />
        </div>
        <div className="field">
          <label>Password *</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="Enter your password"
              style={{ width: '100%', paddingRight: 44 }}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{ position: 'absolute', right: 12, top: 12, background: 'transparent', color: 'var(--muted)' }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button className="btn btn-blue" type="submit" disabled={submitting}>
          {submitting
            ? tab === 'login'
              ? 'Signing in…'
              : 'Saving registration…'
            : tab === 'login'
              ? 'Login'
              : 'Register as Admin'}
        </button>
      </form>
    </div>
  );
}
