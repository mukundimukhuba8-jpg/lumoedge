# Registration Approval System — Root Cause Report (URGENT)

**Date:** 2026-07-21  
**Branch:** `cursor/approval-system-audit-8f6d`  
**PR:** #56

---

## Exact root cause

**Live client registrations are stored in Firebase (`lumo/clients`), but production approval and manual creation were writing only to the GitHub backup (`cloud-data/db.json`).**

### Evidence (verified against production)

| Check | Result |
|-------|--------|
| Firebase `lumo/clients` | 302 clients, **61 pending**, 241 approved |
| Pending user `couthasello@gmail.com` | Exists in Firebase with `status: pending` |
| `PATCH https://lumoedge.com/api/clients/cli-1784551297282` (production, pre-fix) | Returns **`null`** — client not in GitHub backup |
| Server `firebasePatchClientById()` (same ID) | **Succeeds** — status becomes `approved` in Firebase |

### Why Approve appeared to work locally but not persist

1. Admin taps **Approve** → React state updated optimistically (user disappears from Pending).
2. `patchClient()` tried Firebase client SDK first, then `/api/clients/:id` PATCH.
3. **Production PATCH only searched GitHub `db.clients`** → returned `null` for Firebase-only registrations.
4. Errors were swallowed (`.catch(() => undefined)`), so UI showed success.
5. **2.5s poll** re-fetched Firebase → still `pending` → after refresh, approval gone.
6. Client waiting page polls `getClientByEmail()` → still blocked.

### Why manual user creation failed

1. **Save as approved** called `postClient()` + background `patchClient()`.
2. `POST /api/clients` on production wrote **GitHub only**, not Firebase.
3. Background patch returned `null` for the same reason as above.
4. Function returned `{ ok: true }` based on local state only.

### Secondary bugs

| Bug | Effect |
|-----|--------|
| Refresh counts from raw API list | Misleading "0 awaiting, 236 approved" message |
| Approved stat used search-filtered list | Showed **0 approved** while search active |
| `fetchRemoteDeletedClients()` without timeout | **Refresh button stuck on "Refreshing…"** |
| Full `pushDb({ clients: merged })` on approve | Large, unreliable write; masked real failure |

---

## Fix (backend-first, not UI)

### Single source of truth

| Entity | Field | Store |
|--------|-------|-------|
| Client subscription | `status: pending \| approved \| rejected` | **Firebase `lumo/clients`** |
| Mentor account | `role: pending \| admin` | **Firebase `lumo/auth/admins`** |
| GitHub `db.json` | Same fields | Backup mirror only |
| Client session | `accessStatus` | Firebase `lumo/sessions/{email}` |

### Server API changes (`api/index.js`, `api/_lib/handlers.mjs`, `api/_lib/clientMerge.mjs`)

- **`PATCH /api/clients/:id`** — patches **Firebase first** via `firebasePatchClientById()`; returns 404 if not in Firebase; mirrors to GitHub after.
- **`POST /api/clients`** — creates in **Firebase first** via `firebasePostClientEntry()`; supports approved + payment flags for manual add.
- **`PATCH /api/auth/admins/:id`** — patches mentor role in Firebase.

### Client changes

- **`patchClient()`** — **API first** (server REST → Firebase), SDK fallback; full structured logging, no silent failures.
- **`postClient()`** — API first for manual creation; logs request/response.
- **`approveClient()`** — **awaits** `patchClient()`; throws if Firebase not updated; no fake success.
- **`addApprovedSubscriber()`** — awaits create + approve; returns error if DB write fails.
- **`refreshClientQueue()`** — 5s timeout on deleted-client fetch; counts from merged queue.
- **Stats** — `stats.approvedClients` uses unfiltered queue counts.

---

## Files modified

| File | Change |
|------|--------|
| `api/_lib/clientMerge.mjs` | `firebasePostClientEntry`, `firebasePatchClientById` |
| `api/index.js` | Firebase-first POST/PATCH clients |
| `api/_lib/handlers.mjs` | Local dev parity |
| `src/lib/remote.ts` | API-first patch/post + logging |
| `src/context/AdminContext.tsx` | Blocking approve/manual create; stats; refresh timeout |
| `src/pages/admin/AdminPages.tsx` | Unfiltered approved stat; real error messages |
| `src/lib/approvalLog.ts` | Structured logs |
| `src/lib/clientQueue.ts` | Status normalization + counts |
| `src/pages/client/WaitingApprovalPage.tsx` | Normalized status checks |

---

## Logging (console)

All steps log with `[approval:client]` or `[approval:mentor]`:

- `approve_clicked`, `manual_create_clicked`
- `database_patch_request`, `database_patch_success`, `database_patch_failure`
- `database_post_request`, `database_post_success`, `database_post_failure`
- `database_update_success`, `database_update_failure`
- `session_sync_success`, `session_sync_failure`
- `queue_refreshed`

Each log includes **id, email, table (`lumo/clients`), before/after status, source (api/firebase_sdk), and full error text**.

---

## Security / permissions

- Firebase RTDB rules: `lumo` read/write **open** (not blocking writes).
- Issue was **wrong target database** (GitHub-only), not RLS/rules.

---

## Verification

### Automated

```bash
npm run build  # PASS
```

### Production API (after deploy)

```bash
# Must return approved client object, not null
curl -X PATCH "https://lumoedge.com/api/clients/cli-1784551297282" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved","paymentClaimed":true}'
```

### Manual (post-deploy)

1. Approve pending client → moves to Approved, count updates.
2. Refresh page → still approved in Firebase and UI.
3. Client waiting page → advances to license activation.
4. Manual add subscriber → appears in Approved immediately.
5. Refresh button completes (not stuck).

---

## Deploy requirement

**Production is on main @ PR #55.** This fix is in **PR #56** — must be **merged and deployed** for lumoedge.com to use Firebase-first PATCH/POST.

Until deploy, approvals will continue to fail on production even though the fix is correct in the branch.
