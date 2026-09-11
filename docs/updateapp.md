# How to Update the FinTrack iOS App

This guide explains how to update the **FinTrack** app on your iPhone after making changes to the codebase.

---

## Architecture Context

FinTrack is an iOS native container (built with **Capacitor 8** and **Xcode 26**) that wraps your live hosted Vercel deployment:

```text
iPhone (FinTrack App)
      ↓
Capacitor WKWebView Container
      ↓
https://fintrack.vistaenvision.com (Vercel)
      ↓
MongoDB Atlas & Brevo API
```

Because of this architecture, **most updates require zero native rebuilding**.

---

## 1. Updating Normal Features (Website, UI, APIs, Bug Fixes)

> **No Xcode or cable required!**

When you make changes to:
- Next.js pages or components (`src/app/`, `src/components/`)
- Styling and themes (`src/app/globals.css`, Tailwind classes)
- API routes or backend business logic (`src/app/api/`)
- Mongoose schemas or models (`src/models/`)

### Update Steps:
1. Commit and push your code to GitHub:
   ```bash
   git add .
   git commit -m "Describe your changes"
   git push origin main
   ```
2. Vercel automatically builds and deploys the new version to `https://fintrack.vistaenvision.com`.
3. **On your iPhone:** 
   - Simply open the FinTrack app (or swipe up to close it and reopen).
   - The app will immediately load your newest changes!

---

## 2. Testing Local Changes on iPhone Before Deploying

If you want to test code changes directly on your physical iPhone before pushing to production:

### Steps:
1. Start your local Next.js dev server:
   ```bash
   cd ~/codes/finance-app
   npm run dev
   ```
2. Find your Mac's local network IP (e.g. `192.168.1.50` via macOS **System Settings > Wi-Fi > Details**).
3. Point Capacitor to your local IP:
   ```bash
   CAPACITOR_SERVER_URL=http://192.168.1.50:3000 npm run cap:sync
   ```
4. Open the project in Xcode:
   ```bash
   npm run cap:open
   ```
5. Plug your iPhone into your Mac and click **Play ▶️ (Run)** in Xcode. Your iPhone will live-reload your local computer's code.
6. When done testing, reset Capacitor back to production:
   ```bash
   npm run cap:sync
   ```

---

## 3. Updating Native Features (Icons, Splash Screens, Plugins)

> **Xcode rebuild required.**

You only need to rebuild the native iOS app if you change:
- The app icon (`ios/App/App/Assets.xcassets/AppIcon.appiconset`)
- The splash screen (`ios/App/App/Assets.xcassets/Splash.imageset`)
- Native iOS plugins (e.g. adding biometric Face ID, Camera, or Push Notifications)
- iOS permissions in `ios/App/App/Info.plist`
- `capacitor.config.ts` settings

### Update Steps:
1. Make your changes in the project.
2. Sync the changes to the iOS project:
   ```bash
   npm run cap:sync
   ```
3. Open Xcode:
   ```bash
   npm run cap:open
   ```
4. Connect your iPhone via USB cable, ensure **"Sukhjot"** is selected as the destination at the top, and click **Play ▶️ (Run)**.

---

## 4. Free Apple Developer 7-Day Certificate Renewal

> [!IMPORTANT]
> Apps installed using a **free personal Apple ID** have a provisioning profile valid for **7 days**.

If a week passes and tapping FinTrack on your phone displays:
> *"FinTrack is no longer available"*

### How to Renew (Takes 30 Seconds):
1. Connect your iPhone to your Mac with the USB-C cable.
2. Open Terminal and run:
   ```bash
   cd ~/codes/finance-app
   npm run cap:open
   ```
3. In Xcode, make sure **Sukhjot** is selected in the top bar and click the **Play ▶️ (Run)** button.
4. Xcode will re-sign the app for another 7 days and reinstall it on your iPhone.
5. **Note:** None of your transaction records or account data are lost during renewal—all financial data is safely stored in your cloud MongoDB Atlas database.

*(If you ever upgrade to a paid $99/year Apple Developer Program account, the certificate lasts for 1 full year without needing renewal).*
