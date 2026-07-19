# Firebase setup (Lumo Edge)

The app uses your Firebase project **lumoedge-61c02** for:

- **Realtime Database** — clients, sessions, vault, licenses, workspaces
- **Storage** — profile photos and custom media (HTTPS URLs)

## One-time console setup

1. Open [Firebase Console](https://console.firebase.google.com/project/lumoedge-61c02)
2. **Realtime Database** → Create database (if not already) → Rules → paste `firebase/database.rules.json`
3. **Storage** → Get started → Rules → paste `firebase/storage.rules`
4. Publish both rule sets

Without these rules published, uploads and sync will fail in the browser.

## Notes

- The web `firebaseConfig` is public by design (it is in the client). Security comes from **Database + Storage rules**.
- Current rules allow read/write under `/lumo` so the app can sync without Firebase Auth. Tighten later with Auth if needed.
- After deploy: re-upload your portal profile once so it is stored in Firebase Storage and syncs to client home avatars.
