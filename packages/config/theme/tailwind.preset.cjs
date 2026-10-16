const palette = require("./palette.json");

const variables = (tokens) =>
  Object.fromEntries(
    Object.entries(tokens).map(([name, hex]) => [
      `--${name}`,
      hex
        .slice(1)
        .match(/../g)
        .map((channel) => parseInt(channel, 16))
        .join(" "),
    ])
  );
const colors = Object.fromEntries(
  Object.keys(palette.light).map((name) => [
    name,
    `rgb(var(--${name}) / <alpha-value>)`,
  ])
);

module.exports = {
  darkMode: [
    "variant",
    [
      "&:where(.dark, .dark *)",
      "@media (prefers-color-scheme: dark) { &:where(:root:not(.light), :root:not(.light) *) }",
    ],
  ],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ":root": { ...variables(palette.light), "color-scheme": "light" },
        "@media (prefers-color-scheme: dark)": {
          ":root:not(.light)": {
            ...variables(palette.dark),
            "color-scheme": "dark",
          },
        },
        ".dark": { ...variables(palette.dark), "color-scheme": "dark" },
        ".light": { ...variables(palette.light), "color-scheme": "light" },
      }),
  ],
};
