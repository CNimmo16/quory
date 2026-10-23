import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import trpc from "../util/tprc";
import {
  endpointSchema,
  providerSchema,
  type AISettingsPublic,
  type ModelDiscovery,
  type Provider,
} from "../../../shared/settings";

const names: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  custom: "Custom (OpenAI-compatible)",
};
const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
type Draft = {
  model: string;
  baseURL: string;
  apiKey: string;
  manual: boolean;
};
export function AISettings({
  ai,
  secureStorageAvailable,
  onSaved,
}: {
  ai: AISettingsPublic;
  secureStorageAvailable: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [active, setActive] = useState(ai);
  useEffect(() => setActive(ai), [ai]);
  const [provider, setProvider] = useState<Provider>(ai.provider);
  const [drafts, setDrafts] = useState(
    () =>
      Object.fromEntries(
        providerSchema.options.map((p) => [
          p,
          {
            model: ai.profiles[p].model,
            baseURL: ai.profiles[p].baseURL || "",
            apiKey: "",
            manual: false,
          },
        ]),
      ) as Record<Provider, Draft>,
  );
  const draft = drafts[provider];
  const patch = (changes: Partial<Draft>) =>
    setDrafts((previous) => ({
      ...previous,
      [provider]: { ...previous[provider], ...changes },
    }));
  const [models, setModels] = useState<ModelDiscovery | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  const discover = trpc.settings.models.useMutation({ gcTime: 0 });
  const save = trpc.settings.saveAI.useMutation({ gcTime: 0 });
  const remove = trpc.settings.removeKey.useMutation();
  const test = trpc.settings.testAI.useMutation();
  const parsedEndpoint = endpointSchema.safeParse(draft.baseURL);
  const baseURL =
    provider === "custom" && parsedEndpoint.success
      ? parsedEndpoint.data
      : undefined;
  const savedProfile = active.profiles[provider];
  const sameEndpoint =
    provider !== "custom" || baseURL === savedProfile.baseURL;
  const hasSavedKey = sameEndpoint && savedProfile.hasSavedKey;
  const hasKey =
    hasSavedKey || (sameEndpoint && savedProfile.hasEnvironmentKey);
  const unchanged =
    provider === active.provider &&
    draft.model === active.model &&
    !draft.apiKey &&
    (provider !== "custom" || baseURL === active.baseURL);
  const canSave =
    !!draft.model.trim() &&
    (provider !== "custom" || !!baseURL) &&
    (!draft.apiKey || secureStorageAvailable);

  // Credentials remain in the main process for automatic requests. An entered
  // replacement key is used only when the user explicitly refreshes the list.
  const load = discover.mutateAsync;
  useEffect(() => {
    const requests = generation.current;
    const request = ++requests.value;
    setModels(null);
    setModelsError("");
    if (provider === "custom" && !baseURL) {
      setLoadingModels(false);
      return;
    }
    setLoadingModels(true);
    const timer = setTimeout(() => {
      void load({ provider, ...(baseURL ? { baseURL } : {}) })
        .then((result) => {
          if (generation.current.value === request) setModels(result);
        })
        .catch(() => {
          if (generation.current.value === request)
            setModelsError(
              "Could not load models. Refresh the list or enter a model ID manually.",
            );
        })
        .finally(() => {
          if (generation.current.value === request) setLoadingModels(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      requests.value++;
    };
  }, [provider, baseURL, hasSavedKey, load]);

  async function refreshModels() {
    const request = ++generation.current.value;
    setLoadingModels(true);
    setModelsError("");
    try {
      const result = await load({
        provider,
        ...(baseURL ? { baseURL } : {}),
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      });
      if (generation.current.value === request) setModels(result);
    } catch {
      if (generation.current.value === request)
        setModelsError(
          "Could not load models. Check your key and endpoint, or enter a model ID manually.",
        );
    } finally {
      if (generation.current.value === request) setLoadingModels(false);
    }
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save AI settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
      <p className="text-sm text-muted-foreground">
        Each provider remembers its model and encrypted key. Your saved
        providers stay available when you switch.
      </p>
      <p className="text-sm font-medium">
        Active provider: {names[active.provider]}
      </p>
      <label className="block space-y-2 text-sm">
        Provider
        <select
          className={fieldClass}
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as Provider);
            setModels(null);
            setError("");
            setMessage("");
          }}
        >
          {providerSchema.options.map((p) => (
            <option key={p} value={p}>
              {names[p]}
              {active.profiles[p].hasSavedKey ? " · key saved" : ""}
            </option>
          ))}
        </select>
      </label>
      {provider === "custom" && (
        <>
          <label className="block space-y-2 text-sm">
            API base URL
            <Input
              value={draft.baseURL}
              onChange={(event) => patch({ baseURL: event.target.value })}
              placeholder="http://localhost:1234/v1"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Use an OpenAI-compatible Chat Completions API base URL, including
            /v1 if required. Your key and AI requests go to this address.
            Changing it does not reuse another endpoint’s saved key.
          </p>
        </>
      )}
      <label className="block space-y-2 text-sm">
        Model
        <select
          className={fieldClass}
          value={draft.manual ? "__manual__" : draft.model}
          onChange={(event) =>
            event.target.value === "__manual__"
              ? patch({ manual: true })
              : patch({ model: event.target.value, manual: false })
          }
        >
          <option value="" disabled>
            {loadingModels ? "Loading models…" : "Choose a model"}
          </option>
          {draft.model && !models?.models.some((m) => m.id === draft.model) && (
            <option value={draft.model}>{draft.model} (saved or manual)</option>
          )}
          {models?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name === m.id ? m.id : `${m.name} — ${m.id}`}
            </option>
          ))}
          <option value="__manual__">Enter a model ID manually…</option>
        </select>
      </label>
      {draft.manual && (
        <label className="block space-y-2 text-sm">
          Manual model ID
          <Input
            value={draft.model}
            onChange={(event) => patch({ model: event.target.value })}
            placeholder="Enter the exact model ID"
            autoComplete="off"
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={loadingModels || (provider === "custom" && !baseURL)}
          onClick={() => void refreshModels()}
        >
          Refresh models
        </Button>
        <span className="text-xs text-muted-foreground" role="status">
          {loadingModels
            ? "Loading models…"
            : models
              ? `${models.models.length} ${models.models.length === 1 ? "model" : "models"} · ${models.source === "catalog" ? "Live catalogue from models.dev" : "From your provider"}`
              : provider === "custom" && !baseURL
                ? "Enter an API base URL to discover models."
                : "Manual model IDs are always supported."}
        </span>
      </div>
      {models?.notice && (
        <p className="text-xs text-muted-foreground">{models.notice}</p>
      )}
      {modelsError && (
        <p className="text-xs text-muted-foreground" role="status">
          {modelsError}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Choose a text model with tool calling. Refresh uses the entered key, or
        your saved key, to load your account’s models. Catalogue entries may not
        be available to your account; test the connection after saving.
      </p>
      <label className="block space-y-2 text-sm">
        API key
        <Input
          type="password"
          value={draft.apiKey}
          onChange={(event) => patch({ apiKey: event.target.value })}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            hasSavedKey
              ? "Key saved securely · enter a replacement"
              : provider === "custom"
                ? "Optional if your endpoint requires no key"
                : "Enter your API key"
          }
        />
      </label>
      {hasSavedKey && (
        <p className="text-xs text-muted-foreground">
          A key is saved for this provider
          {provider === "custom" ? " and endpoint" : ""}. Leave the field empty
          to keep using it.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Keys are encrypted using your operating system’s secure storage and are
        never displayed again. Provider requests may incur charges.
      </p>
      {!secureStorageAvailable && (
        <p role="status" className="text-sm text-destructive">
          Secure key storage is unavailable. Unlock your keychain or configure a
          Linux secret service to save a key.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canSave}
          onClick={() =>
            void perform(async () => {
              const result = await save.mutateAsync({
                provider,
                model: draft.model,
                ...(baseURL ? { baseURL } : {}),
                ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
              });
              setActive(result);
              patch({ apiKey: "" });
              await onSaved();
              setMessage(
                `${names[provider]} is now the active provider. Its saved key will be reused when you return.`,
              );
            })
          }
        >
          Save and use{" "}
          {provider === "custom" ? "custom endpoint" : names[provider]}
        </Button>
        <Button
          variant="outline"
          disabled={!unchanged || (!hasKey && provider !== "custom")}
          onClick={() =>
            void perform(async () => {
              const result = await test.mutateAsync();
              if (!result.success) throw new Error(result.message);
              setMessage(result.message);
            })
          }
        >
          Test connection
        </Button>
        <Button
          variant="ghost"
          disabled={!hasSavedKey}
          onClick={() =>
            void perform(async () => {
              const result = await remove.mutateAsync(
                provider === "custom" ? { provider, baseURL } : provider,
              );
              setActive(result);
              await onSaved();
              setMessage("Saved key removed for this provider.");
            })
          }
        >
          Remove saved key
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Save and use saves only the selected provider’s settings and makes it
        active. Other providers keep their saved settings. Save changes before
        testing.
      </p>
      <p className="text-xs text-muted-foreground">
        During chats, Quory sends the database schema, conversation, and query
        definition to the selected provider; it does not send result rows or
        database credentials.
      </p>
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
    </fieldset>
  );
}
