/**
 * Custom app logo — uploaded once by Super Admin, used as-is everywhere
 * the Lumo logo shows. Stored in Firebase images under a fixed key.
 */

import { useEffect, useState } from 'react';
import { firebaseSaveImage, firebaseFetchImage } from './firebaseDb';
import { getEaImage, saveEaImage } from './storage';

export const APP_LOGO_KEY = 'app-logo';
export const DEFAULT_APP_LOGO = '/lumo-logo.png';

/** Read the uploaded file exactly as-is (no canvas, no recompression). */
export function fileToRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function saveAppLogo(dataUrl: string): Promise<void> {
  saveEaImage(APP_LOGO_KEY, dataUrl);
  await firebaseSaveImage(APP_LOGO_KEY, dataUrl);
}

export async function loadAppLogo(): Promise<string> {
  // Firebase is the source of truth so a new upload updates every device;
  // the local cache is only the instant first paint.
  const remote = await firebaseFetchImage(APP_LOGO_KEY);
  if (remote) {
    saveEaImage(APP_LOGO_KEY, remote);
    return remote;
  }
  return getEaImage(APP_LOGO_KEY) || '';
}

/** App logo with instant local cache + Firebase fallback. */
export function useAppLogo(): string {
  const [logo, setLogo] = useState(
    () => getEaImage(APP_LOGO_KEY) || DEFAULT_APP_LOGO,
  );
  useEffect(() => {
    let cancelled = false;
    void loadAppLogo().then((url) => {
      if (!cancelled && url) setLogo(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return logo;
}
