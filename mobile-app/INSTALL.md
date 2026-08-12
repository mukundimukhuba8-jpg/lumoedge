# Install Lumo Edge on your phone

## Quick install (Android)

1. Download **`dist/LumoEdge.apk`**
2. On your phone: open the file
3. Allow **Install unknown apps** for your browser/Files app if asked
4. Install → open **Lumo Edge**

The app loads **https://lumoedge.com** — same login, licenses, admin, Firebase, APIs.

## What this is

A native Android shell (Capacitor). Not a rewrite. Same backends as the website.

## Rebuild later (on a PC)

```bash
cd lumoedge-app
npm install
echo "sdk.dir=YOUR_ANDROID_SDK_PATH" > android/local.properties
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## iOS

Needs a Mac + Apple Developer account (`npx cap add ios` then Xcode).
