---
name: icon-generator
description: Generate app icons for a PWA from a single source image. Use this skill to create icons for iOS and Android, verify the outputs, and incorporate them into the app.
---

```
Use this skill to generate app icons for a PWA from a single source image.

You will ask the user for the input file path, run the generator command, verify the outputs, then incorporate them into the app.

1) Ask for input
- Ask the user for the icon source file path.
- Prefer a square image; 1024x1024 PNG is a good default.

2) Generate icons
Run:

	npx pwa-icons -i <input-filename> -o <output-location> -p ios,android -f png --padding 0 --optimization light

This writes:
- `<output-location>/android/*`
- `<output-location>/ios/*`
- `<output-location>/icons.json`

3) Inspect the output
The `icons.json` will should have entries for each generated icons.

4) Incorporate into the application
This repo serves icons from `public/icons/`.

Sync the generated icons into place by copying:
- `<output-location>/android/` -> `public/icons/android/`
- `<output-location>/ios/` -> `public/icons/ios/`
- `<output-location>/icons.json` -> `public/icons/icons.json`

5) Ensure the app references the updated icons
- PWA manifest icons are configured in `vite.config.ts` (VitePWA `manifest.icons`). Update those entries if filenames/paths changed.
- Browser favicon + Apple touch icon tags are in `index.html` and should point at the new `public/icons/ios/*` images.
```