import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * Firebase web config (safe to ship in the client — protect data with
 * Realtime Database + Storage security rules in the Firebase console).
 * Override any value with VITE_FIREBASE_* env vars on Vercel if needed.
 */
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyBvEg-HTY0Dxa8smlH4Sf8YDKcb7nQVpfA',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'lumoedge-61c02.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://lumoedge-61c02-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lumoedge-61c02',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'lumoedge-61c02.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '254867912404',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:254867912404:web:2781bef9267c57bb7fed41',
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-ZXQ2V9TBLK',
};

let app: FirebaseApp | null = null;
let db: Database | null = null;
let storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseDb(): Database {
  if (db) return db;
  db = getDatabase(getFirebaseApp());
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (storage) return storage;
  storage = getStorage(getFirebaseApp());
  return storage;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);
}

export { firebaseConfig };
