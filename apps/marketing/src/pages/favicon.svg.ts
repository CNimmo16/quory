import type { APIRoute } from "astro";
import icon from "../../../../packages/config/branding/quory-icon.svg?raw";

export const GET: APIRoute = () =>
  new Response(icon, {
    headers: { "Content-Type": "image/svg+xml" },
  });
