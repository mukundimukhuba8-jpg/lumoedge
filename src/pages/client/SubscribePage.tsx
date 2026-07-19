import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

/** Payment details live on /waiting. After approval, go straight to license key. */
export function SubscribePage() {
  const { user, accessStatus, setAccessStatus } = useApp();
  const { getClientByEmail } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
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
    if (accessStatus === 'licensed') {
      navigate('/app', { replace: true });
      return;
    }
    navigate('/activate', { replace: true });
  }, [user, accessStatus, getClientByEmail, navigate, setAccessStatus]);

  return null;
}
