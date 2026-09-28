# Rohly mobile (iOS + Android)

Rohly uses Capacitor 8 so the existing React/Vite product can run in native iOS and Android shells while sharing the same product code.

## Requirements

- Node.js 22+
- Android Studio (current supported release) for Android
- macOS + Xcode 26+ for iOS

## First-time native project generation

From `frontend/`:

```bash
yarn install
yarn mobile:add:android
yarn mobile:add:ios
```

Commit the generated `android/` and `ios/` folders after generation.

## Run against the deployed Rohly web app

This is the simplest testing mode because Rohly's existing httpOnly session cookie and relative `/api` calls stay same-origin.

```bash
CAPACITOR_SERVER_URL=https://YOUR-ROHLY-DOMAIN yarn cap sync
CAPACITOR_SERVER_URL=https://YOUR-ROHLY-DOMAIN yarn cap open android
# or on macOS
CAPACITOR_SERVER_URL=https://YOUR-ROHLY-DOMAIN yarn cap open ios
```

For store builds, prefer a bundled web build with `VITE_API_URL` pointed at the production API after the backend CORS/cookie policy is configured for the native origin.

## Mobile UX

The authenticated app uses a five-item bottom navigation on phone-sized screens: Home, Campaigns, Inbox, Leads and More. Desktop navigation remains unchanged. Safe-area insets are enabled for iPhone notches/home indicators and modern Android edge-to-edge displays.
