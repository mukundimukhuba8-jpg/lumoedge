import { useEffect } from 'react';
import {
  applyInterfaceTheme,
  loadInterfacePrefs,
  subscribeInterfacePrefs,
} from '../lib/interfaceStyle';

/** Applies global cyber theme tokens from local preferences — UI only. */
export function ThemeEngine() {
  useEffect(() => {
    applyInterfaceTheme(loadInterfacePrefs());
    return subscribeInterfacePrefs(() => applyInterfaceTheme(loadInterfacePrefs()));
  }, []);
  return null;
}
