import { describe, expect, it, vi } from "vitest";
import { SessionOwner } from "./SessionOwner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const session = () => ({ dispose: vi.fn().mockResolvedValue(undefined) });

describe("application session ownership", () => {
  it("replaces and disconnects each session exactly once", async () => {
    const owner = new SessionOwner<ReturnType<typeof session>>();
    const first = session(),
      second = session();
    await owner.connect("a", async () => first);
    await owner.connect("b", async () => second);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(await owner.get()).toBe(second);
    await owner.disconnect();
    await owner.disconnect();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    await expect(owner.get()).rejects.toThrow("Connect");
  });

  it("cleans late initialization without closing a newer session", async () => {
    const owner = new SessionOwner<ReturnType<typeof session>>();
    const late = deferred<ReturnType<typeof session>>();
    const first = session(),
      second = session();
    const pending = owner.connect("a", () => late.promise);
    const rejection = expect(pending).rejects.toThrow("superseded");
    await owner.connect("b", async () => second);
    late.resolve(first);
    await rejection;
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    expect(await owner.get()).toBe(second);
  });

  it("waits for initialization at shutdown and rejects future connects", async () => {
    const owner = new SessionOwner<ReturnType<typeof session>>();
    const late = deferred<ReturnType<typeof session>>();
    const first = session();
    const rejection = expect(
      owner.connect("a", () => late.promise)
    ).rejects.toThrow("superseded");
    let finished = false;
    const shutdown = owner.shutdown().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    late.resolve(first);
    await rejection;
    await shutdown;
    expect(first.dispose).toHaveBeenCalledTimes(1);
    await expect(owner.connect("b", async () => session())).rejects.toThrow(
      "shutting down"
    );
  });

  it("keeps the current session when a replacement fails", async () => {
    const owner = new SessionOwner<ReturnType<typeof session>>();
    const first = session();
    await owner.connect("a", async () => first);
    await expect(
      owner.connect("b", async () => {
        throw new Error("failed");
      })
    ).rejects.toThrow("failed");
    expect(await owner.get()).toBe(first);
    expect(owner.connectionId).toBe("a");
    expect(first.dispose).not.toHaveBeenCalled();
  });

  it("deleting an unrelated connection does not interrupt initialization", async () => {
    const owner = new SessionOwner<ReturnType<typeof session>>();
    const late = deferred<ReturnType<typeof session>>();
    const first = session();
    const pending = owner.connect("b", () => late.promise);
    await owner.disconnect("a");
    late.resolve(first);
    expect(await pending).toBe(first);
    expect(first.dispose).not.toHaveBeenCalled();
  });
});

it("deleting the previous connection preserves a different pending switch", async () => {
  const owner = new SessionOwner<ReturnType<typeof session>>();
  const first = session(),
    second = session();
  const late = deferred<ReturnType<typeof session>>();
  await owner.connect("a", async () => first);
  const pending = owner.connect("b", () => late.promise);
  await owner.disconnect("a");
  late.resolve(second);
  expect(await pending).toBe(second);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(second.dispose).not.toHaveBeenCalled();
});

it("a switch during previous-session disposal cannot return the wrong session", async () => {
  const owner = new SessionOwner<ReturnType<typeof session>>();
  const closing = deferred<void>();
  const first = { dispose: vi.fn(() => closing.promise) };
  const second = session(),
    third = session();
  await owner.connect("a", async () => first);
  const pending = owner.connect("b", async () => second);
  const rejection = expect(pending).rejects.toThrow("superseded");
  await Promise.resolve();
  await owner.connect("c", async () => third);
  closing.resolve();
  await rejection;
  expect(second.dispose).toHaveBeenCalledTimes(1);
  expect(await owner.get()).toBe(third);
});
