import { useSyncExternalStore, type SVGProps } from "react";
import { Moon, Sun } from "lucide-react";

function SystemThemeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={32 / 23}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx={7} cy={7} r={3} />
      <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.8 2.8l.7.7M10.5 10.5l.7.7M2.8 11.2l.7-.7M10.5 3.5l.7-.7" />
      <path d="M20 6 6 20" />
      <path d="M18 14a4 4 0 1 0 4 4 3 3 0 1 1-4-4Z" />
    </svg>
  );
}

const choices = [
  { value: "system", label: "System", Icon: SystemThemeIcon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

type Scheme = (typeof choices)[number]["value"];

declare global {
  interface Window {
    quoryColourScheme: {
      getSnapshot(): Scheme;
      subscribe(listener: () => void): () => void;
      set(value: Scheme): void;
    };
  }
}

const subscribe = (listener: () => void) =>
  window.quoryColourScheme.subscribe(listener);
const getSnapshot = () => window.quoryColourScheme.getSnapshot();
const getServerSnapshot = (): Scheme => "system";

export default function ColourSchemePicker() {
  const scheme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const currentIndex = choices.findIndex((choice) => choice.value === scheme);
  const current = choices[currentIndex]!;
  const next = choices[(currentIndex + 1) % choices.length]!;
  return (
    <button
      type="button"
      aria-label={`Colour scheme: ${current.label}. Switch to ${next.label}`}
      title={`Colour scheme: ${current.label}. Switch to ${next.label}`}
      onClick={() => window.quoryColourScheme.set(next.value)}
      className="inline-flex size-11 items-center justify-center text-muted-foreground select-none not-focus-visible:outline-none hover:bg-muted hover:text-foreground"
    >
      <current.Icon
        className={scheme === "system" ? "size-[23px]" : "size-4"}
        aria-hidden="true"
      />
    </button>
  );
}
