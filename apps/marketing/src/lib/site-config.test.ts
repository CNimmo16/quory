import { describe, expect, it } from "vitest";
import { siteSettings } from "../../scripts/site-config.mjs";

describe("site domain configuration", () => {
  it("derives the canonical HTTPS URL from a normalized domain", () => {
    expect(siteSettings(" Quory.Example ")).toEqual({
      SITE_DOMAIN: "quory.example",
      SITE_URL: "https://quory.example",
    });
    expect(siteSettings("app.quory.example").SITE_URL).toBe(
      "https://app.quory.example",
    );
  });
  it.each([
    undefined,
    "",
    "https://quory.example",
    "quory.example/path",
    "quory.example:443",
    "hello@quory.example",
    "quory.example?test",
    "quory.example#test",
    "quory.example\r\nBcc: test@example.com",
    "-quory.example",
    "quory-.example",
    "localhost",
  ])("rejects invalid domain %s", (domain) => {
    expect(() => siteSettings(domain)).toThrow("SITE_DOMAIN");
  });
});
