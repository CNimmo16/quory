// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as analytics from "./analytics";
import { initializeCloudSignup } from "./cloud-signup";

const signup = vi.hoisted(() => ({
  prepare: vi.fn(),
  submit: vi.fn(),
  message: vi.fn(),
}));
vi.mock("./signup", () => ({ signupForm: vi.fn(() => signup) }));
vi.mock("./analytics", () => ({
  trackCloudSignupViewed: vi.fn(),
  trackCloudSignupDismissed: vi.fn(),
  trackWaitlistStarted: vi.fn(),
  trackWaitlistSubmitAttempted: vi.fn(),
  trackWaitlistFailed: vi.fn(),
}));

let dialog: HTMLDialogElement;
let email: HTMLInputElement;
const context = { source: "download", installerId: "macos-arm64-dmg" };

function mount(homepage = false) {
  document.body.innerHTML = `
    ${homepage ? '<button id="cloud-interest-open">Open</button>' : '<section data-installer="macos-arm64-dmg"><h2 id="installation-title" tabindex="-1">Install</h2></section>'}
    <dialog ${homepage ? 'id="cloud-interest-dialog"' : "data-download-cloud"}>
      <button type="button" data-cloud-dismiss="close_button">Close</button>
      <form><input type="email" required><button type="submit">Sign up</button>
        <button type="button" data-cloud-dismiss="continue_to_installation">Continue</button>
      </form>
    </dialog>`;
  dialog = document.querySelector("dialog")!;
  email = dialog.querySelector("input")!;
  dialog.showModal = vi.fn(() => dialog.setAttribute("open", ""));
  dialog.close = vi.fn(() => {
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
  });
  initializeCloudSignup();
  if (!homepage) dialog.showModal();
}

beforeEach(() => {
  vi.clearAllMocks();
  signup.prepare.mockResolvedValue(undefined);
  signup.submit.mockResolvedValue("Check your email.");
  mount();
});

describe("cloud signup interactions", () => {
  it("counts engagement once after actual input, without counting focus", () => {
    email.focus();
    expect(analytics.trackWaitlistStarted).not.toHaveBeenCalled();
    email.value = "private@example.com";
    email.dispatchEvent(new Event("input"));
    email.dispatchEvent(new Event("input"));
    expect(vi.mocked(analytics.trackWaitlistStarted).mock.calls).toEqual([
      [context],
    ]);
  });

  it.each(["close_button", "continue_to_installation"])(
    "records dismissal by %s and restores instruction focus",
    (method) => {
      dialog
        .querySelector<HTMLButtonElement>(`[data-cloud-dismiss="${method}"]`)!
        .click();
      expect(vi.mocked(analytics.trackCloudSignupDismissed).mock.calls).toEqual(
        [[context, method, "not_started"]],
      );
      expect(document.activeElement?.id).toBe("installation-title");
    },
  );

  it("records Escape dismissal after engagement", () => {
    email.value = "private";
    email.dispatchEvent(new Event("input"));
    dialog.dispatchEvent(new Event("cancel"));
    dialog.close();
    expect(analytics.trackCloudSignupDismissed).toHaveBeenCalledWith(
      context,
      "escape",
      "started",
    );
  });

  it("records a backdrop dismissal", () => {
    dialog.dispatchEvent(new MouseEvent("click", { clientX: -1, clientY: -1 }));
    expect(analytics.trackCloudSignupDismissed).toHaveBeenCalledWith(
      context,
      "backdrop",
      "not_started",
    );
  });

  it.each([
    ["", "missing_email"],
    ["invalid", "invalid_email"],
  ])("records native validation failure as %s", (value, reason) => {
    email.value = value;
    dialog.querySelector<HTMLButtonElement>("[type=submit]")!.click();
    expect(
      vi.mocked(analytics.trackWaitlistSubmitAttempted).mock.calls,
    ).toEqual([[context]]);
    expect(vi.mocked(analytics.trackWaitlistFailed).mock.calls).toEqual([
      [context, reason],
    ]);
    expect(signup.submit).not.toHaveBeenCalled();
  });

  it("distinguishes closing after acceptance from abandonment", async () => {
    email.value = "private@example.com";
    dialog.querySelector<HTMLButtonElement>("[type=submit]")!.click();
    await vi.waitFor(() =>
      expect(signup.message).toHaveBeenCalledWith("Check your email."),
    );
    dialog.close();
    expect(analytics.trackCloudSignupDismissed).toHaveBeenCalledWith(
      context,
      "other",
      "submitted",
    );
  });

  it("records dismissal during submission and ignores the late response in the closed dialog", async () => {
    let accept!: (message: string) => void;
    signup.submit.mockReturnValueOnce(
      new Promise((resolve) => {
        accept = resolve;
      }),
    );
    email.value = "private@example.com";
    dialog.querySelector<HTMLButtonElement>("[type=submit]")!.click();
    dialog.close();
    expect(analytics.trackCloudSignupDismissed).toHaveBeenCalledWith(
      context,
      "other",
      "submitting",
    );
    accept("Check your email.");
    await Promise.resolve();
    expect(signup.message).not.toHaveBeenCalledWith("Check your email.");
  });

  it("records homepage dialog views and resets engagement for each opening", () => {
    mount(true);
    const trigger = document.querySelector<HTMLButtonElement>(
      "#cloud-interest-open",
    )!;
    trigger.click();
    expect(analytics.trackCloudSignupViewed).toHaveBeenCalledWith({
      source: "cloud",
      installerId: undefined,
    });
    email.value = "private@example.com";
    email.dispatchEvent(new Event("input"));
    dialog.close();
    trigger.click();
    email.value = "private@example.com";
    email.dispatchEvent(new Event("input"));
    expect(analytics.trackWaitlistStarted).toHaveBeenCalledTimes(2);
  });
});
