# ArkMobile

Native SwiftUI iPad-first client for Ark.

## Current Scope

- Keeps the existing FastAPI backend unchanged.
- Uses the current REST endpoints directly.
- Stores the bearer token in Keychain.
- Starts with an iPad-first `NavigationSplitView` layout while still supporting iPhone in the same target.

## API Base URL

The app reads `ARK_API_BASE_URL` from `Info.plist` if present. Without that value it defaults to:

```text
http://127.0.0.1:8000
```

That default works for iOS Simulator when the backend runs on the Mac. A physical iPad or App Store build should use an HTTPS backend URL.

## App Store Backend Gap

Before App Store submission, Ark should add an authenticated account deletion endpoint such as `DELETE /auth/me`.
