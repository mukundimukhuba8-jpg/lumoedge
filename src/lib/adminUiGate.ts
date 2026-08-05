/** Lightweight UI gates — avoid pulling AdminContext into shell chrome. */

let adminDrawerOpen = false;
/** Keep sync/heal paused briefly after a menu tap so page mount isn't crushed. */
let adminNavBusyUntil = 0;

export function setAdminDrawerOpen(open: boolean) {
  adminDrawerOpen = open;
}

export function isAdminDrawerOpen() {
  return adminDrawerOpen;
}

/** Call on sidebar item tap — blocks background sync while the route paints. */
export function markAdminNavBusy(ms = 1200) {
  adminNavBusyUntil = Math.max(adminNavBusyUntil, Date.now() + ms);
}

/** Drawer open OR recent navigation — sync loops must yield. */
export function isAdminUiBusy() {
  return adminDrawerOpen || Date.now() < adminNavBusyUntil;
}
