# Google Play readiness checklist (§104, §107)

## Account
- [ ] Create a Google Play Console account (one-time registration fee, identity verification).
- [ ] Create the app using `package: br.com.familyapp.mobile` (placeholder — confirm before first submission).

## Store listing
- [ ] App name, short/full description (pt-BR)
- [ ] Icon, feature graphic, screenshots — no design assets exist in this repo yet
- [ ] Privacy Policy URL (same real, published policy as the App Store checklist)
- [ ] Data Safety section — must reflect exactly what the shipped build collects/shares; re-derive at
      submission time, do not pre-fill
- [ ] Content rating questionnaire
- [ ] Account deletion flow / web-based deletion option (Google requires a web URL alternative in addition to
      in-app deletion) — track against §114

## Build / release
- [ ] `eas build --platform android --profile production`
- [ ] `eas submit --platform android`
- [ ] Internal testing track before closed/open testing and production release
