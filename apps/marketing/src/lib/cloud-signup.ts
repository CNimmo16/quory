import { signupForm } from "./signup";
import {
  trackCloudSignupViewed,
  trackCloudSignupDismissed,
  trackWaitlistStarted,
  trackWaitlistSubmitAttempted,
  trackWaitlistFailed,
  type SignupContext,
  type SignupState,
  type SignupDismissMethod,
} from "./analytics";

export function initializeCloudSignup() {
  const dialog = document.querySelector<HTMLDialogElement>(
    "#cloud-interest-dialog, dialog[data-download-cloud]",
  );
  const trigger = document.querySelector<HTMLButtonElement>(
    "#cloud-interest-open",
  );
  if (dialog) {
    const preview = document.querySelector<HTMLDialogElement>(
      "dialog[data-download-cloud]",
    );
    function focusInstructions() {
      document
        .querySelector<HTMLElement>("#installation-title")
        ?.focus({ preventScroll: true });
    }
    const form = dialog.querySelector<HTMLFormElement>("form")!;
    const context: SignupContext = {
      source: preview ? "download" : "cloud",
      installerId: preview
        ? document.querySelector<HTMLElement>("[data-installer]")?.dataset
            .installer
        : undefined,
    };
    const signup = signupForm(form, context);
    const submit = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    let sending = false;
    let generation = 0;
    let verificationStarted = false;
    let state: SignupState = "not_started";
    let engaged = false;
    let dismissMethod: SignupDismissMethod = "other";
    const email = form.querySelector<HTMLInputElement>("input[type=email]")!;
    email.addEventListener("input", () => {
      if (!dialog.open || engaged || !email.value.trim()) return;
      engaged = true;
      state = "started";
      trackWaitlistStarted(context);
    });
    email.addEventListener("invalid", () => {
      trackWaitlistSubmitAttempted(context);
      trackWaitlistFailed(
        context,
        email.validity.valueMissing ? "missing_email" : "invalid_email",
      );
    });
    function prepareSignup() {
      verificationStarted = true;
      void signup.prepare();
    }
    form.querySelector("input[type=email]")!.addEventListener("focus", () => {
      if (!verificationStarted) prepareSignup();
    });
    trigger?.addEventListener("click", () => {
      state = "not_started";
      engaged = false;
      dismissMethod = "other";
      signup.message("");
      dialog.showModal();
      trackCloudSignupViewed(context);
      prepareSignup();
    });
    dialog.addEventListener("close", () => {
      trackCloudSignupDismissed(context, dismissMethod, state);
      generation++;
      sending = false;
      submit.disabled = false;
      form.reset();
      if (preview) focusInstructions();
    });
    dialog.addEventListener("cancel", () => {
      dismissMethod = "escape";
    });
    dialog
      .querySelectorAll(".dialog-close, [data-cloud-dismiss]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          dismissMethod =
            (button as HTMLElement).dataset.cloudDismiss ===
            "continue_to_installation"
              ? "continue_to_installation"
              : "close_button";
          dialog.close();
        });
      });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        dismissMethod = "backdrop";
        dialog.close();
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending) return;
      const current = generation;
      sending = true;
      state = "submitting";
      submit.disabled = true;
      if (!verificationStarted) prepareSignup();
      signup.message("Sending your confirmation email…");
      try {
        const message = await signup.submit(email.value);
        if (current === generation && dialog.open) {
          state = "submitted";
          signup.message(message);
          form.reset();
        }
      } catch (error) {
        if (current === generation && dialog.open) {
          state = engaged ? "started" : "not_started";
          signup.message(
            error instanceof Error
              ? error.message
              : "Signup failed. Please try again.",
            true,
          );
        }
      } finally {
        if (current === generation) {
          sending = false;
          submit.disabled = false;
          void signup.prepare();
        }
      }
    });
  }
}
