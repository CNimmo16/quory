import { expect, it } from "vitest";
import { filterRelatedTables } from "./filterRelatedTables";

it("ranks exact names, prefixes, word boundaries and substrings ahead of schema-only matches", () => {
  const tables = [
    ["phone", "users"],
    ["public", "microphone"],
    ["public", "user_phone_number"],
    ["public", "phone_numbers"],
    ["public", "phone"],
    ["public", "orders"],
  ] as const;
  expect(
    filterRelatedTables([...tables], " PHONE ").map(([, name]) => name),
  ).toEqual([
    "phone",
    "phone_numbers",
    "user_phone_number",
    "microphone",
    "users",
  ]);
});

it("prefers earlier and shorter matches and resolves ties alphabetically", () => {
  expect(
    filterRelatedTables(
      [
        ["public", "user_phone_numbers"],
        ["public", "account_phone"],
        ["public", "user_phone_number"],
        ["public", "phone_z"],
        ["public", "phone_a"],
      ],
      "phone",
    ).map(([, name]) => name),
  ).toEqual([
    "phone_a",
    "phone_z",
    "user_phone_number",
    "user_phone_numbers",
    "account_phone",
  ]);
});

it("matches qualified names and preserves the original order for an empty search", () => {
  const tables = [
    ["public", "phone_numbers"],
    ["public", "phone"],
    ["other", "phone"],
  ] as const;
  expect(filterRelatedTables([...tables], "public.phone")).toEqual([
    tables[1],
    tables[0],
  ]);
  expect(filterRelatedTables([...tables], " ")).toEqual(tables);
});
