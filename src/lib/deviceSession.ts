/** Single-device session lock — one email active on one device at a time. */

const DEVICE_KEY = 'ub-web/device-id-v1';
/** If the other device heartbeated within this window, treat it as still online. */
export const DEVICE_ACTIVE_MS = 15 * 60 * 1000;

export type DeviceLock = {
  id: string;
  label: string;
  claimedAt: string;
  lastSeenAt: string;
};

export class DeviceInUseError extends Error {
  readonly code = 'DEVICE_IN_USE' as const;
  readonly otherLabel: string;

  constructor(otherLabel: string) {
    super(
      `This email is already signed in on another device${
        otherLabel ? ` (${otherLabel})` : ''
      }. Sign out there first, or continue here to kick the other device.`,
    );
    this.name = 'DeviceInUseError';
    this.otherLabel = otherLabel;
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export function getDeviceLabel(): string {
  try {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'Android phone';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone / iPad';
    if (/macintosh|mac os/i.test(ua)) return 'Mac';
    if (/windows/i.test(ua)) return 'Windows PC';
    if (/linux/i.test(ua)) return 'Linux device';
    return 'Another device';
  } catch {
    return 'Another device';
  }
}

export function makeDeviceClaim(now = new Date()): DeviceLock {
  const iso = now.toISOString();
  return {
    id: getDeviceId(),
    label: getDeviceLabel(),
    claimedAt: iso,
    lastSeenAt: iso,
  };
}

export function touchDeviceClaim(prev?: DeviceLock | null): DeviceLock {
  const base = prev?.id === getDeviceId() ? prev : makeDeviceClaim();
  return {
    ...base,
    id: getDeviceId(),
    label: getDeviceLabel(),
    lastSeenAt: new Date().toISOString(),
  };
}

export function isDeviceRecentlyActive(device?: DeviceLock | null): boolean {
  if (!device?.id || !device.lastSeenAt) return false;
  const ts = Date.parse(device.lastSeenAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DEVICE_ACTIVE_MS;
}

/** True when remote session is held by a different device that still looks online. */
export function isDeviceConflict(remoteDevice?: DeviceLock | null): boolean {
  if (!remoteDevice?.id) return false;
  if (remoteDevice.id === getDeviceId()) return false;
  return isDeviceRecentlyActive(remoteDevice);
}

export function assertDeviceAvailable(remoteDevice?: DeviceLock | null, force = false) {
  if (force) return;
  if (isDeviceConflict(remoteDevice)) {
    throw new DeviceInUseError(remoteDevice?.label || 'another device');
  }
}
