# App Store (iOS) readiness checklist (§103, §106)

Technical build configuration (`bundleIdentifier`, permission usage strings, `eas.json` profiles) is already in
`apps/mobile/app.json` / `apps/mobile/eas.json`. The following requires an Apple Developer account and product/
legal decisions this assistant cannot make on the account owner's behalf.

## Account
- [ ] Enroll in the Apple Developer Program (requires a legal entity or individual identity verification, and
      an annual fee).
- [ ] Create the app in App Store Connect using `bundleIdentifier: br.com.familyapp.mobile` (placeholder —
      confirm or change before first submission).

## Store listing (do not let the assistant invent these — product/legal must supply real answers)
- [ ] App name, subtitle, description (pt-BR)
- [ ] Category (suggest: Lifestyle or Productivity — final call is the product owner's)
- [ ] Icon (1024×1024) and screenshots per required device size — no design assets exist in this repo yet
- [ ] Support URL, marketing URL
- [ ] Privacy Policy URL — must point at a real, published policy consistent with PRIVACY.md, reviewed by
      counsel; this repo only has the technical draft
- [ ] Age rating questionnaire — answer honestly based on the actual shipped feature set at submission time
- [ ] App Privacy (Nutrition Label) declarations — must reflect exactly what the shipped build collects; do not
      pre-fill from this checklist, re-derive at submission time
- [ ] Demo/test account credentials for App Review, if login is required to review the app
- [ ] Account deletion flow reachable from within the app before submission (Apple requires this) — track
      against §114's implementation

## Build
- [ ] `eas build --platform ios --profile production`
- [ ] `eas submit --platform ios`
- [ ] TestFlight internal testing before public release
