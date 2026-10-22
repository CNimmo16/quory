# Marketing styling

- Use Tailwind utilities by default for component styling, responsive layouts,
  and interaction states. Reuse the shared theme tokens configured in
  `tailwind.config.cjs`.
- Do not introduce CSS modules. Keep custom CSS for cases utilities cannot
  reasonably express, such as animation keyframes and third-party documentation
  theme overrides, in the existing stylesheets under `src/styles/`.
