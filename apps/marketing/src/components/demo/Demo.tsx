import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDot,
  Database,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { QuoryProvider, TooltipProvider } from "@quory/stack/react";
import {
  DemoSession,
  demoRequest,
  type DemoDatabase,
} from "../../lib/demo/session";
import { examplePlan, exampleProducts } from "../../lib/demo/examples";
import Workspace from "./Workspace";

const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40";
export default function Demo() {
  return (
    <div data-demo-app>
      <DemoContent />
    </div>
  );
}

function DemoContent() {
  const [description, setDescription] = useState("");
  const [example, setExample] = useState<string | null>(null);
  const [phase, setPhase] = useState<"describe" | "loading" | "ready">(
    "describe",
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [database, setDatabase] = useState<DemoDatabase | null>(null);
  const [session, setSession] = useState<DemoSession | null>(null);
  const current = useRef<DemoSession | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      current.current?.dispose();
    },
    [],
  );
  function reset() {
    abort.current?.abort();
    current.current?.dispose();
    current.current = null;
    setSession(null);
    setDatabase(null);
    setPhase("describe");
    setError("");
    setProgress(0);
    requestAnimationFrame(() => input.current?.focus());
  }
  async function generate(
    productDescription = description,
    exampleId = example,
  ) {
    if (productDescription.trim().length < 3) return;
    setDescription(productDescription);
    setExample(exampleId);
    abort.current?.abort();
    current.current?.dispose();
    const controller = new AbortController();
    const generationSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(9_500),
    ]);
    let stepStartedAt = performance.now();
    const transitionDeadline = stepStartedAt + 9_000;
    async function advanceProgress(step: number) {
      // Give each step a short visible turn, without stretching a slow request
      // beyond the generation budget. Cancellation also prevents stale updates.
      const now = performance.now();
      const delay = Math.max(
        0,
        Math.min(300 - (now - stepStartedAt), transitionDeadline - now),
      );
      if (delay > 0)
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      generationSignal.throwIfAborted();
      if (step < 4) setProgress(step);
      stepStartedAt = performance.now();
    }
    abort.current = controller;
    setError("");
    setPhase("loading");
    setProgress(0);
    let next: DemoSession | undefined;
    try {
      next = new DemoSession();
      current.current = next;
      const [generation] = await Promise.all([
        exampleId
          ? Promise.resolve({ plan: examplePlan(exampleId) })
          : demoRequest(
              "generate",
              { description: productDescription.trim() },
              generationSignal,
            ),
        next.call("prepare", {}, generationSignal),
      ]);
      generationSignal.throwIfAborted();
      await advanceProgress(1);
      const data = await next.call<DemoDatabase>(
        "generate",
        { description: productDescription, ...generation },
        generationSignal,
      );
      generationSignal.throwIfAborted();
      await advanceProgress(2);
      await advanceProgress(3);
      await advanceProgress(4);
      setDatabase(data);
      setSession(next);
      setPhase("ready");
    } catch (cause) {
      next?.dispose();
      if (controller.signal.aborted) return;
      const timedOut = generationSignal.aborted;
      controller.abort();
      setError(
        timedOut
          ? "Generation took too long. Try again, or open an example product instantly."
          : cause instanceof Error
            ? cause.message
            : "We couldn’t create your database. Please try again.",
      );
      setPhase("describe");
    }
  }
  if (phase === "ready" && database && session)
    return (
      <QuoryProvider fetchFn={session.fetchFn}>
        <TooltipProvider delayDuration={250}>
          <Workspace
            database={database}
            description={description}
            example={!!example}
            onReset={reset}
          />
        </TooltipProvider>
      </QuoryProvider>
    );
  if (phase === "loading")
    return (
      <section
        className="mx-auto flex min-h-165 max-w-2xl flex-col items-center justify-center px-6 py-16 text-center"
        aria-labelledby="generation-title"
      >
        <div className="relative mb-9 flex size-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary-subtle text-primary-emphasis">
          <Database className="size-9" />
          <span className="absolute -right-2 -bottom-2 rounded-full border-4 border-background bg-primary p-2 text-primary-foreground">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          </span>
        </div>
        <p className="mb-4 text-[11px] font-semibold tracking-[.18em] text-primary-emphasis uppercase">
          A little world, built for you
        </p>
        <h1
          id="generation-title"
          className="font-display text-4xl leading-tight font-medium tracking-tight sm:text-5xl"
        >
          {example
            ? "Preparing your playground."
            : "Bringing your product to life."}
        </h1>
        <p className="mt-5 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        <ol
          className="mt-10 w-full max-w-sm space-y-4 text-left text-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          {[
            "Designing the tables and relationships",
            "Creating your browser database",
            "Filling it with fictional customers and activity",
            "Finding questions worth asking",
          ].map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-3 ${i > progress ? "text-muted-foreground/50" : "text-foreground"}`}
            >
              {i < progress ? (
                <Check className="size-5 text-primary-emphasis" />
              ) : i === progress ? (
                <LoaderCircle className="size-5 animate-spin text-primary-emphasis motion-reduce:animate-none" />
              ) : (
                <CircleDot className="size-5" />
              )}
              {label}
            </li>
          ))}
        </ol>
        <p role="status" className="mt-8 text-xs text-muted-foreground">
          {example ? "Ready in a moment." : "Ready in under 10 seconds."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
          Cancel
        </button>
      </section>
    );
  return (
    <section
      className="mx-auto w-[min(1100px,calc(100%-40px))] pt-14 pb-20 sm:pt-18 sm:pb-24"
      aria-labelledby="demo-title"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h1
          id="demo-title"
          className="mt-7 font-sans text-[clamp(24px,5vw,40px)] font-light text-primary-emphasis leading-snug"
        >
          Try Quory on data that resembles yours.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          Experience Quory's relationship engine on a realistic database that
          feels like your own, right here in your browser.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
        className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-card p-4 shadow-sm transition focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/5 sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <label
            htmlFor="product-description"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Sparkles className="size-4 text-primary-emphasis" />
            What are you building?
          </label>
        </div>
        <textarea
          ref={input}
          id="product-description"
          required
          minLength={3}
          maxLength={240}
          rows={2}
          value={description}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          onChange={(e) => {
            setDescription(e.target.value);
            setExample(null);
            setError("");
          }}
          placeholder="An online shop selling coffee and brewing equipment…"
          aria-describedby="product-description-help"
          className="block min-h-24 w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-lg"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <p
            id="product-description-help"
            className="text-xs text-muted-foreground"
          >
            {example
              ? "A ready-made example, with real queries."
              : "A brief description of your product. We’ll take it from there."}
          </p>
          <button
            className={primary}
            disabled={description.trim().length < 3}
            type="submit"
          >
            {example ? "Explore this example" : "Create my playground"}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </form>
      {error && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
        >
          {error}
        </div>
      )}
      <div className="mx-auto mt-7 max-w-2xl">
        <p className="mb-3 text-center text-xs text-muted-foreground">
          Or start with an example
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {exampleProducts.map((item) => {
            const Icon =
              item.icon === "shop"
                ? ShoppingBag
                : item.icon === "saas"
                  ? Layers3
                  : CheckCheck;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setDescription(item.description);
                  setExample(item.id);
                  setError("");
                  input.current?.focus();
                }}
                onDoubleClick={() => {
                  void generate(item.description, item.id);
                }}
                className={`group flex items-center gap-3 rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-primary-subtle ${example === item.id ? "border-primary/50 bg-primary-subtle" : "border-border bg-card"}`}
              >
                <Icon className="size-4 shrink-0 text-primary-emphasis" />
                <span className="flex-1 text-xs font-medium">{item.label}</span>
                <ChevronRight className="size-3 text-muted-foreground transition group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-2xl flex-wrap justify-center gap-x-7 gap-y-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <LockKeyhole className="size-3.5" />
          No signup. No connection strings.
        </span>
        <span className="flex items-center gap-2">
          <Database className="size-3.5" />
          Real SQLite in your browser.
        </span>
        <span className="flex items-center gap-2">
          <RotateCcw className="size-3.5" />A fictional but familiar database.
        </span>
      </div>
      <p className="mx-auto mt-5 max-w-xl text-center text-[10px] text-muted-foreground/80">
        Your description is sent to our AI provider to create sample data.
        Please keep it brief and leave out anything private.
      </p>
      <div className="mx-auto mt-14 flex max-w-2xl items-center justify-between gap-4 border-t border-border pt-5 text-xs">
        <p className="text-muted-foreground">
          Ready to get started on your own database?
        </p>
        <a
          href="/downloads/"
          className="inline-flex shrink-0 items-center gap-1 font-medium hover:text-primary-emphasis"
        >
          Get the desktop app
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </section>
  );
}
