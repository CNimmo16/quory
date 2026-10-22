// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as analytics from "./analytics";
import { signupForm } from "./signup";

vi.mock("./analytics", () => ({
  trackWaitlistSubmitAttempted: vi.fn(),
  trackWaitlistSubmitted: vi.fn(),
  trackWaitlistFailed: vi.fn(),
  trackWaitlistVerificationFailed: vi.fn(),
}));

const context = { source: "download" as const, installerId: "macos-arm64-dmg" };
const fetchSignup = vi.fn();
const verification = {
  render: vi.fn(
    (_container: HTMLElement, _options: Record<string, unknown>) => "widget",
  ),
  reset: vi.fn(),
  getResponse: vi.fn(() => "private-token"),
};
let form: HTMLFormElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchSignup);
  window.turnstile = verification;
  verification.getResponse.mockReturnValue("private-token");
  fetchSignup.mockResolvedValue({
    ok: true,
    json: async () => ({ message: "Check your email." }),
  });
  document.body.innerHTML = `<form><div data-signup-challenge data-sitekey="site-key"></div><p data-signup-status></p></form>`;
  form = document.querySelector("form")!;
});
afterEach(() => {
  delete window.turnstile;
  vi.unstubAllGlobals();
});

describe("signup funnel outcomes", () => {
  it("records attempts and API acceptance with the download context", async () => {
    const signup = signupForm(form, context);
    await signup.prepare();
    await signup.submit("private@example.com");
    expect(analytics.trackWaitlistSubmitAttempted).toHaveBeenCalledWith(
      context,
    );
    expect(analytics.trackWaitlistSubmitted).toHaveBeenCalledWith(context);
    expect(analytics.trackWaitlistFailed).not.toHaveBeenCalled();
    expect(JSON.parse(fetchSignup.mock.calls[0]![1].body)).toEqual({
      email: "private@example.com",
      source: "download",
      turnstileToken: "private-token",
    });
  });

  it.each([
    [429, "rate_limited"],
    [503, "server_error"],
    [400, "rejected"],
  ] as const)(
    "categorizes HTTP %s without sending the server's error text",
    async (status, reason) => {
      fetchSignup.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: "private@example.com secret-token" }),
      });
      const signup = signupForm(form, context);
      await signup.prepare();
      await expect(signup.submit("private@example.com")).rejects.toThrow();
      expect(vi.mocked(analytics.trackWaitlistFailed).mock.calls).toEqual([
        [context, reason],
      ]);
      expect(analytics.trackWaitlistSubmitted).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["TimeoutError", "timeout"],
    ["TypeError", "network_error"],
  ] as const)("categorizes %s", async (name, reason) => {
    fetchSignup.mockRejectedValue(
      Object.assign(new Error("private details"), { name }),
    );
    const signup = signupForm(form, context);
    await signup.prepare();
    await expect(signup.submit("private@example.com")).rejects.toThrow();
    expect(analytics.trackWaitlistFailed).toHaveBeenCalledWith(context, reason);
  });

  it("records verification-required attempts without making an API request", async () => {
    verification.getResponse.mockReturnValue("");
    const signup = signupForm(form, context);
    await signup.prepare();
    await expect(signup.submit("private@example.com")).rejects.toThrow(
      "verification",
    );
    expect(analytics.trackWaitlistFailed).toHaveBeenCalledWith(
      context,
      "verification_required",
    );
    expect(fetchSignup).not.toHaveBeenCalled();
  });

  it("deduplicates verification configuration failures before any submit attempt", async () => {
    form.querySelector<HTMLElement>(
      "[data-signup-challenge]",
    )!.dataset.sitekey = "";
    const signup = signupForm(form, context);
    await signup.prepare();
    await signup.prepare();
    expect(
      vi.mocked(analytics.trackWaitlistVerificationFailed).mock.calls,
    ).toEqual([[context, "unavailable"]]);
    expect(analytics.trackWaitlistSubmitAttempted).not.toHaveBeenCalled();
  });

  it("categorizes verification initialization errors without including their details", async () => {
    verification.render.mockImplementationOnce(() => {
      throw new Error("private-token");
    });
    const signup = signupForm(form, context);
    await signup.prepare();
    expect(analytics.trackWaitlistVerificationFailed).toHaveBeenCalledWith(
      context,
      "load_failed",
    );
  });

  it("deduplicates challenge errors from the verification widget", async () => {
    const signup = signupForm(form, context);
    await signup.prepare();
    const onError = verification.render.mock.calls[0]![1][
      "error-callback"
    ] as () => void;
    onError();
    onError();
    expect(
      vi.mocked(analytics.trackWaitlistVerificationFailed).mock.calls,
    ).toEqual([[context, "challenge_failed"]]);
  });
});
