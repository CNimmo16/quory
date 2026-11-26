import { CheckCircle2, Circle, ChevronDown, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import trpc from "../util/tprc";
import {
  endpointSchema,
  cloudflareAccountIdSchema,
  providerSchema,
  assistantProviderSchema,
  decisionProviderSchema,
  providerNames,
  type AISettingsPublic,
  type Provider,
  type ModelDiscovery,
  type AISettingsInput,
} from "../../../shared/settings";
import { decisionModels } from "../../../shared/decisionModels";

export const aiSettingsSections = [
  { id: "ai-providers", label: "Provider connections" },
  { id: "ai-assistant", label: "Quory model" },
  { id: "ai-decision", label: "Decision model" },
] as const;
export type AISettingsSection = (typeof aiSettingsSections)[number]["id"];

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
type Props = {
  ai: AISettingsPublic;
  secureStorageAvailable: boolean;
  onSaved: () => Promise<unknown>;
  onNavigate: (section: AISettingsSection) => void;
};
export function AISettings({
  ai,
  secureStorageAvailable,
  onSaved,
  onNavigate,
}: Props) {
  const [active, setActive] = useState(ai);
  useEffect(() => setActive(ai), [ai]);
  const [revision, setRevision] = useState(0);
  async function saved(result: AISettingsPublic) {
    setActive(result);
    setRevision((r) => r + 1);
    await onSaved();
  }
  return (
    <div className="space-y-8">
      <ProviderConnections
        ai={active}
        secureStorageAvailable={secureStorageAvailable}
        onSaved={saved}
      />
      <ModelSettings
        purpose="assistant"
        ai={active}
        revision={revision}
        onSaved={saved}
        onNavigate={onNavigate}
      />
      <ModelSettings
        purpose="decision"
        ai={active}
        revision={revision}
        onSaved={saved}
        onNavigate={onNavigate}
      />
      <p className="text-xs text-muted-foreground">
        During chats, Quory sends the database schema, conversation, and query
        definition to the provider configured for Quory; it does not send result
        rows or database credentials.
      </p>
    </div>
  );
}
function Feedback({ message, error }: { message: string; error: string }) {
  return (
    <>
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
    </>
  );
}
type ConnectionProps = Omit<Props, "onSaved" | "onNavigate"> & {
  onSaved: (result: AISettingsPublic) => Promise<void>;
};
function ProviderConnections(props: ConnectionProps) {
  const [editing, setEditing] = useState<Provider | null>(null);
  return (
    <section
      id="ai-providers"
      aria-labelledby="provider-connections-title"
      className="space-y-3"
    >
      <h3 id="provider-connections-title" className="text-sm font-semibold">
        Provider connections
      </h3>
      <p className="text-sm text-muted-foreground">
        Add credentials for any providers you want to use. Choose your models
        below.
      </p>
      <ul
        aria-label="Provider connections"
        className="divide-y rounded-md border"
      >
        {providerSchema.options.map((provider) => {
          const profile = props.ai.providers[provider];
          const credentialName =
            provider === "cloudflare" ? "API token" : "API key";
          const hasKey = profile.hasSavedKey || profile.hasEnvironmentKey;
          const configured =
            provider === "cloudflare"
              ? hasKey && !!profile.accountId
              : provider === "custom"
                ? !!profile.baseURL
                : hasKey;
          const status = hasKey
            ? provider === "cloudflare" && !profile.accountId
              ? "API token configured · account ID needed"
              : `${credentialName} configured`
            : provider === "custom" && profile.baseURL
              ? "Endpoint configured · no API key"
              : `No ${credentialName}`;
          return (
            <li key={provider}>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {providerNames[provider]}
                  </p>
                  <p
                    className={`flex items-center gap-1.5 text-xs ${configured ? "text-primary-emphasis" : "text-muted-foreground"}`}
                  >
                    {configured ? (
                      <CheckCircle2
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${providerNames[provider]} credentials`}
                  aria-expanded={editing === provider}
                  aria-controls={`provider-editor-${provider}`}
                  onClick={() =>
                    setEditing(editing === provider ? null : provider)
                  }
                >
                  {hasKey || configured ? "Edit" : "Add"}
                  <ChevronDown
                    className={`ml-1 size-4 transition-transform ${editing === provider ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </Button>
              </div>
              {editing === provider && (
                <div
                  id={`provider-editor-${provider}`}
                  className="border-t bg-muted/20 p-4"
                >
                  <ProviderEditor {...props} provider={provider} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
function ProviderEditor({
  ai,
  secureStorageAvailable,
  onSaved,
  provider,
}: ConnectionProps & { provider: Provider }) {
  const [draft, setDraft] = useState({
    apiKey: "",
    baseURL: ai.providers[provider].baseURL || "",
    accountId: ai.providers[provider].accountId || "",
  });
  const patch = (changes: Partial<typeof draft>) =>
    setDraft((previous) => ({ ...previous, ...changes }));
  const parsedAccount = cloudflareAccountIdSchema.safeParse(draft.accountId);
  const accountId =
    provider === "cloudflare" && parsedAccount.success
      ? parsedAccount.data
      : undefined;
  const parsed = endpointSchema.safeParse(draft.baseURL);
  const baseURL =
    provider === "custom" && parsed.success ? parsed.data : undefined;
  const profile = ai.providers[provider];
  const sameEndpoint = provider !== "custom" || baseURL === profile.baseURL;
  const hasSavedKey = sameEndpoint && profile.hasSavedKey;
  const hasKey = hasSavedKey || (sameEndpoint && profile.hasEnvironmentKey);
  const credentialName = provider === "cloudflare" ? "API token" : "API key";
  const save = trpc.settings.saveProvider.useMutation({ gcTime: 0 });
  const remove = trpc.settings.removeKey.useMutation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update provider.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
      <legend className="sr-only">{providerNames[provider]} credentials</legend>
      {provider === "cloudflare" && (
        <>
          <label className="block space-y-2 text-sm">
            Account ID
            <Input
              value={draft.accountId}
              onChange={(e) => patch({ accountId: e.target.value })}
              placeholder="32-character Cloudflare account ID"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Use your Cloudflare account ID and a Workers AI API token with Read
            and Edit permissions.
          </p>
        </>
      )}
      {provider === "custom" && (
        <>
          <label className="block space-y-2 text-sm">
            API base URL
            <Input
              value={draft.baseURL}
              onChange={(e) => patch({ baseURL: e.target.value })}
              placeholder="http://localhost:1234/v1"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Use an OpenAI-compatible Chat Completions API base URL. Changing it
            does not reuse another endpoint’s saved key.
          </p>
        </>
      )}
      <label className="block space-y-2 text-sm">
        {provider === "cloudflare" ? "API token" : "API key"}
        <Input
          type="password"
          value={draft.apiKey}
          onChange={(e) => patch({ apiKey: e.target.value })}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            hasKey
              ? `${credentialName} configured · enter a replacement`
              : provider === "custom"
                ? "Optional if your endpoint requires no key"
                : provider === "cloudflare"
                  ? "Enter your Workers AI API token"
                  : "Enter your API key"
          }
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Keys are encrypted using your operating system’s secure storage and
        never displayed again. Leave the field empty to keep the existing key.
        Provider requests may incur charges.
      </p>
      {!secureStorageAvailable && (
        <p role="status" className="text-sm text-destructive">
          Secure key storage is unavailable. Unlock your keychain or configure a
          Linux secret service to save a key.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            (provider === "custom" && !baseURL) ||
            (provider === "cloudflare" && !accountId) ||
            (!!draft.apiKey && !secureStorageAvailable) ||
            (!draft.apiKey.trim() &&
              provider !== "custom" &&
              !(provider === "cloudflare" && accountId !== profile.accountId))
          }
          onClick={() =>
            void perform(async () => {
              const result = await save.mutateAsync({
                provider,
                ...(accountId ? { accountId } : {}),
                ...(baseURL ? { baseURL } : {}),
                ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
              });
              patch({ apiKey: "" });
              await onSaved(result);
              setMessage(`${providerNames[provider]} connection saved.`);
            })
          }
        >
          Save provider
        </Button>
        <Button
          variant="ghost"
          disabled={!hasSavedKey}
          onClick={() =>
            void perform(async () => {
              const result = await remove.mutateAsync(
                provider === "custom" ? { provider, baseURL } : provider,
              );
              await onSaved(result);
              setMessage("Saved key removed for this provider.");
            })
          }
        >
          Remove saved key
        </Button>
      </div>
      <Feedback message={message} error={error} />
    </fieldset>
  );
}
function ModelSettings({
  purpose,
  ai,
  revision,
  onSaved,
  onNavigate,
}: {
  purpose: "assistant" | "decision";
  ai: AISettingsPublic;
  revision: number;
  onSaved: (result: AISettingsPublic) => Promise<void>;
  onNavigate: Props["onNavigate"];
}) {
  const isDecision = purpose === "decision";
  const title = isDecision ? "Decision model" : "Quory model";
  const selection = ai[purpose];
  const [provider, setProvider] = useState<Provider>(
    selection?.provider ?? "openai",
  );
  const [enabled, setEnabled] = useState(!!selection);
  const [drafts, setDrafts] = useState<Partial<Record<Provider, string>>>(() =>
    isDecision
      ? {
          openai: decisionModels.openai[0]!.id,
          google: decisionModels.google[0]!.id,
          typesafe: "jev-latest",
          cloudflare: decisionModels.cloudflare[0]!.id,
          ...(selection ? { [selection.provider]: selection.model } : {}),
        }
      : { ...ai.assistantModels, [ai.assistant.provider]: ai.assistant.model },
  );
  const model = drafts[provider] ?? "";
  const [manual, setManual] = useState(false);
  const [models, setModels] = useState<ModelDiscovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const discover = trpc.settings.models.useMutation({ gcTime: 0 });
  const save = trpc.settings.saveAI.useMutation({ gcTime: 0 });
  const testAssistant = trpc.settings.testAI.useMutation();
  const testDecision = trpc.settings.testDecision.useMutation();
  const [refresh, setRefresh] = useState(0);
  const baseURL = ai.providers[provider].baseURL;
  const load = discover.mutateAsync;
  const visible = !isDecision || enabled;
  useEffect(() => {
    let cancelled = false;
    setModels(null);
    setModelsError("");
    if (!visible || (provider === "custom" && !baseURL)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load({ provider, purpose, ...(baseURL ? { baseURL } : {}) })
      .then((result) => {
        if (!cancelled) setModels(result);
      })
      .catch(() => {
        if (!cancelled)
          setModelsError(
            "Could not load models. Refresh the list or try again later.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, purpose, baseURL, revision, visible, load, refresh]);
  const unchanged =
    isDecision && !enabled
      ? !selection
      : selection?.provider === provider && selection.model === model;
  const profile = ai.providers[provider];
  const hasKey = profile.hasSavedKey || profile.hasEnvironmentKey;
  const missingCredentials =
    provider === "custom"
      ? !baseURL
        ? "Add an API base URL"
        : null
      : provider === "cloudflare"
        ? !hasKey || !profile.accountId
          ? `Add ${!hasKey && !profile.accountId ? "an API token and account ID" : !hasKey ? "an API token" : "an account ID"} for Cloudflare`
          : null
        : !hasKey
          ? `Add an API key for ${providerNames[provider]}`
          : null;
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update model.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      id={isDecision ? "ai-decision" : "ai-assistant"}
      disabled={busy}
      className="space-y-4 border-t pt-5 disabled:opacity-70"
    >
      <legend className="text-sm font-semibold">{title}</legend>
      <p className="text-sm text-muted-foreground">
        {isDecision
          ? "Rank suggested tables and join paths, and choose columns for newly joined tables using schema metadata. Row data and filter values are not sent."
          : "Choose the model Quory uses to help build and edit queries."}
      </p>
      {isDecision && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setMessage("");
              setError("");
            }}
          />
          Enable decision model
        </label>
      )}
      {visible && (
        <>
          <label className="block space-y-2 text-sm">
            {isDecision ? "Decision provider" : "Quory provider"}
            <select
              className={fieldClass}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as Provider);
                setModels(null);
                setManual(false);
                setMessage("");
                setError("");
              }}
            >
              {(isDecision
                ? decisionProviderSchema.options
                : assistantProviderSchema.options
              ).map((p) => (
                <option key={p} value={p}>
                  {providerNames[p]}
                </option>
              ))}
            </select>
          </label>
          {missingCredentials && (
            <Alert variant="warning">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>
                {providerNames[provider]} credentials missing
              </AlertTitle>
              <AlertDescription>
                {missingCredentials} in{" "}
                <a
                  href="#ai-providers"
                  className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate("ai-providers");
                  }}
                >
                  Provider connections
                </a>
                {provider === "custom"
                  ? ". An API key is optional if your endpoint does not require one."
                  : " to use this model."}
              </AlertDescription>
            </Alert>
          )}
          <label className="block space-y-2 text-sm">
            {isDecision ? "Decision model" : "Quory model"}
            <select
              className={fieldClass}
              value={manual ? "__manual__" : model}
              onChange={(e) => {
                if (e.target.value === "__manual__") setManual(true);
                else {
                  setDrafts((d) => ({ ...d, [provider]: e.target.value }));
                  setManual(false);
                }
              }}
            >
              <option value="" disabled>
                {loading ? "Loading models…" : "Choose a model"}
              </option>
              {model && !models?.models.some((m) => m.id === model) && (
                <option value={model}>{model} (saved)</option>
              )}
              {models?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name === m.id ? m.id : `${m.name} — ${m.id}`}
                </option>
              ))}
              {!isDecision && (
                <option value="__manual__">Enter a model ID manually…</option>
              )}
            </select>
          </label>
          {manual && (
            <label className="block space-y-2 text-sm">
              Manual model ID
              <Input
                value={model}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [provider]: e.target.value }))
                }
                placeholder="Enter the exact model ID"
                autoComplete="off"
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={loading || (provider === "custom" && !baseURL)}
              onClick={() => setRefresh((r) => r + 1)}
            >
              Refresh {isDecision ? "decision" : "Quory"} models
            </Button>
            <span className="text-xs text-muted-foreground" role="status">
              {loading
                ? "Loading models…"
                : models
                  ? `${models.models.length} models · ${models.source === "catalog" ? "Live catalogue from models.dev" : models.source === "documented" ? "Provider documentation" : "From your provider"}`
                  : ""}
            </span>
          </div>
          {models?.notice && (
            <p className="text-xs text-muted-foreground">{models.notice}</p>
          )}
          {modelsError && (
            <p role="status" className="text-xs text-muted-foreground">
              {modelsError}
            </p>
          )}
          {isDecision && (
            <p className="text-xs text-muted-foreground">
              OpenAI, Google, TypeSafe, and Cloudflare support native decisions.
              Anthropic and custom chat endpoints are not available for this
              role.
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            unchanged ||
            (visible && (!model.trim() || (provider === "custom" && !baseURL)))
          }
          onClick={() =>
            void perform(async () => {
              const input = isDecision
                ? {
                    purpose: "decision",
                    selection: enabled ? { provider, model } : null,
                  }
                : { purpose: "assistant", selection: { provider, model } };
              const result = await save.mutateAsync(input as AISettingsInput);
              await onSaved(result);
              setMessage(`${title} saved.`);
            })
          }
        >
          Save {isDecision ? "decision" : "Quory"} model
        </Button>
        <Button
          variant="outline"
          disabled={!visible || !unchanged || !!missingCredentials}
          onClick={() =>
            void perform(async () => {
              const result = await (
                isDecision ? testDecision : testAssistant
              ).mutateAsync();
              if (!result.success) throw new Error(result.message);
              setMessage(result.message);
            })
          }
        >
          Test {isDecision ? "decision" : "Quory"} connection
        </Button>
      </div>
      <Feedback message={message} error={error} />
    </fieldset>
  );
}
