# Google sign-in setup and verification

The login form uses the supplied `/mirai-logo.jpg` symbol, a Google button, and the existing email/password flow. The left brand panel remains unchanged.

## Deployment checklist

- [x] Reference-style login form with the original Mirai symbol.
- [x] Server authorization-code flow with PKCE, nonce and browser-bound, single-use state (10-minute expiry).
- [x] Verify Google token signature, expiry, issuer and client audience using Google's authentication library.
- [x] Only existing, active accounts with assigned roles can create sessions. No automatic accounts or role escalation.
- [x] Existing session cookie, audit trail and role permissions reused.
- [x] Clear fallback message inside the form when Google configuration is unavailable or sign-in fails; a short-lived notice cookie keeps error parameters out of the address bar. Legacy error URLs and unused navigation fragments are cleaned up.
- [x] Automated checks for replay, browser mismatch, invalid identity and inactive accounts.
- [ ] Create/configure a Google OAuth **Web application** client and consent screen.
- [ ] Add production credentials and redeploy the API.
- [ ] Verify an approved account can sign in on the deployed site and an unregistered account is denied.

## Configuration

In Google Cloud's OAuth client settings, register this exact authorized redirect URI:

```
https://mirai-tracker.vercel.app/api/auth/google/callback
```

Set these variables on the `mirai-tracker-api` Vercel project:

```
GOOGLE_CLIENT_ID=<Web application client ID>
GOOGLE_CLIENT_SECRET=<Web application client secret>
GOOGLE_REDIRECT_URI=https://mirai-tracker.vercel.app/api/auth/google/callback
WEB_ORIGIN=https://mirai-tracker.vercel.app
```

Keep the frontend's `VITE_API_URL=/api`. The proxy ensures the browser's OAuth state and session cookies stay on the website origin. Do not use the separate API domain as the production callback. Secrets belong only in API environment variables, never the React build or repository.

If the Google consent screen is in testing mode, add the intended Google accounts as test users. Configure the appropriate audience for your institution.

Local development needs a separate authorized callback, `http://localhost:3000/auth/google/callback`, and the matching local WEB_ORIGIN (normally `http://localhost:5173`).

Google sign-in must match the account's **login email**, not its notification address. Gmail and verified Google Workspace identities are supported. For a Google account backed by a different email provider, continue using password/email OTP because Google is not authoritative for ongoing ownership of that external mailbox. Google login creates a session after Google verification; password login retains its email OTP step.

GET `/api/auth/google/config` reports availability without revealing credentials. Until configuration is present, the Google button returns to the login page with a clear message and email login stays usable.

Reference: https://developers.google.com/identity/openid-connect/openid-connect
