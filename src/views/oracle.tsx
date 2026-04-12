import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send,
  Sparkles,
  ExternalLink,
  Shuffle,
  Copy,
  Download,
} from "lucide-react";
import { Renderer, type ActionEvent, BuiltinActionType } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import Markdown from "react-markdown";
import { fetchOracle, fetchOracleStream, fetchRandomBookmark, fetchOracleStatus } from "@/lib/api";
import type { ChatMessage, OracleContext, OracleStreamEvent, Bookmark } from "@/lib/types";
import { formatNumber, tweetUrl } from "@/lib/utils";
import { formatTweetText } from "@/lib/tweet-text";
import { ErrorRetry } from "@/components/error-retry";
import {
  stripCodeFence,
  sanitizeIdentifiers,
  buildProgressiveRoot,
  useStableText,
  isOpenUIResponse,
} from "@/lib/openui-utils";
import { useStreamBuffer } from "@/lib/use-stream-buffer";

// --- Memoized Markdown (Fix C: avoid re-parsing AST on every render) ---

const MARKDOWN_CLASSES = "text-sm leading-7 text-body [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic [&_em]:text-secondary [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mt-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mt-2 [&_li]:mt-1.5 [&_p+p]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_code]:rounded [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground";

const MemoizedMarkdown = memo(function MemoizedMarkdown({ content }: { content: string }) {
  return (
    <div className={MARKDOWN_CLASSES}>
      <Markdown>{content}</Markdown>
    </div>
  );
});

// --- Bookmark Card (local helper, not exported) ---

