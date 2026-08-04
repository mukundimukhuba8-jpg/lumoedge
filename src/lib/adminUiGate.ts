/** Lightweight UI gates — avoid pulling AdminContext into shell chrome. */

let adminDrawerOpen = false;

export function setAdminDrawerOpen(open: boolean) {
  adminDrawerOpen = open;
}

export function isAdminDrawerOpen() {
  return adminDrawerOpen;
}
