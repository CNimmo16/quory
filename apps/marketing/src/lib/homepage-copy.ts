export const HOMEPAGE_COPY_FLAG = "marketing-homepage-copy-v1";

export const homepageCopy = {
  control: {
    eyebrow: "SQL is great. Writing joins isn't.",
    headline: "Get answers faster with Quory.",
    description: "Diagnose customer issues directly in your database - fast.",
  },
  support: {
    eyebrow: "Your database has the answers to support queries.",
    headline: "Stop digging. Start answering.",
    description:
      "Trace a customer's data across tables, understand what happened, and get back to building.",
  },
  "skip-the-joins": {
    eyebrow: "SQL is great. Writing joins isn't.",
    headline: "Get answers faster with Quory.",
    description:
      "Explore connected records in Postgres, MySQL, and SQLite without writing complex SQL.",
  },
} as const;

export type HomepageCopyVariant = keyof typeof homepageCopy;

export function isHomepageCopyVariant(
  value: unknown,
): value is HomepageCopyVariant {
  return typeof value === "string" && Object.hasOwn(homepageCopy, value);
}

export function renderHomepageCopy(
  variant: HomepageCopyVariant,
  root: ParentNode = document,
) {
  const eyebrow = root.querySelector("[data-copy-eyebrow]");
  const headline = root.querySelector("[data-copy-headline]");
  const description = root.querySelector("[data-copy-description]");
  if (!eyebrow || !headline || !description) return false;
  // Leave the server-rendered control (including its emphasis) intact.
  if (variant !== "control") {
    const copy = homepageCopy[variant];
    eyebrow.textContent = copy.eyebrow;
    headline.textContent = copy.headline;
    description.textContent = copy.description;
  }
  return true;
}
