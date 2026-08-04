# Passkey (WebAuthn) Integration Plan

## Overview
Add passkey-based login as an alternative to the current OTP email flow. Users register a passkey (Face ID, Touch ID, PIN, or security key) once, then can sign in with a single tap — no email or OTP needed.

**Stack:** `@simplewebauthn/server` on the backend, browser WebAuthn API on the frontend.

---

## How Passkeys Work

1. **Registration** — browser generates a public/private key pair. Public key is saved to your server. Private key stays on the user's device (iCloud Keychain, Google Password Manager, etc.).
2. **Authentication** — server sends a challenge, browser signs it with the private key, server verifies with the stored public key. No passwords or OTPs involved.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/passkey.js` | Shared utilities: challenge store, verification helpers, config |
| `src/app/api/auth/passkey/register/begin/route.js` | Step 1 of passkey registration — generate & return creation options |
| `src/app/api/auth/passkey/register/complete/route.js` | Step 2 of registration — verify browser response, save public key |
| `src/app/api/auth/passkey/login/begin/route.js` | Step 1 of passkey login — generate & return authentication options |
| `src/app/api/auth/passkey/login/complete/route.js` | Step 2 of passkey login — verify signature, issue session tokens |

## Files to Modify

| File | Changes |
|------|---------|
| `src/models/user.model.js` | Add `passkeys` array field to schema |
| `src/app/(auth)/login/page.js` | Add "Sign in with Passkey" button below the email field |
| `src/app/(main)/profile/page.js` | Add "Passkeys" section: list, register, delete |
| `.env.local` / `.env` | Add `RP_NAME`, `RP_ID`, `ORIGIN` |

---

## User Model Changes

Add to `user.model.js`:

```js
const PasskeySchema = new mongoose.Schema({
  credentialID: { type: Buffer, required: true },
  credentialPublicKey: { type: Buffer, required: true },
  counter: { type: Number, required: true },
  transports: { type: [String] },
  deviceName: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Inside UserSchema:
passkeys: { type: [PasskeySchema], default: [] },
```

---

## API Endpoints

### `POST /api/auth/passkey/register/begin`
- **Auth required?** Yes (user must be logged in via session)
- **Input:** `{ deviceName?: string }`
- **Output:** `publicKeyCredentialCreationOptions` — pass this to `navigator.credentials.create()`
- **Side effect:** Stores challenge in memory (tied to user ID)

### `POST /api/auth/passkey/register/complete`
- **Auth required?** Yes
- **Input:** The response from `navigator.credentials.create()` (credential JSON)
- **Output:** `{ success: true, passkeyId }`
- **Side effect:** Saves credential to user's `passkeys` array

### `POST /api/auth/passkey/login/begin`
- **Auth required?** No
- **Input:** `{ email?: string }` — optionally pre-fill email if user typed it
- **Output:** `publicKeyCredentialRequestOptions` — pass to `navigator.credentials.get()`
- **Side effect:** Stores challenge in memory

### `POST /api/auth/passkey/login/complete`
- **Auth required?** No
- **Input:** The response from `navigator.credentials.get()` (credential JSON)
- **Output:** Same as OTP verify — `{ isNewUser, user }` + sets cookies
- **Side effect:** Issues access/refresh tokens, sets httpOnly cookies

---

## Login Page Changes

```
┌─────────────────────────────────┐
│                                 │
│   🐷 Sign In to FinTrack        │
│                                 │
│   ┌──────────────────────┐     │
│   │ Email address        │     │
│   └──────────────────────┘     │
│                                 │
│   [ Send Code ]                 │
│                                 │
│   ──── or ────                  │
│                                 │
│   [ 🔑 Sign in with Passkey ]  │
│                                 │
└─────────────────────────────────┘
```

- Passkey button calls `POST /api/auth/passkey/login/begin` (with email if filled in)
- Then triggers `navigator.credentials.get()` — prompts Face ID / Touch ID / PIN on the device
- Sends result to `POST /api/auth/passkey/login/complete`
- On success: redirects to `/dashboard` or `/welcome`

---

## Profile Page Changes

In the profile page, add a **Passkeys** section:

- **Show registered passkeys** — list with device name & created date
- **"Register New Passkey"** button — triggers the register flow
- **Delete button** — remove a passkey from the account

---

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `RP_NAME` | Relying Party name (shown in the passkey dialog) | `FinTrack` |
| `RP_ID` | Domain without protocol | `localhost` or `fintrack.app` |
| `ORIGIN` | Full origin URL | `http://localhost:3000` or `https://fintrack.app` |

---

## Dependencies to Install

```bash
npm install @simplewebauthn/server
```

No client package needed — the browser's built-in `navigator.credentials` API handles the client side.

---

## Key Considerations

- **iPhone support:** Works perfectly in Safari with Face ID / Touch ID. Passkeys sync via iCloud Keychain across Apple devices.
- **Cross-device:** Works with QR codes on devices without a passkey (iPhone can scan a QR to sign in on a nearby laptop).
- **Fallback:** OTP flow stays as-is. Passkey is an alternative, not a replacement.
- **Challenge storage:** In-memory Map is fine for single-instance. Would need Redis if scaling to multiple servers.
- **User flow:** Registration happens in Profile (user must be logged in first). After that, login is one-tap.
