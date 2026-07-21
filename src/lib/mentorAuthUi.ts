/** User-facing mentor admin portal messages — never expose backend details. */

export const MENTOR_AUTH_MSG = {
  pending: 'Your account is awaiting approval.',
  invalidCredentials: 'Incorrect email or password.',
  unavailable: 'Service is temporarily unavailable.',
  unableToSignIn: 'Unable to sign in. Please try again.',
  registerRequired: 'Fill all required fields.',
  emailReserved: 'This email is reserved.',
  emailInUse: 'This email is already registered.',
  registerUnavailable: 'Service is temporarily unavailable.',
  registerSuccess:
    'Registration saved. Super Admin will approve your account before you can sign in.',
  approveFailed: 'Unable to approve mentor. Please try again.',
  approveSuccess: 'Mentor approved successfully.',
  approveAllSuccess: 'All pending mentors approved successfully.',
  refreshFailed: 'Unable to refresh list. Please try again.',
  refreshSuccess: 'List restored from cloud.',
} as const;

export const MENTOR_LOGIN_UI_TIMEOUT_MS = 18_000;
