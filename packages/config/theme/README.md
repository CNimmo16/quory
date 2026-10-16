# Shared theme

Both the Electron renderer and Astro marketing site consume `tailwind.preset.cjs`.

- Edit hex values in `palette.json`. The preset converts them to RGB CSS variables and exposes semantic Tailwind utilities such as `bg-background`, `text-foreground`, `bg-primary`, `text-secondary-emphasis`, and `border-border`. Opacity modifiers work (`bg-primary/10`).
- Edit Google Fonts imports and font stacks in `fonts.css`. `font-sans` uses Ubuntu, `font-mono` uses Share Tech Mono, and `font-display` uses Teko. Only marketing uses `font-display`. Code and numeric data use `font-mono`.
- Both apps follow the operating system colour scheme. Add `.light` or `.dark` to the document root to override it. Dark mode swaps the specified background/foreground values and supplies matching surfaces, borders, and readable accent text.
- `dark:` utilities follow the same rules: they apply for a dark system preference unless the root has `.light`, or whenever the root has `.dark`.
- `primary` and `secondary` are the brand accents. Their `subtle` and `emphasis` tokens provide tinted surfaces and readable text in each mode. Status colours use `success`, `warning`, and `destructive`. `connection-1` through `connection-10` preserve user-selected connection identities independently of the UI theme.

Fonts load from Google Fonts, with local generic fallbacks when offline. The Electron content security policy allows only the required Google stylesheet and font hosts.
