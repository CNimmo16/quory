# Shared branding

These SVG assets are shared by the Electron client and Astro marketing app.
All assets have transparent backgrounds and use SVG paths, with no runtime font dependency.

- `quory-logo.svg`: primary colour, `#197278`, from `../theme/palette.json` (the same in both themes).
- `quory-logo-black.svg`: solid black, `#000000`.
- `quory-logo-white.svg`: solid white, `#FFFFFF`, for dark backgrounds.

The `quory-logo*` files are full wordmarks: the Q/wrench icon followed by `uory`
outlined directly from the Ubuntu Medium font (weight 500). The lettering uses
the font's original glyph shapes, uniformly scaled to font size 905 at baseline
915. Letter placement uses 80-unit gaps between visible glyph bounds, except
for the tighter 50-unit gap between `r` and `y`. The `u` starts at x=1095,
approximately 80 units after the Q icon. This preserves the smaller lettering
relative to the Q. Use these
wherever the full brand name is needed.

The matching `quory-icon.svg`, `quory-icon-black.svg`, and `quory-icon-white.svg`
files contain only the original square Q/wrench mark. Use these for favicons,
app icons, or compact surfaces. The original icon geometry is preserved.

The marketing header and footer use the full SVG wordmark. Its lettering renders
consistently without an installed font or web-font request.

Lettering source: `ufl/ubuntu/Ubuntu-Medium.ttf` in the Google Fonts repository,
copyright Canonical Ltd. See `Ubuntu-LICENCE.txt` for the Ubuntu Font Licence.

Import with `?url` so Vite bundles the asset for production. For example, from a
component in `packages/client/src/renderer/src/components`:

```tsx
import logoUrl from "../../../../../config/branding/quory-logo.svg?url";

<img src={logoUrl} alt="Quory" width={120} height={40} />;
```

From a layout in `apps/marketing/src/layouts`:

```astro
---
import logoUrl from "../../../../packages/config/branding/quory-logo.svg?url";
---

<img src={logoUrl} alt="Quory" width={120} height={40} />
```

Swap the filename to select an icon or a black or white variant. The primary SVG contains a
fixed fill for standalone use; update that fill when the palette's primary colour
changes. Keep the paths and viewBox identical across colour variants of each asset.
