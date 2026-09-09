# VisionCore Mobile

Native private-beta client for VisionCore, built with Expo SDK 57 and React Native.

## Native private-beta surface

- Native camera and photo-library selection
- Multipart upload to the existing Render transform endpoint
- Bounded request and clear timeout/error states
- CE-CE dashboard, upload, result, history, and account layouts
- Overall score, evidence-led insight, Head-to-Toe, style-mode, palette, and Shopping Assist sections
- Authoritative primary-color contract: legacy display aliases can never override the final primary HEX/name
- Honest accessory publication: identity may display while unvalidated color remains withheld

## Run locally

```bash
npm install
npm start
```

Scan the QR code with Expo Go or run the iOS simulator. The default API base URL is configured in `app.json`.

## Remaining service connections

1. Add authentication and secure session storage.
2. Persist analysis history and cached result detail beyond the current session.
3. Connect Shopping Assist selections to product recommendations.
4. Add credit balance and purchase flows after App Store billing architecture is finalized.
5. Add EAS project ownership, signing, final icons, splash assets, and TestFlight distribution.
