# VisionCore Mobile

Native private-beta client for VisionCore, built with Expo SDK 57 and React Native.

## First vertical slice

- Native camera and photo-library selection
- Multipart upload to the existing Render transform endpoint
- Bounded request and clear timeout/error states
- Native Head-to-Toe cards
- Authoritative primary-color contract: legacy display aliases can never override the final primary HEX/name
- Honest accessory publication: identity may display while unvalidated color remains withheld

## Run locally

```bash
npm install
npm start
```

Scan the QR code with Expo Go or run the iOS simulator. The default API base URL is configured in `app.json`.

## Next beta milestones

1. Add authentication and secure session storage.
2. Add analysis history and cached result detail.
3. Add the remaining style-mode and recommendation views.
4. Add credit balance and purchase flows after App Store billing architecture is finalized.
5. Add EAS project ownership, signing, icons, splash assets, and TestFlight distribution.
