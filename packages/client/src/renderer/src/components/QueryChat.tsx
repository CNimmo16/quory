import { useEffect, useRef } from "react";
import { ArrowUp, Check, MessageSquare } from "lucide-react";
import type { ChatMessage } from "../../../shared/queryChat";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Spinner } from "./LoadingState";

export function QueryComposer({
  onSend,
  pending,
  initial = false,
  draft,
  onDraftChange,
}: {
  onSend: (message: string) => Promise<boolean>;
  pending: boolean;
  initial?: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  async function submit() {
    if (!draft.trim() || pending) return;
    if (await onSend(draft.trim())) {
      input.current?.focus();
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-3"
    >
      <Textarea
        ref={input}
        aria-label={initial ? "Describe your query" : "Amend your query"}
        placeholder={
          initial
            ? "Latest orders with listings for user cameron@gmail.com"
            : "Ask a follow-up or describe a change…"
        }
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void submit();
          }
        }}
        maxLength={6000}
        disabled={pending}
        className={
          initial
            ? "min-h-36 bg-background p-4 text-base"
            : "min-h-28 bg-background"
        }
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Shift + Enter for a new line
        </span>
        <Button
          type="submit"
          disabled={!draft.trim() || pending}
          aria-busy={pending}
        >
          {pending ? <Spinner /> : <ArrowUp aria-hidden="true" />}
          {initial ? "Build query" : "Send"}
        </Button>
      </div>
    </form>
  );
}

export function QueryChatPane({
  messages,
  pendingMessage,
  error,
  onSend,
  draft,
  onDraftChange,
  disabled = false,
  compact = false,
}: {
  messages: ChatMessage[];
  pendingMessage: string | null;
  error: string | null;
  onSend: (message: string) => Promise<boolean>;
  disabled?: boolean;
  compact?: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pendingMessage, error]);
  return (
    <aside
      className={`flex shrink-0 flex-col bg-background ${
        compact ? "h-1/2 min-h-[320px] w-full border-b" : "h-full w-80 border-r"
      }`}
      aria-label="Query assistant"
    >
      <div className="flex items-center gap-2 border-b px-5 py-4 text-sm font-medium">
        <MessageSquare className="size-4" aria-hidden="true" />
        Query assistant
      </div>
      <div
        role="log"
        aria-label="Query conversation"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
      >
        {messages.length === 0 && !pendingMessage && (
          <p className="text-sm text-muted-foreground">
            Describe what you want to change. Your current tables, filters, and
            unsaved edits are included.
          </p>
        )}
        {[
          ...messages,
          ...(pendingMessage
            ? [
                {
                  id: "pending",
                  role: "user" as const,
                  content: pendingMessage,
                },
              ]
            : []),
        ].map((message) => (
          <div key={message.id} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {message.role === "user" ? "You" : "Quory"}
            </p>
            <p
              className={
                message.role === "user"
                  ? "whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed"
                  : "whitespace-pre-wrap break-words text-sm leading-relaxed"
              }
            >
              {message.content}
            </p>
            {"queryUpdated" in message && message.queryUpdated && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3" aria-hidden="true" />
                Query saved
              </p>
            )}
          </div>
        ))}
        {pendingMessage && (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            Working on your query…
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="space-y-3 border-t p-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <QueryComposer
          onSend={onSend}
          pending={pendingMessage !== null || disabled}
          draft={draft}
          onDraftChange={onDraftChange}
        />
        <p className="text-xs text-muted-foreground">
          Chat changes are saved automatically.
        </p>
      </div>
    </aside>
  );
}
