# FinTrack iOS Setup & Future Update Guide

This document is a permanent reference of every step taken to install **FinTrack** on your iPhone, including where Apple IDs and passwords were used, and how to push future updates to your phone.

---

## 1. Quick Reference & Account Info

| Item | Details |
|------|---------|
| **App Name** | FinTrack |
| **Bundle ID** | `com.sukhjot.fintrack` |
| **Hosted Backend URL** | `https://fintrack.vistaenvision.com` (Vercel) |
| **Development Team** | `Sukhjot Singh (Personal Team)` (Team ID: `43P5Y6VQXJ`) |
| **Target Device** | iPhone 15 Pro Max ("Sukhjot") |

---

## 2. All Steps Taken During Initial App Installation

Here is the exact breakdown of every step, password, and prompt encountered:

### Step 1: Navigating to the Project
In Terminal, the command must be run inside the project directory:
```bash
cd ~/codes/finance-app
npm run cap:open
```
*(This launches `ios/App/App.xcodeproj` in Xcode).*

### Step 2: Adding Apple ID in Xcode Settings
- **Where:** Top macOS Menu Bar > **Xcode > Settings...** (or `Cmd + ,`) > **Accounts** tab.
- **Action:** Clicked the `+` button in the bottom-left and chose **Apple Account**.
- **Credentials Entered:** 
  - Apple ID email address
  - Apple ID password / two-factor authentication code.
- **Result:** Xcode created and registered your **Personal Team** (`Sukhjot Singh`).

### Step 3: Keychain Prompt for GitHub
- **Prompt:** *"Xcode wants to use your confidential information stored in github.com in your keychain."*
- **Why:** Capacitor uses Swift Package Manager (SPM) which clones native packages (`capacitor-swift-pm`) from GitHub.
- **Password Entered:** **Mac Login Password** (the password you use to unlock your MacBook).
- **Action:** Selected **"Always Allow"**.

### Step 4: Connecting iPhone & Enabling iOS Developer Mode
1. Connected iPhone 15 Pro Max to MacBook using USB-C to USB-C cable.
2. On iPhone: Tapped **"Trust This Computer"** and entered the **iPhone passcode**.
3. On Mac: Clicked **"Allow"** on the *"Allow accessory to connect?"* notification.
4. Enabled iOS 16+ Developer Mode:
   - On iPhone: **Settings > Privacy & Security > Developer Mode**.
   - Turned toggle **ON** and tapped **Restart**.
   - After restart: Unlocked iPhone, tapped **"Turn On"** on the confirmation prompt, and entered the **iPhone passcode**.

### Step 5: Resolving iOS Device Support in Xcode
- In the top toolbar of Xcode, the destination showed `Sukhjot (iOS ... is not installed.)` with a silver **`Get`** button.
- Clicked **`Get`** to let Xcode download the device support component matching your iPhone's iOS version.

### Step 6: Selecting Device & Signing Configuration
1. In the top toolbar (next to the Play ▶️ button), changed destination from *"Any iOS Device"* to **"Sukhjot"** (your iPhone 15 Pro Max).
2. In Xcode's project navigator (left sidebar), clicked **App** > **Signing & Capabilities** tab.
3. In the **Team** dropdown, selected **Sukhjot Singh (Personal Team)**.
4. Xcode automatically generated the provisioning profile and assigned Development Team `43P5Y6VQXJ`.

### Step 7: Keychain Prompt for Code Signing (`codesign`)
- **Prompt:** *"codesign wants to access key 'Apple Development: Sukhjot Singh' in your keychain."*
- **Why:** Xcode was cryptographically signing the compiled iOS application binary using your developer certificate.
- **Password Entered:** **Mac Login Password** (your MacBook screen unlock password).
- **Action:** Selected **"Always Allow"** (so macOS won't prompt for password on future builds).

### Step 8: Installing and First Launch on iPhone
- Clicked the **Play ▶️ (Run)** button in Xcode. Xcode compiled and installed FinTrack onto your iPhone.
- *(First time only on iPhone)*: If iOS blocks opening the app:
  - Open **Settings > General > VPN & Device Management**.
  - Tap your Developer Account (**Sukhjot Singh**).
  - Tap **"Trust Sukhjot Singh"** and confirm.
- The FinTrack app opens with your full dark fintech interface loaded live!

---

## 3. How Future Updates Work

Because FinTrack is an iOS container loading your live Vercel web app (`https://fintrack.vistaenvision.com`), updating the app is seamless:

### Scenario A: Normal Code Changes (Website, UI, Features, Bug Fixes, APIs)
> **You do NOT need to rebuild the iOS app in Xcode!**

1. Make your code changes in Next.js / React / CSS / API routes.
2. Commit and push your changes to GitHub:
   ```bash
   git add .
   git commit -m "your update message"
   git push origin main
   ```
3. Vercel will automatically build and deploy the new version to `https://fintrack.vistaenvision.com`.
4. **On your iPhone:** Just open (or force-close and re-open) the FinTrack app. It will immediately and automatically load the newest version of your website!

---

### Scenario B: Testing Local Changes on iPhone Before Deploying
If you want to test changes on your physical iPhone without deploying to Vercel first:

1. Start your local Next.js dev server:
   ```bash
   cd ~/codes/finance-app
   npm run dev
   ```
2. Find your Mac's local Wi-Fi IP address (e.g. `192.168.1.50` in macOS Settings > Wi-Fi > Details).
3. Sync Capacitor to point to your local IP:
   ```bash
   CAPACITOR_SERVER_URL=http://192.168.1.50:3000 npm run cap:sync
   ```
4. Open Xcode (`npm run cap:open`), select your iPhone, and hit **Play ▶️**. Your phone will live-reload your local code!
5. When finished testing, reset it back to the live hosted site:
   ```bash
   npm run cap:sync
   ```

---

### Scenario C: Native iOS Changes (App Icon, Splash Screen, Permissions, Native Plugins)
You only need to rebuild in Xcode if you change native iOS configurations:

1. Modify native assets (e.g. app icon inside `ios/App/App/Assets.xcassets/AppIcon.appiconset`).
2. Sync Capacitor:
   ```bash
   npm run cap:sync
   ```
3. Open Xcode (`npm run cap:open`), connect your iPhone, and click **Play ▶️**.

---

### Scenario D: Free Apple ID 7-Day Certificate Expiry
> [!IMPORTANT]
> Free Apple Developer accounts sign apps with a **7-day expiration**.
> 
> If after a week you tap FinTrack on your phone and iOS says *"FinTrack is no longer available"*:
> 1. Plug your iPhone into your Mac.
> 2. Run:
>    ```bash
>    cd ~/codes/finance-app
>    npm run cap:open
>    ```
> 3. Click the **Play ▶️ (Run)** button in Xcode.
> 
> This instantly re-signs the app and gives you another 7 days (all your stored data in MongoDB remains completely untouched).
> *(If you ever upgrade to a paid $99/year Apple Developer Program account, the certificate lasts for a full 1 year).*
