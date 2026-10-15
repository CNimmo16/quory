import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUp, Check, MessageSquare, PanelRightClose } from "lucide-react";
import type { ChatMessage } from "../../../shared/queryChat";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Spinner } from "./LoadingState";
import { useSidebarLayout } from "../hooks/useSidebarLayout";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { Hint } from "./Hint";

export function QueryComposer({
  onSend,
  pending,
  initial = false,
  draft,
  onDraftChange,
  controls,
  disabledReason,
}: {
  onSend: (message: string) => Promise<boolean>;
  pending: boolean;
  initial?: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  controls?: ReactNode;
  disabledReason?: string | undefined;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  async function submit() {
    if (!draft.trim() || pending || disabledReason) return;
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
      className={controls ? "isolate" : "space-y-3"}
    >
      <div
        className={
          controls
            ? "relative space-y-4 rounded-2xl border bg-background px-5 pb-3 pt-3 shadow-sm focus-within:ring-1 focus-within:ring-ring"
            : "contents"
        }
      >
        {controls && <div className="-mx-2">{controls}</div>}
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
            controls
              ? "min-h-36 resize-none border-0 p-0 text-base shadow-none focus-visible:ring-0"
              : initial
              ? "min-h-36 bg-background p-4 text-base"
              : "min-h-28 bg-background"
          }
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Shift + Enter for a new line
          </span>
          {controls ? (
            <Hint
              content={
                disabledReason ??
                (!draft.trim()
                  ? "Describe the query you want to create."
                  : "Create a query with Quory.")
              }
            >
              <Button
                type="submit"
                disabled={!draft.trim() || pending || !!disabledReason}
                aria-busy={pending}
              >
                {pending ? <Spinner /> : <ArrowUp aria-hidden="true" />}Build
                query
              </Button>
            </Hint>
          ) : (
            <Button
              type="submit"
              disabled={!draft.trim() || pending}
              aria-busy={pending}
            >
              {pending ? <Spinner /> : <ArrowUp aria-hidden="true" />}
              {initial ? "Build query" : "Send"}
            </Button>
          )}
        </div>
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
  collapsed,
  onToggle,
}: {
  messages: ChatMessage[];
  pendingMessage: string | null;
  error: string | null;
  onSend: (message: string) => Promise<boolean>;
  disabled?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  draft: string;
  onDraftChange: (draft: string) => void;
}) {
  const layout = useSidebarLayout();
  const setRightOpen = layout?.setRightOpen;
  useEffect(() => {
    setRightOpen?.(!collapsed);
    return () => setRightOpen?.(false);
  }, [setRightOpen, collapsed]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!collapsed) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pendingMessage, error, collapsed]);
  const conversation: ChatMessage[] = [
    ...messages.filter((message) => !message.historyAction),
    ...(pendingMessage
      ? [{ id: "pending", role: "user" as const, content: pendingMessage }]
      : []),
  ];
  return (
    <aside
      id="query-chat"
      style={!collapsed ? { width: layout?.rightWidth ?? 320 } : undefined}
      className={`relative flex shrink-0 flex-col bg-background ${
        collapsed ? "h-full w-12 border-l" : "h-full border-l"
      }`}
      aria-label="Query assistant"
    >
      <div
        className={`flex shrink-0 items-center gap-2 border-b text-sm font-medium ${
          collapsed ? "h-14 justify-center px-1" : "px-5 py-4"
        }`}
      >
        {!collapsed && (
          <>
            <MessageSquare className="size-4" aria-hidden="true" />
            Query assistant
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`size-7 ${collapsed ? "" : "ml-auto"}`}
          aria-label={
            collapsed ? "Expand query assistant" : "Collapse query assistant"
          }
          title={
            collapsed ? "Expand query assistant" : "Collapse query assistant"
          }
          aria-expanded={!collapsed}
          aria-controls="query-chat-content"
          onClick={onToggle}
        >
          {collapsed ? (
            <MessageSquare aria-hidden="true" />
          ) : (
            <PanelRightClose aria-hidden="true" />
          )}
        </Button>
      </div>
      <div
        id="query-chat-content"
        hidden={collapsed}
        className={collapsed ? "hidden" : "flex min-h-0 flex-1 flex-col"}
      >
        <div
          role="log"
          aria-label="Query conversation"
          aria-live="polite"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
        >
          {messages.length === 0 && !pendingMessage && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Refine your query with AI</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ask to add columns, filter results, or explore related tables.
                Your current query and any unsaved edits are included.
              </p>
            </div>
          )}
          {conversation.map((message) => (
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
      </div>
      {!collapsed && layout && (
        <SidebarResizeHandle
          side="right"
          width={layout.rightWidth}
          max={layout.rightMax}
          onResize={layout.setRightWidth}
        />
      )}
    </aside>
  );
}
