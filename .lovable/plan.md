
Summary

This looks like a frontend auth-return bug caused by the multilingual routing rollout, not a domain-connection issue. Google/Apple currently return users to `window.location.origin` (`/`), but all post-login routing now lives under `/:lang/...`. So users come back to the public landing page instead of a signed-in route, and the root redirect may also interfere before the session fully restores.

Implementation plan

1. Add a localized OAuth callback route
- Create a new public route: `/:lang/auth/callback`
- This page will wait for auth initialization to finish, then send the user to the intended page or `/:lang/dashboard`
- If no session is restored, it will send the user back to `/:lang/login`

2. Send Google/Apple back to the callback route instead of `/`
- Update the OAuth buttons in `src/pages/Login.tsx` to use a locale-aware callback URL like `window.location.origin + /:lang/auth/callback`
- Preserve an optional `redirect` query so users return to the protected page they originally tried to open
- Keep the current language (`en` or `de`) through the full auth flow

3. Make protected routes remember the destination
- Update `ProtectedRoute` in `src/App.tsx` to redirect unauthenticated users to `/:lang/login?redirect=<current path>`
- Reuse the same redirect after successful email login/signup so every auth method behaves consistently

4. Make public entry routes auth-aware
- Update `RootRedirect` to wait for auth loading before navigating
- If a session already exists, send `/` straight to `/:lang/dashboard`
- Update the landing page CTA/header so signed-in users see “Dashboard” / “Continue” instead of guest-only login buttons

5. Verify host consistency
- Confirm auth starts and ends on the same primary host (`goalgpt.io` vs `www.goalgpt.io`) to avoid local-storage session loss across origins
- If you use your own Google or Apple credentials, verify the custom domain is enabled in the backend auth redirect configuration

Files to change
- `src/App.tsx`
- `src/pages/Login.tsx`
- `src/pages/Landing.tsx`
- `src/pages/AuthCallback.tsx` (new)

Technical notes
- No database changes are needed
- The main fix is in frontend route/callback handling after OAuth
- This will cover both Google and Apple sign-in and keep the language-specific URLs intact

Validation
- Test Google sign-in on `goalgpt.io/en/login` and `goalgpt.io/de/login`
- Test Apple sign-in on both languages as well
- Confirm users return to `/:lang/dashboard` or the originally requested protected page
- Confirm protected pages still work after refresh, especially on mobile
