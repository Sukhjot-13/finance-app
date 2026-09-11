# FinTrack iOS App Migration (Next.js + Capacitor + Xcode)

This guide documents the iOS setup for **FinTrack**, turning the hosted Next.js web application into an iPhone application using **Capacitor 8** and **Xcode 26**.

---

## 1. Architecture Overview

Since FinTrack relies on dynamic server-side functionality (MongoDB persistence, sliding-window rate limiting, HTTP-only cookie authentication, and Next.js API routes), the native iOS app wraps the live hosted Next.js app in a native `WKWebView` container:

```text
iPhone (iOS Native App: FinTrack)
      ↓
Capacitor WKWebView Container
      ↓
https://fintrack.vistaenvision.com (Vercel)
      ↓
MongoDB Atlas & Brevo API
```

---

## 2. Configured Settings

The project has been configured with:
- **App Name:** `FinTrack`
- **App ID (Bundle Identifier):** `com.sukhjot.fintrack`
- **Target URL:** `https://fintrack.vistaenvision.com` (configured in `capacitor.config.ts`)
- **Native Plugins:**
  - `@capacitor/status-bar`: Configured with dark style and `#09090b` background matching the fintech theme.
  - `@capacitor/haptics`: Ready for native haptic feedback.
- **Safe Area Insets:**
  - `src/app/layout.js`: Exported `viewportFit: "cover"` and `appleWebApp` metadata.
  - `src/app/globals.css`: Added `.pt-safe`, `.pb-safe`, `.pl-safe`, and `.pr-safe` utilities.
  - `src/app/(main)/layout.js`: Applied top safe-area padding to the mobile header and sidebar so controls never collide with the Dynamic Island or notch.

---

## 3. Quick Commands

The following convenience scripts are available in `package.json`:

```bash
# Sync Capacitor configuration and web assets to the iOS project:
npm run cap:sync

# Open the iOS project in Xcode:
npm run cap:open

# Run the iOS project directly to a connected simulator or device:
npm run cap:run
```

---

## 4. How to Open and Run on iPhone / Simulator

### Step 1: Open the Project in Xcode
Run in your terminal:
```bash
npm run cap:open
```
This will open `ios/App/App.xcodeproj` in Xcode.

### Step 2: Configure Signing in Xcode
1. In the left project navigator, select the top-level **App** project.
2. Select the **App** target.
3. Click the **Signing & Capabilities** tab.
4. Check **Automatically manage signing**.
5. In the **Team** dropdown, select your Apple Account (Personal Team) or paid Apple Developer Team.
6. Confirm the Bundle Identifier is `com.sukhjot.fintrack` (or your unique identifier if needed).

### Step 3: Run on Simulator or Physical iPhone
- **To test on Simulator:** Select any iPhone simulator (e.g. iPhone 16 Pro) in the device dropdown at the top of Xcode, and click the **Run (Play)** button.
- **To test on your physical iPhone:**
  1. Connect your iPhone to your Mac via USB cable.
  2. Unlock your iPhone and tap "Trust This Computer" if prompted.
  3. Select your iPhone in the device dropdown in Xcode.
  4. Press the **Run** button.
  5. *(First time only on iPhone):* On your iPhone, go to **Settings > General > VPN & Device Management**, tap your Developer Account, and tap **Trust**.

---

## 5. Local Development Testing (Optional)

If you want to test local Next.js code on your iPhone before deploying to Vercel:

1. Start your Next.js dev server on your Mac:
   ```bash
   npm run dev
   ```
2. Set the `CAPACITOR_SERVER_URL` environment variable to your Mac's local network IP (e.g. `http://192.168.1.50:3000`):
   ```bash
   CAPACITOR_SERVER_URL=http://192.168.1.50:3000 npm run cap:sync
   ```
3. Run the app in Xcode. It will load from your local dev server.
4. When ready to switch back to production:
   ```bash
   npm run cap:sync
   ```
   (Without `CAPACITOR_SERVER_URL`, it automatically defaults back to `https://fintrack.vistaenvision.com`).

---

## 6. Updating the App

Because FinTrack loads your hosted Vercel deployment:
- **UI and frontend changes:** Simply deploy your updates to Vercel. The iPhone app automatically loads the updated website on next launch without rebuilding Xcode.
- **Native changes:** Only rebuild in Xcode when you change native iOS plugins, permissions in `Info.plist`, app icons, splash screens, or native capabilities.
