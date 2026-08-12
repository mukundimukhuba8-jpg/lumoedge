# Lumo Edge — downloadable app shell

Native Android / iOS wrapper around the **live** web app at [https://lumoedge.com](https://lumoedge.com).

Same screens, same license flow, same Firebase / API backends. Not a rewrite.

## Requirements

- Node 20+
- For Android APK: [Android Studio](https://developer.android.com/studio) (SDK + build tools)
- For iOS: Mac + Xcode

## Setup

```bash
cd lumoedge-app
npm install
npx cap add android
npx cap add ios   # Mac only
npx cap sync
```

## Build Android APK (debug — install on phone)

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

APK path:

`android/app/build/outputs/apk/debug/app-debug.apk`

Transfer to phone and install (enable “Install unknown apps” if needed).

## Open in Android Studio

```bash
npx cap open android
```

Use **Build → Build Bundle(s) / APK(s)** or Play Console for store release.

## iOS

```bash
npx cap open ios
```

Archive + upload with Xcode (Apple Developer account required).

## Config

[`capacitor.config.ts`](capacitor.config.ts) points `server.url` at `https://lumoedge.com`.  
Change that only if you use a staging URL.
