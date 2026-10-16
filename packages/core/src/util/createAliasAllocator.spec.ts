import { expect, it } from "vitest";
import createAliasAllocator from "./createAliasAllocator";

it("preserves readable names and disambiguates duplicates and literal suffixes", () => {
  const allocate = createAliasAllocator();
  expect(allocate("public__order_fulfilment")).toBe("public__order_fulfilment");
  expect(allocate("public__order_fulfilment__2")).toBe(
    "public__order_fulfilment__2",
  );
  expect(allocate("public__order_fulfilment")).toBe(
    "public__order_fulfilment__3",
  );
  expect(allocate("PUBLIC__ORDER_FULFILMENT")).toBe(
    "PUBLIC__ORDER_FULFILMENT__4",
  );
});

it("shortens long Unicode identifiers deterministically within 63 UTF-8 bytes", () => {
  const name = `public__${"fulfilment_雪".repeat(8)}__created_at`;
  const allocate = createAliasAllocator();
  const first = allocate(name);
  const second = allocate(name);
  expect(first).toMatch(/^public__.*created_at__[0-9a-f]{8}$/);
  expect(second).toMatch(/__[0-9a-f]{8}__2$/);
  expect(createAliasAllocator()(name)).toBe(first);
  expect(allocate(name.replace("雪", "雨"))).not.toBe(first);
  for (const alias of [first, second]) {
    expect(new TextEncoder().encode(alias).length).toBeLessThanOrEqual(63);
    expect(alias).not.toContain("\uFFFD");
  }
});

it("checks collisions between a shortened alias and an existing literal identifier", () => {
  const name = "public__" + "long_table_name_".repeat(10);
  const shortened = createAliasAllocator()(name);
  const allocate = createAliasAllocator();
  expect(allocate(shortened)).toBe(shortened);
  expect(allocate(name)).not.toBe(shortened);
});
