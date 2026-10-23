import { useEffect, useState, type CSSProperties } from "react";
import { Settings } from "lucide-react";
import { AISettings } from "./AISettings";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useAppSettings } from "./SettingsProvider";
import trpc from "../util/tprc";
import type { Preferences } from "../../../shared/settings";

const sections = [
  "AI",
  "Appearance",
  "Privacy & diagnostics",
  "About",
] as const;
type Section = (typeof sections)[number];
const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function SettingsMenu() {
  const settings = useAppSettings();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setOrigin(null);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  if (!settings) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="ml-3 size-7 shrink-0"
        aria-label="Settings"
        title="Settings (⌘/Ctrl+,)"
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setOrigin({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          });
          setOpen(true);
        }}
      >
        <Settings className="size-4" />
      </Button>
      <DialogContent
        className="settings-dialog ph-no-capture flex h-[min(680px,85dvh)] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        style={
          {
            transformOrigin: origin
              ? `calc(50% + ${origin.x - window.innerWidth / 2}px) calc(50% + ${origin.y - window.innerHeight / 2}px)`
              : "center",
            "--settings-enter-x": `${origin ? Math.max(-24, Math.min(24, (origin.x - window.innerWidth / 2) * 0.08)) : 0}px`,
            "--settings-enter-y": `${origin ? Math.max(-16, Math.min(16, (origin.y - window.innerHeight / 2) * 0.08)) : 0}px`,
          } as CSSProperties
        }
      >
        <div className="shrink-0 border-b px-6 py-5">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="mt-2">
            Preferences for Quory on this device, across all projects.
          </DialogDescription>
        </div>
        {settings.error ? (
          <div className="p-6" role="alert">
            <p>Could not load settings. {settings.error.message}</p>
            <Button onClick={() => void settings.refetch()}>Try again</Button>
          </div>
        ) : settings.data ? (
          <SettingsContent
            key={open ? "open" : "closed"}
            data={settings.data}
            refresh={() => settings.refetch()}
          />
        ) : (
          <p className="p-6" role="status">
            Loading settings…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SettingsData = NonNullable<
  NonNullable<ReturnType<typeof useAppSettings>>["data"]
>;
function SettingsContent({
  data,
  refresh,
}: {
  data: SettingsData;
  refresh: () => Promise<unknown>;
}) {
  const [section, setSection] = useState<Section>("AI");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const savePreferences = trpc.settings.savePreferences.useMutation();
  const openLink = trpc.settings.openLink.useMutation();
  const openLogs = trpc.settings.openLogs.useMutation();
  const copyDiagnostics = trpc.settings.copyDiagnostics.useMutation();
  async function perform(action: () => Promise<unknown>, success = "") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  function updatePreferences(next: Preferences) {
    void perform(async () => {
      await savePreferences.mutateAsync(next);
      await refresh();
    }, "Preferences saved.");
  }
  const { appearance, privacy } = data.preferences;
  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <nav
        aria-label="Settings sections"
        className="flex shrink-0 flex-wrap gap-1 border-b bg-muted/30 p-3 sm:w-60 sm:flex-col sm:flex-nowrap sm:overflow-y-auto sm:border-r sm:border-b-0"
      >
        {sections.map((item) => (
          <Button
            key={item}
            variant={section === item ? "secondary" : "ghost"}
            className="shrink-0 justify-start whitespace-nowrap text-left"
            aria-pressed={section === item}
            onClick={() => {
              setSection(item);
              setError("");
              setMessage("");
            }}
          >
            {item}
          </Button>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold">
          {section === "AI" ? "AI assistant" : section}
        </h2>
        <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
          {section === "AI" && (
            <AISettings
              ai={data.ai}
              secureStorageAvailable={data.secureStorageAvailable}
              onSaved={refresh}
            />
          )}
          {section === "Appearance" && (
            <>
              <label className="block space-y-2 text-sm">
                Theme
                <select
                  className={fieldClass}
                  value={appearance.theme}
                  onChange={(event) =>
                    updatePreferences({
                      ...data.preferences,
                      appearance: {
                        ...appearance,
                        theme: event.target
                          .value as Preferences["appearance"]["theme"],
                      },
                    })
                  }
                >
                  <option value="system">Use system setting</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                Editor font size
                <select
                  className={fieldClass}
                  value={appearance.editorFontSize}
                  onChange={(event) =>
                    updatePreferences({
                      ...data.preferences,
                      appearance: {
                        ...appearance,
                        editorFontSize: Number(event.target.value),
                      },
                    })
                  }
                >
                  {Array.from({ length: 15 }, (_, i) => i + 10).map((size) => (
                    <option key={size} value={size}>
                      {size} px
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                Results table density
                <select
                  className={fieldClass}
                  value={appearance.density}
                  onChange={(event) =>
                    updatePreferences({
                      ...data.preferences,
                      appearance: {
                        ...appearance,
                        density: event.target
                          .value as Preferences["appearance"]["density"],
                      },
                    })
                  }
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Changes apply immediately and are saved on this device.
              </p>
            </>
          )}
          {section === "Privacy & diagnostics" && (
            <>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={privacy.analytics}
                  onChange={(event) =>
                    updatePreferences({
                      ...data.preferences,
                      privacy: { ...privacy, analytics: event.target.checked },
                    })
                  }
                />
                <span>
                  Share usage analytics and masked session recordings
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Helps improve Quory. Text and input values are masked in
                    recordings.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={privacy.errors}
                  onChange={(event) =>
                    updatePreferences({
                      ...data.preferences,
                      privacy: { ...privacy, errors: event.target.checked },
                    })
                  }
                />
                <span>
                  Send error reports
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Reports app failures to help diagnose bugs. Controlled
                    separately from analytics.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void perform(() => openLogs.mutateAsync())}
                >
                  Open logs folder
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void perform(
                      () => copyDiagnostics.mutateAsync(),
                      "Diagnostic information copied.",
                    )
                  }
                >
                  Copy diagnostic information
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copied diagnostics contain only app and runtime versions,
                operating system, and CPU architecture. Review any logs before
                sharing them.
              </p>
            </>
          )}
          {section === "About" && (
            <>
              <div>
                <p className="text-2xl font-semibold">Quory</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Version {data.version} · {data.platform}
                </p>
              </div>
              <Button
                onClick={() =>
                  void perform(() => openLink.mutateAsync("updates"))
                }
              >
                Check for updates
              </Button>
              <p className="text-xs text-muted-foreground">
                Opens the latest GitHub release so you can compare versions and
                download an update.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["releases", "Release notes"],
                    ["docs", "Documentation"],
                    ["issue", "Report an issue"],
                  ] as const
                ).map(([link, label]) => (
                  <Button
                    key={link}
                    variant="outline"
                    onClick={() =>
                      void perform(() => openLink.mutateAsync(link))
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </fieldset>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            Working…
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-primary-emphasis">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