function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  const navigate = useNavigate();
  const url = tweetUrl(bookmark.author_handle, bookmark.tweet_id);

  return (
    <button
      type="button"
      onClick={() => navigate(`/stream?q=${encodeURIComponent(bookmark.text.slice(0, 30))}`)}
      className="w-full cursor-pointer rounded-card border border-border bg-card p-3 text-left transition-colors hover:border-[#333]"
    >
      <div className="flex items-start gap-3">
        {bookmark.author_profile_image_url ? (
          <img
            src={bookmark.author_profile_image_url}
            alt={bookmark.author_handle}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-xs font-bold text-muted">
            {bookmark.author_handle.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/people/${encodeURIComponent(bookmark.author_handle)}`); }}
              className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              @{bookmark.author_handle}
            </button>
            {bookmark.primary_category && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(`/stream?category=${encodeURIComponent(bookmark.primary_category)}`); }}
                className="cursor-pointer rounded-badge bg-surface px-2 py-0.5 text-xs text-muted transition-colors hover:text-foreground"
              >
                {bookmark.primary_category}
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatTweetText(bookmark.text, { maxLength: 200 })}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs text-disabled">
            <span>♥ {formatNumber(bookmark.like_count)}</span>
            <span>↻ {formatNumber(bookmark.repost_count)}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-auto flex min-h-[44px] items-center gap-1 px-2 py-2 text-foreground hover:underline"
            >
              Open in X <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </button>
  );
}

// --- Welcome State ---

function WelcomeState({
  onExampleClick,
  onSurpriseClick,
}: {
  onExampleClick: (q: string) => void;
  onSurpriseClick: () => void;
}) {
  const examples = [
    "What have I been bookmarking this month vs last month?",
    "Find GitHub repos I bookmarked but probably forgot about",
    "Which authors do I bookmark most and what do they talk about?",
    "Show me bookmarks I saved about a topic I rarely bookmark",
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <a href="https://langchain.com" target="_blank" rel="noopener noreferrer">
        <img
          src="https://cdn.prod.website-files.com/65b8cd72835ceeacd4449a53/69a17e4a429d54e956e2a763_favicon.png"
          alt="LangChain"
          className="h-14 w-14 rounded-xl border border-border transition-opacity hover:opacity-80"
        />
      </a>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Chat with your X Bookmarks
        </h2>
        <a
          href="https://langchain.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
        >
          <span className="text-xs font-medium">Powered by LangChain</span>
        </a>
        <p className="mt-2 max-w-md text-sm text-muted">
          Ask questions about your bookmark collection in natural language.
          Chat will search your bookmarks and provide answers.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExampleClick(example)}
            className="min-h-[44px] rounded-button border border-border bg-card px-3 py-2 text-sm text-muted transition-colors hover:border-[#333] hover:text-foreground active:bg-card/80"
          >
            {example}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSurpriseClick}
        className="flex min-h-[44px] items-center gap-2 rounded-button border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface active:bg-[#252528]"
        data-testid="surprise-me-button"
      >
        <Shuffle className="h-4 w-4" />
        Surprise me
      </button>
    </div>
  );
}

// --- OpenUI Pro Message Renderer ---

function ProMessageView({
  content,
  isStreaming,
  onFollowUp,
}: {
  content: string;
  isStreaming: boolean;
  onFollowUp: (text: string) => void;
}) {
  const raw = sanitizeIdentifiers(stripCodeFence(content));
  const stable = useStableText(raw, isStreaming);
  const processed = useMemo(() => buildProgressiveRoot(stable), [stable]);

  const handleAction = useCallback(
    (event: ActionEvent) => {
      if (event.type === BuiltinActionType.ContinueConversation) {
        onFollowUp(event.humanFriendlyMessage);
      }
    },
    [onFollowUp],
  );

  if (!processed) return null;

  return (
    <div className="w-full" data-testid="pro-message">
      <Renderer
        response={processed}
        library={openuiLibrary}
        isStreaming={isStreaming}
        onAction={handleAction}
      />
    </div>
  );
}

// --- Streaming message bubble (reads from stream buffer, not message state) ---

function StreamingMessageBubble({
  displayText,
  onFollowUp,
}: {
  displayText: string;
  onFollowUp: (text: string) => void;
}) {
  const isOpenUI = isOpenUIResponse(displayText);

  return (
    <div className="flex justify-start" data-testid="message-assistant">
      <div
        className={`rounded-card px-4 py-3 ${
          isOpenUI
            ? "w-full border border-border bg-card text-foreground"
            : "max-w-[80%] border border-border bg-card text-foreground"
        }`}
      >
        {isOpenUI ? (
          <ProMessageView
            content={displayText}
            isStreaming={true}
            onFollowUp={onFollowUp}
          />
        ) : (
          <div className={MARKDOWN_CLASSES}>
            <Markdown>{displayText}</Markdown>
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-muted align-middle" />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Markdown Copy/Download Actions ---

function MarkdownActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oracle-response.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-2 flex items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 text-[11px] text-disabled transition-colors hover:text-muted"
      >
        <Copy className="h-3 w-3" />
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="flex items-center gap-1 text-[11px] text-disabled transition-colors hover:text-muted"
      >
        <Download className="h-3 w-3" />
        Download
      </button>
    </div>
  );
}

// --- Message Bubble (non-streaming messages only) ---

function MessageBubble({ message, onFollowUp }: { message: ChatMessage; onFollowUp?: (text: string) => void }) {
  const isUser = message.role === "user";
  const isProOpenUI = !isUser && message.mode === "pro" && isOpenUIResponse(message.content);

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} ${message.isFading ? "opacity-40 transition-opacity duration-300" : ""}`}
      data-testid={`message-${message.role}`}
    >
      <div
        className={`rounded-card px-4 py-3 ${
          isUser
            ? "max-w-[80%] bg-foreground text-background"
            : isProOpenUI
              ? "w-full border border-border bg-card text-foreground"
              : "max-w-[80%] border border-border bg-card text-foreground"
        }`}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            {message.streamStatus ? (
              <>
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span className="text-xs text-muted">
                  {message.streamStatus === "thinking" && "Thinking\u2026"}
                  {message.streamStatus === "querying" && "Querying database\u2026"}
                  {message.streamStatus === "generating" && "Generating response\u2026"}
                </span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                <div className="h-2 w-2 animate-pulse rounded-full bg-muted" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 animate-pulse rounded-full bg-muted" style={{ animationDelay: "300ms" }} />
              </>
            )}
          </div>
        ) : isProOpenUI && onFollowUp ? (
          <ProMessageView
            content={message.content}
            isStreaming={false}
            onFollowUp={onFollowUp}
          />
        ) : (
          <>
            {message.mode === "pro" ? (
              <>
                <MemoizedMarkdown content={message.content} />
                <MarkdownActions content={message.content} />
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            )}
            {message.apiCall && (
              <p
                className="mt-2 font-mono text-xs text-muted"
                data-testid="api-call-display"
              >
                Searched: {message.apiCall}
              </p>
            )}
            {message.results && message.results.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {message.results.map((bookmark) => (
                  <BookmarkCard key={bookmark.id} bookmark={bookmark} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Main Oracle View ---

export function OracleView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [proAvailable, setProAvailable] = useState(false);
  const [proMode, setProMode] = useState(false);
  const [showProTip, setShowProTip] = useState(false);
  const proButtonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const streamBuffer = useStreamBuffer(isStreaming);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
    const timer = setTimeout(scrollToBottom, 300);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  // Scroll as streaming content grows
  useEffect(() => {
    if (isStreaming && streamBuffer.displayText) {
      scrollToBottom();
    }
  }, [isStreaming, streamBuffer.displayText, scrollToBottom]);

  const checkStatus = useCallback(() => {
    setError(null);
    fetchOracleStatus()
      .then((status) => {
        setProAvailable(status.proAvailable);
        if (status.proAvailable) setProMode(true);
        setError(null);
      })
      .catch(() => {
        setError("Failed to load data. Is the server running?");
      });
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20;
    const verticalPadding = 20;
    const maxHeight = lineHeight * 7 + verticalPadding;
    const clamped = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${clamped}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  const buildContext = useCallback((): OracleContext[] => {
    return messages
      .filter((m) => !m.isLoading)
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.apiCall ? { apiCall: m.apiCall } : {}),
      }));
  }, [messages]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
      };

      const loadingId = `loading-${Date.now()}`;
      const loadingMessage: ChatMessage = {
        id: loadingId,
        role: "assistant",
        content: "",
        isLoading: true,
        streamStatus: proMode ? "thinking" : undefined,
      };

      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput("");
      setIsLoading(true);

      const context = buildContext();

      if (proMode) {
        streamBuffer.reset();
        let streamStarted = false;

        streamRef.current = fetchOracleStream(
          text.trim(),
          context,
          (event: OracleStreamEvent) => {
            if (event.step === "token") {
              if (!streamStarted) {
                streamStarted = true;
                setIsStreaming(true);
                setMessages((prev) => prev.filter((m) => m.id !== loadingId));
              }
              streamBuffer.append(event.content);
              return;
            }
            if (event.step === "token_reset") {
              // Fade out any prior streamed content instead of jarring removal
              if (streamStarted) {
                const fadedContent = streamBuffer.getText();
                if (fadedContent) {
                  const fadedId = `faded-${Date.now()}`;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: fadedId,
                      role: "assistant" as const,
                      content: fadedContent,
                      mode: "pro",
                      isFading: true,
                    },
                  ]);
                  setTimeout(() => {
                    setMessages((prev) => prev.filter((m) => m.id !== fadedId));
                  }, 300);
                }
                streamBuffer.reset();
                streamStarted = false;
                setIsStreaming(false);
              }
              setMessages((prev) => {
                const hasLoader = prev.some((m) => m.id === loadingId);
                if (hasLoader) {
                  return prev.map((m) =>
                    m.id === loadingId ? { ...m, isLoading: true, streamStatus: "querying" as const } : m,
                  );
                }
                return [
                  ...prev,
                  { id: loadingId, role: "assistant" as const, content: "", isLoading: true, streamStatus: "querying" as const },
                ];
              });
              return;
            }
            let status: ChatMessage["streamStatus"];
            if (event.step === "tools") status = "querying";
            else if (event.step === "model") status = "generating";
            else return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === loadingId ? { ...m, streamStatus: status } : m,
              ),
            );
          },
          (response) => {
            setIsStreaming(false);
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: response.answer,
              mode: "pro",
            };
            setMessages((prev) =>
              prev
                .filter((m) => m.id !== loadingId && !m.isFading)
                .concat(assistantMessage),
            );
            streamBuffer.reset();
            setIsLoading(false);
            streamRef.current = null;
          },
          (err) => {
            setIsStreaming(false);
            const errorMessage: ChatMessage = {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: `Sorry, something went wrong: ${err.message}`,
            };
            setMessages((prev) =>
              prev
                .filter((m) => m.id !== loadingId && !m.isFading)
                .concat(errorMessage),
            );
            streamBuffer.reset();
            setIsLoading(false);
            streamRef.current = null;
          },
        );
        return;
      }

      fetchOracle(text.trim(), context)
        .then((response) => {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: response.answer,
            apiCall: response.apiCall,
            results: response.results ?? [],
            total: response.total ?? 0,
            mode: response.mode === "pro" ? "pro" : "standard",
          };

          setMessages((prev) =>
            prev
              .filter((m) => m.id !== loadingId)
              .concat(assistantMessage),
          );
        })
        .catch((err) => {
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
          };

          setMessages((prev) =>
            prev
              .filter((m) => m.id !== loadingId)
              .concat(errorMessage),
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [isLoading, buildContext, proMode, streamBuffer],
  );

  const handleSurpriseMe = useCallback(async () => {
    if (isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: "\ud83c\udfb2 Surprise me!",
    };

    const loadingMessage: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: "assistant",
      content: "",
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setIsLoading(true);

    try {
      const bookmark = await fetchRandomBookmark();
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Here's a random bookmark from your collection:",
        apiCall: "/api/random-bookmark",
        results: [bookmark],
        total: 1,
      };

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== loadingMessage.id)
          .concat(assistantMessage),
      );
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Could not fetch random bookmark: ${err instanceof Error ? err.message : "Unknown error"}`,
      };

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== loadingMessage.id)
          .concat(errorMessage),
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <div className="flex h-full flex-col" data-testid="oracle-view">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto" data-testid="message-area">
        {error && !hasMessages ? (
          <ErrorRetry message={error} onRetry={() => { setError(null); checkStatus(); }} />
        ) : !hasMessages ? (
          <WelcomeState
            onExampleClick={(q) => sendMessage(q)}
            onSurpriseClick={() => void handleSurpriseMe()}
          />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onFollowUp={(text) => sendMessage(text)} />
            ))}
            {isStreaming && streamBuffer.displayText && (
              <StreamingMessageBubble
                displayText={streamBuffer.displayText}
                onFollowUp={(text) => sendMessage(text)}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="border-t border-border bg-background p-4" data-testid="input-bar">
        {hasMessages && (
          <button
            type="button"
            onClick={() => {
              streamRef.current?.close();
              streamRef.current = null;
              streamBuffer.reset();
              setIsStreaming(false);
              setMessages([]);
              setIsLoading(false);
            }}
            className="mb-2 block w-full text-center text-[11px] text-disabled transition-colors hover:text-muted"
          >
            Clear chat
          </button>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          {hasMessages && (
            <button
              type="button"
              onClick={() => void handleSurpriseMe()}
              disabled={isLoading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button border border-border text-muted transition-colors hover:border-[#333] hover:text-foreground active:bg-card disabled:opacity-50"
              title="Surprise me"
              data-testid="surprise-me-button"
            >
              <Shuffle className="h-4 w-4" />
            </button>
          )}
          <div
            className="flex"
            ref={proButtonRef}
            onMouseEnter={() => !proAvailable && setShowProTip(true)}
            onMouseLeave={() => setShowProTip(false)}
          >
            <button
              type="button"
              onClick={() => proAvailable && setProMode((p) => !p)}
              disabled={!proAvailable}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-button border px-3 text-xs font-semibold tracking-wide transition-colors ${
                !proAvailable
                  ? "cursor-not-allowed border-border text-disabled opacity-50"
                  : proMode
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-disabled hover:border-[#333] hover:text-muted"
              }`}
              title={proAvailable ? (proMode ? "Pro mode on (LLM-powered SQL agent)" : "Standard mode") : ""}
              data-testid="pro-mode-toggle"
            >
              <Sparkles className="h-3.5 w-3.5" />
              PRO
            </button>
          </div>
          {showProTip && proButtonRef.current && (() => {
            const rect = proButtonRef.current!.getBoundingClientRect();
            return (
              <div
                className="pointer-events-none fixed z-50 w-64 rounded-card border border-border bg-card p-3 text-xs leading-relaxed text-muted shadow-lg"
                style={{
                  left: rect.left + rect.width / 2 - 128,
                  top: rect.top - 8,
                  transform: "translateY(-100%)",
                }}
              >
                <p className="mb-1 font-semibold text-foreground">Pro Mode</p>
                <p>AI-powered SQL queries with interactive charts, tables, and dashboards.</p>
                <p className="mt-2">Set <span className="font-mono text-foreground">ANTHROPIC_API_KEY</span> or <span className="font-mono text-foreground">OPENAI_API_KEY</span> in your <span className="font-mono text-foreground">.env</span> file to enable.</p>
              </div>
            );
          })()}
          <div className="relative flex flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your bookmarks..."
              disabled={isLoading}
              className="min-h-[44px] w-full resize-none rounded-button border border-border bg-card px-4 py-[10px] pr-10 text-sm leading-5 text-foreground placeholder:text-disabled focus:border-[#333] focus:outline-none disabled:opacity-50"
              data-testid="oracle-input"
            />
            <Sparkles className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-disabled" />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-foreground text-background transition-colors hover:bg-foreground/90 active:bg-foreground/80 disabled:opacity-50"
            data-testid="send-button"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
