#!/usr/bin/env node
/**
 * Logic tests for admin/client queue merge + DB merge (no browser).
 */
import { mergeDatabases } from '../api/_lib/mergeDb.mjs';

// Inline copies of adminQueue logic (TS module — test the same rules)
function normalizeAdminRole(raw) {
  const value = String(raw ?? 'pending').trim().toLowerCase();
  if (value === 'super') return 'super';
  if (value === 'admin') return 'admin';
  return 'pending';
}

function pickAdminRole(a, b) {
  const left = normalizeAdminRole(a);
  const right = normalizeAdminRole(b);
  const rank = (role) => (role === 'super' ? 3 : role === 'admin' ? 2 : 1);
  return rank(left) >= rank(right) ? left : right;
}

function pickAdminRoleLive(liveRole, backupRole) {
  const live = normalizeAdminRole(liveRole);
  const backup = normalizeAdminRole(backupRole);
  if (live === 'super') return 'super';
  if (live === 'admin') return 'admin';
  if (backup === 'admin') return 'pending';
  return pickAdminRole(live, backup);
}

function mergeAdminsLive(live, backup) {
  const byEmail = new Map();
  for (const item of live || []) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...item, email, role: normalizeAdminRole(item.role) });
  }
  for (const item of backup || []) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...item, email, role: normalizeAdminRole(item.role) });
      continue;
    }
    const merged = { ...prev, ...item, email };
    merged.role = pickAdminRoleLive(prev.role, item.role);
    byEmail.set(email, merged);
  }
  return [...byEmail.values()];
}

function mergeAdminsForApprovalSync(local, remote) {
  const merged = mergeAdminsLive(remote, local);
  const byEmail = new Map();
  for (const a of merged) {
    const email = String(a.email || '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...a, email, role: normalizeAdminRole(a.role) });
  }
  for (const a of local || []) {
    const email = String(a.email || '').trim().toLowerCase();
    if (!email || normalizeAdminRole(a.role) !== 'pending') continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, { ...a, email, role: 'pending' });
      continue;
    }
    const remoteHit = (remote || []).find(
      (r) => String(r.email || '').trim().toLowerCase() === email,
    );
    const hit = byEmail.get(email);
    if (
      normalizeAdminRole(hit.role) === 'admin' &&
      (!remoteHit || normalizeAdminRole(remoteHit.role) !== 'admin')
    ) {
      byEmail.set(email, { ...hit, role: 'pending' });
    }
  }
  return [...byEmail.values()];
}

function normalizeClientStatus(raw) {
  const value = String(raw ?? 'pending').trim().toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  return 'pending';
}

function pickClientStatus(a, b) {
  const left = normalizeClientStatus(a);
  const right = normalizeClientStatus(b);
  if (left === 'approved' || right === 'approved') return 'approved';
  if (left === 'pending' || right === 'pending') return 'pending';
  return 'rejected';
}

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

console.log('\n=== Admin queue merge tests ===');

assert(
  'live pending beats stale backup admin',
  pickAdminRoleLive('pending', 'admin') === 'pending',
);

assert(
  'live admin wins over backup pending',
  pickAdminRoleLive('admin', 'pending') === 'admin',
);

const sync3 = mergeAdminsForApprovalSync(
  [{ email: 'a@test.com', role: 'admin', id: '1' }],
  [{ email: 'a@test.com', role: 'pending', id: '1' }],
);
assert(
  'stale local admin reverted when remote says pending',
  sync3.find((x) => x.email === 'a@test.com')?.role === 'pending',
);

const sync2 = mergeAdminsForApprovalSync(
  [{ email: 'b@test.com', role: 'pending', id: '2' }],
  [],
);
assert(
  'orphan local pending kept when missing from remote',
  sync2.some((x) => x.email === 'b@test.com' && x.role === 'pending'),
);

const sync4 = mergeAdminsForApprovalSync(
  [],
  [{ email: 'c@test.com', role: 'admin', id: '3' }],
);
assert(
  'remote approved mentor stays admin',
  sync4.find((x) => x.email === 'c@test.com')?.role === 'admin',
);

console.log('\n=== Client status merge tests ===');
assert('approved wins pending', pickClientStatus('pending', 'approved') === 'approved');
assert('pending wins rejected', pickClientStatus('rejected', 'pending') === 'pending');
assert('rejected only when both rejected', pickClientStatus('rejected', 'rejected') === 'rejected');

console.log('\n=== mergeDatabases (PUT /api/db safety) ===');

const base = {
  clients: [
    { id: '1', email: 'c1@test.com', status: 'pending' },
    { id: '2', email: 'c2@test.com', status: 'approved' },
  ],
  auth: {
    admins: [
      { id: 'm1', email: 'm1@test.com', role: 'pending' },
      { id: 'm2', email: 'm2@test.com', role: 'admin' },
    ],
  },
  vault: [{ id: 'v1', key: 'LUMO-AAAA-BBBB-CCCC', status: 'active' }],
  images: { 'img-1': 'data:old' },
  store: { workspaces: { ws1: { licenses: [{ id: 'l1', key: 'KEY1' }] } } },
};

const partialPatch = {
  clients: [{ id: '3', email: 'c3@test.com', status: 'pending' }],
};

const merged = mergeDatabases(base, partialPatch);
assert(
  'partial client patch does not wipe existing clients',
  merged.clients.length === 3 &&
    merged.clients.some((c) => c.email === 'c1@test.com') &&
    merged.clients.some((c) => c.email === 'c3@test.com'),
);

const adminPatch = { auth: { admins: [{ id: 'm3', email: 'm3@test.com', role: 'pending' }] } };
const mergedAdmins = mergeDatabases(base, adminPatch);
assert(
  'partial admin patch merges not replaces',
  mergedAdmins.auth.admins.length === 3,
);

const vaultPatch = { vault: [{ id: 'v2', key: 'LUMO-DDDD-EEEE-FFFF', status: 'active' }] };
const mergedVault = mergeDatabases(base, vaultPatch);
assert(
  'partial vault patch merges not replaces',
  mergedVault.vault.length === 2,
);

const imagePatch = { images: { 'img-2': 'data:new' } };
const mergedImages = mergeDatabases(base, imagePatch);
assert(
  'partial images patch merges not replaces',
  mergedImages.images['img-1'] === 'data:old' && mergedImages.images['img-2'] === 'data:new',
);

const emptyClientsPatch = { clients: [] };
const mergedEmpty = mergeDatabases(base, emptyClientsPatch);
assert(
  'empty clients array in patch does not wipe base clients',
  mergedEmpty.clients.length === 2,
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
