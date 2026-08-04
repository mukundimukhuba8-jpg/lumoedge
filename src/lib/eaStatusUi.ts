const OPEN = 'ub-open-ea-status';

/** Open the circular EA status card from any screen. */
export function openEaStatusCard() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN));
}

export function subscribeOpenEaStatusCard(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(OPEN, handler);
  return () => window.removeEventListener(OPEN, handler);
}
