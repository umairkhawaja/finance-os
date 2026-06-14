# Security model

Finance OS is designed around one principle: **your financial data never leaves your control.** This document explains exactly where data lives, what the public site can and can't expose, and the protections built in.

## Where your data lives

| Data | Stored in | Visible to the public repo / site? |
|------|-----------|-------------------------------------|
| Transactions, balances, budgets, portfolio history | Your browser's **IndexedDB** (this device) | **No** |
| Cloud backup of the above | **appDataFolder** in *your* Google Drive | **No** (behind your Google login) |
| Discord webhook, Notion token & DB ID | IndexedDB + your Drive backup | **No** — entered at runtime, never in source |
| App PIN | SHA-256 **hash** in `localStorage` (this device) | **No** — never uploaded |
| Application code, logo, default budget/plan template | The repo / GitHub Pages site | **Yes (public)** — but contains no personal data |

The published website is **static code only**. Opening the URL gives a visitor an empty app running in *their* browser; it has no access to your IndexedDB or your Drive.

## Why a public repo is acceptable here

- GitHub Pages sites are **publicly reachable** regardless of repo visibility. A private repo only hides the *source*, not the *site*; the site URL is still public. Truly access-controlled Pages is a **GitHub Enterprise–only** feature. An "unlisted link" is obscurity, not security.
- Since the repo contains **zero personal data and zero secrets**, making it public costs you nothing in privacy and gives you free, reliable hosting.

## Least-privilege Google Drive access

- Sign-in requests **only** the `https://www.googleapis.com/auth/drive.appdata` scope.
- This scope lets the app read/write **only its own hidden application-data folder**. It **cannot list, read, or modify any of your other Google Drive files** — photos, documents, anything. Even if the app code were malicious, this scope confines it to the data it created.
- The OAuth **access token** is short-lived (~1 hour), stored only in your browser, and **stripped from the URL** immediately after the redirect returns (it never lingers in history or the address bar).
- Sign-in is a **full-page redirect**, so there is no popup that could be hijacked, and it works inside the iOS standalone web app.

## App PIN lock

- Optional. When set, a lock screen covers the UI until the correct PIN is entered.
- The PIN is stored as a **SHA-256 hash** in `localStorage` and is never transmitted.
- **Scope of protection:** this deters casual snooping if someone picks up your unlocked device. It is **not** full encryption — a technical user with access to your unlocked device could read IndexedDB directly. For real protection, keep your device's own lock (Face ID / passcode) enabled. Treat the PIN as a convenience layer, not a vault.

## Secrets handling

- No webhook URLs, API tokens, or database IDs are committed to the repo.
- They are entered in **Settings**, stored locally, and included in your private Drive backup so they sync across your own devices.
- The Notion token field is a password input; treat your Notion integration token and Discord webhook as secrets and rotate them if exposed.

## Network calls the app makes

The app only talks to:

- `accounts.google.com` / `googleapis.com` — Drive sign-in and sync (your data, your account).
- `discord.com` — only if *you* configure a webhook and press the Discord button.
- `api.notion.com` — only if *you* configure Notion credentials and trigger a sync.
- `cdn.jsdelivr.net` — to load Chart.js and PDF.js libraries (no data sent).

The service worker explicitly **never caches or intercepts** Google/Discord/Notion traffic — those always go live to the network.

## Recommendations

1. Keep the repo's `.gitignore` intact; never commit exported `financeOS_*.json` snapshots or your `BankStatements/` folder.
2. Add only your own Google account as an OAuth **test user**; don't publish the OAuth client for others.
3. Enable your device lock (Face ID / passcode). It's the strongest protection for on-device data.
4. If you set an app PIN, choose one you don't reuse elsewhere.
5. Rotate your Discord webhook / Notion token if you ever paste them somewhere public by accident.

## Reporting

This is a personal project. If you (or a collaborator you've shared the fork with) find a security issue, open a private security advisory on the GitHub repo rather than a public issue.
