import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

/** Payment details live on /waiting. After approval, go straight to license key. */
export function SubscribePage() {
  const { user, accessStatus, setAccessStatus, bot } = useApp();
  const { getClientByEmail } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    if (accessStatus === 'licensed' || bot.licenseKey?.trim()) {
      navigate('/app', { replace: true });
      return;
    }
    const client = getClientByEmail(user.email);
    if (!client || client.status === 'pending') {
      navigate('/waiting', { replace: true });
      return;
    }
    if (client.status === 'approved' && accessStatus === 'pending') {
      setAccessStatus('approved');
    }
    navigate('/activate', { replace: true });
  }, [user, accessStatus, bot.licenseKey, getClientByEmail, navigate, setAccessStatus]);

  return null;
}
