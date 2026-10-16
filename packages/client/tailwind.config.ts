import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import sharedTheme from "../config/theme/tailwind.preset.cjs";

export default {
  presets: [sharedTheme],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
