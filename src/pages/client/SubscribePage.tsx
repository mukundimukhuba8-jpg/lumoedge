import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { clientCanEnterLicense, clientRepaymentRequired } from '../../lib/clientQueue';
import { isPrepaidEmail } from '../../lib/prepaidClients';

/** Payment details live on /waiting. After approval, go straight to license key. */
export function SubscribePage() {
  const { user, accessStatus, setAccessStatus, bot, requiresRepayment } = useApp();
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
    const mustRepay = clientRepaymentRequired(client, requiresRepayment);
    if (!client || client.status === 'pending' || mustRepay) {
      navigate('/waiting', { replace: true });
      return;
    }
    if (
      clientCanEnterLicense(client, isPrepaidEmail(user.email), mustRepay) &&
      accessStatus === 'pending'
    ) {
      setAccessStatus('approved');
    }
    if (clientCanEnterLicense(client, isPrepaidEmail(user.email), mustRepay)) {
      navigate('/activate', { replace: true });
      return;
    }
    navigate('/waiting', { replace: true });
  }, [user, accessStatus, bot.licenseKey, getClientByEmail, navigate, setAccessStatus, requiresRepayment]);

  return null;
}
