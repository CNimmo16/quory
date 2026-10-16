// Use PostgreSQL's standard 63-byte limit across dialects so generated names
// remain portable. Count UTF-8 bytes, never split a Unicode code point.
const encoder = new TextEncoder();
const byteLength = (value: string) => encoder.encode(value).length;

function takeBytes(value: string, limit: number, fromEnd = false): string {
  const characters = Array.from(value);
  if (fromEnd) characters.reverse();
  const taken: string[] = [];
  let bytes = 0;
  for (const character of characters) {
    bytes += byteLength(character);
    if (bytes > limit) break;
    taken.push(character);
  }
  return (fromEnd ? taken.reverse() : taken).join("");
}

function shorten(name: string, limit: number): string {
  if (byteLength(name) <= limit) return name;
  // Hash the full original name, keeping both the table prefix and column tail
  // readable. The allocator also resolves hash collisions, rather than relying
  // on the hash alone for uniqueness.
  let hash = 2166136261;
  for (const byte of encoder.encode(name)) {
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  }
  const suffix = `__${hash.toString(16).padStart(8, "0")}`;
  const budget = limit - byteLength(suffix) - 2;
  const tailBudget = Math.floor(budget / 3);
  return `${takeBytes(name, budget - tailBudget)}__${takeBytes(
    name,
    tailBudget,
    true,
  )}${suffix}`;
}

/** Allocate one SQL identifier namespace, detecting delimiter, duplicate-name,
 * shortening, and case-insensitive collisions (including MySQL table aliases).
 * Return raw names: SQL generation must still quote every identifier.
 */
export default function createAliasAllocator() {
  const used = new Set<string>();
  return (name: string): string => {
    for (let occurrence = 1; ; occurrence++) {
      const suffix = occurrence === 1 ? "" : `__${occurrence}`;
      const candidate = shorten(name, 63 - byteLength(suffix)) + suffix;
      const key = candidate.toLowerCase();
      if (!used.has(key)) {
        used.add(key);
        return candidate;
      }
    }
  };
}
