// Tailwind 4 scans the Astro source automatically. This compatibility config
// shares the existing design tokens with the desktop app without duplicating them.
module.exports = {
  presets: [require("../../packages/config/theme/tailwind.preset.cjs")],
};
