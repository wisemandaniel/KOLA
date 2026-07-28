"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import OrderCall from "./OrderCall";

type DeliveryState = "sending" | "sent" | "delivered" | "read" | "failed";
type MessageType = "text" | "image" | "audio";

type ChatMessage = {
  id: string;
  orderId: string;
  senderId: string;
  who: string;
  text: string;
  time: string;
  createdAt: number;
  kind: string;
  type: MessageType;
  mediaUrl?: string;
  durationMs?: number;
  status: DeliveryState;
  progress?: number;
};

type InitialMessage = Omit<ChatMessage, "status"> & {
  status?: "sent" | "delivered" | "read";
};

type UploadRetry = {
  file: File | Blob;
  durationMs: number;
  caption: string;
  mediaUrl: string;
  type: "image" | "audio";
};

type ImageDraft = {
  file: File;
  url: string;
  caption: string;
};

const emojis = ["😊", "😂", "❤️", "👍", "🙏", "🔥", "🎉", "✅", "📦", "🏍️"];

export default function OrderChat({
  orderId,
  initialMessages,
  actorId,
  close,
  onNotice,
}: {
  orderId: string;
  initialMessages: InitialMessage[];
  actorId: string;
  close: () => void;
  onNotice: (message: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map((message) => ({ ...message, status: message.status ?? "sent" })),
  );
  const [draft, setDraft] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [imageDraft, setImageDraft] = useState<ImageDraft | null>(null);
  const [viewerUrl, setViewerUrl] = useState("");
  const [unread, setUnread] = useState(0);
  const [atBottom, setAtBottom] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingActionRef = useRef<"send" | "cancel">("send");
  const uploadsRef = useRef(new Map<string, UploadRetry>());
  const localUrlsRef = useRef(new Set<string>());
  const imageDraftUrlRef = useRef("");
  const knownIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const atBottomRef = useRef(true);
  const syncInFlightRef = useRef(false);
  const firstSyncRef = useRef(true);
  const syncFailureShownRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    atBottomRef.current = true;
    setAtBottom(true);
    setUnread(0);
  }, []);

  const sync = useCallback(
    async (showLoader = false) => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      if (showLoader) setSyncing(true);
      try {
        const response = await fetch(
          `/api/messages?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as {
          messages?: Record<string, unknown>[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Conversation unavailable.");

        const incoming = (result.messages ?? []).map(toChatMessage);
        const freshIncoming = incoming.filter(
          (message) =>
            !knownIdsRef.current.has(message.id) && message.senderId !== actorId,
        ).length;
        incoming.forEach((message) => knownIdsRef.current.add(message.id));
        if (!firstSyncRef.current && freshIncoming && !atBottomRef.current) {
          setUnread((count) => count + freshIncoming);
        }

        setMessages((current) => {
          const serverIds = new Set(incoming.map((message) => message.id));
          const localOnly = current.filter(
            (message) =>
              !serverIds.has(message.id) &&
              (message.status === "sending" || message.status === "failed"),
          );
          return [...incoming, ...localOnly].sort(
            (left, right) => left.createdAt - right.createdAt,
          );
        });
        syncFailureShownRef.current = false;
      } catch (error) {
        if (!syncFailureShownRef.current) {
          syncFailureShownRef.current = true;
          onNotice(
            error instanceof Error
              ? error.message
              : "Conversation will reconnect automatically.",
          );
        }
      } finally {
        firstSyncRef.current = false;
        syncInFlightRef.current = false;
        setInitialLoading(false);
        if (showLoader) setSyncing(false);
      }
    },
    [actorId, onNotice, orderId],
  );

  useEffect(() => {
    const firstSync = window.setTimeout(() => void sync(true), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync(false);
    }, 1500);
    const resume = () => {
      if (document.visibilityState === "visible") void sync(false);
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearTimeout(firstSync);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sync]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = window.localStorage.getItem(`kola-chat-draft:${orderId}`);
      if (saved) setDraft(saved);
      scrollToBottom(false);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [orderId, scrollToBottom]);

  useEffect(() => {
    window.localStorage.setItem(`kola-chat-draft:${orderId}`, draft);
    const field = textareaRef.current;
    if (field) {
      field.style.height = "0px";
      field.style.height = `${Math.min(field.scrollHeight, 112)}px`;
    }
  }, [draft, orderId]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.max(
        1,
        Math.floor((timestampNow() - recordingStartedRef.current) / 1000),
      );
      setRecordingSeconds(elapsed);
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      recordingActionRef.current = "cancel";
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      recorder?.stream.getTracks().forEach((track) => track.stop());
      if (imageDraftUrlRef.current) URL.revokeObjectURL(imageDraftUrlRef.current);
      localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const updateMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, ...patch } : message)),
    );
  };

  const sendText = async (existing?: ChatMessage) => {
    const text = existing?.text ?? draft.trim();
    if (!text) return;
    const id = existing?.id ?? crypto.randomUUID();
    const createdAt = timestampNow();
    const optimistic: ChatMessage =
      existing ?? {
        id,
        orderId,
        senderId: actorId,
        who: "You",
        text,
        time: formatTime(createdAt),
        createdAt,
        kind: "",
        type: "text",
        status: "sending",
      };

    if (existing) {
      updateMessage(id, { status: "sending" });
    } else {
      setDraft("");
      setEmojiOpen(false);
      setMessages((current) => [...current, optimistic]);
      knownIdsRef.current.add(id);
    }
    window.requestAnimationFrame(() => scrollToBottom(true));

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, body: text, clientMessageId: id }),
      });
      const result = (await response.json()) as {
        message?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !result.message) {
        throw new Error(result.error ?? "Message not sent.");
      }
      updateMessage(id, { ...toChatMessage(result.message), status: "sent" });
      void sync(false);
    } catch {
      updateMessage(id, { status: "failed" });
    }
  };

  const sendUpload = (
    file: File | Blob,
    type: "image" | "audio",
    durationMs = 0,
    caption = "",
    retryId?: string,
    retainedUrl?: string,
  ) => {
    const id = retryId ?? crypto.randomUUID();
    const mediaUrl = retainedUrl ?? URL.createObjectURL(file);
    if (!retainedUrl) localUrlsRef.current.add(mediaUrl);
    uploadsRef.current.set(id, { file, durationMs, caption, mediaUrl, type });

    if (retryId) {
      updateMessage(id, { status: "sending", progress: 0 });
    } else {
      const createdAt = timestampNow();
      const optimistic: ChatMessage = {
        id,
        orderId,
        senderId: actorId,
        who: "You",
        text: caption || (type === "image" ? "Photo" : "Voice note"),
        time: formatTime(createdAt),
        createdAt,
        kind: "",
        type,
        mediaUrl,
        durationMs,
        status: "sending",
        progress: 0,
      };
      setMessages((current) => [...current, optimistic]);
      knownIdsRef.current.add(id);
    }
    window.requestAnimationFrame(() => scrollToBottom(true));

    const form = new FormData();
    form.set("orderId", orderId);
    form.set("clientMessageId", id);
    form.set("file", file, file instanceof File ? file.name : "voice-note.webm");
    if (durationMs) form.set("durationMs", String(durationMs));
    if (caption) form.set("caption", caption);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/messages/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        updateMessage(id, {
          progress: Math.max(1, Math.round((event.loaded / event.total) * 100)),
        });
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        uploadsRef.current.delete(id);
        updateMessage(id, {
          status: "sent",
          progress: 100,
          mediaUrl: `/api/media/${encodeURIComponent(id)}`,
        });
        window.setTimeout(() => {
          URL.revokeObjectURL(mediaUrl);
          localUrlsRef.current.delete(mediaUrl);
        }, 1000);
        void sync(false);
        return;
      }
      updateMessage(id, { status: "failed" });
    };
    request.onerror = () => updateMessage(id, { status: "failed" });
    request.send(form);
  };

  const retryMessage = (message: ChatMessage) => {
    if (message.type === "text") {
      void sendText(message);
      return;
    }
    const retry = uploadsRef.current.get(message.id);
    if (!retry) {
      onNotice("Choose the attachment again to resend it.");
      return;
    }
    sendUpload(
      retry.file,
      retry.type,
      retry.durationMs,
      retry.caption,
      message.id,
      retry.mediaUrl,
    );
  };

  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      onNotice("Choose a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      onNotice("Images must be smaller than 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    imageDraftUrlRef.current = url;
    setImageDraft({ file, url, caption: "" });
  };

  const sendImageDraft = () => {
    if (!imageDraft) return;
    const selected = imageDraft;
    setImageDraft(null);
    imageDraftUrlRef.current = "";
    localUrlsRef.current.add(selected.url);
    sendUpload(
      selected.file,
      "image",
      0,
      selected.caption.trim(),
      undefined,
      selected.url,
    );
  };

  const discardImageDraft = () => {
    if (imageDraft?.url) URL.revokeObjectURL(imageDraft.url);
    imageDraftUrlRef.current = "";
    setImageDraft(null);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onNotice("Voice notes are not supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supported = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supported ? { mimeType: supported } : undefined,
      );
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedRef.current = timestampNow();
      recordingActionRef.current = "send";
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = timestampNow() - recordingStartedRef.current;
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
        setRecordingSeconds(0);
        if (blob.size && recordingActionRef.current === "send") {
          sendUpload(blob, "audio", duration);
        }
      };
      recorder.start(250);
      setRecording(true);
    } catch {
      onNotice("Allow microphone access to record a voice note.");
    }
  };

  const stopRecording = (action: "send" | "cancel") => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recordingActionRef.current = action;
    recorder.stop();
  };

  const handleScroll = () => {
    const container = messagesRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    atBottomRef.current = distance < 80;
    setAtBottom(atBottomRef.current);
    if (atBottomRef.current) setUnread(0);
  };

  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={close} aria-label="Close chat" />
      <aside className="app-drawer chat-drawer" aria-label={`Order ${orderId} chat`}>
        <header className="wa-chat-header">
          <button className="wa-back" onClick={close} aria-label="Back">
            <ArrowLeft />
          </button>
          <div className="wa-avatar">{orderId.slice(-2).toUpperCase()}</div>
          <div className="wa-chat-title">
            <h2>Order {orderId}</h2>
            <span>Customer, vendor &amp; rider</span>
          </div>
          <div className="wa-header-actions">
            <OrderCall orderId={orderId} actorId={actorId} onNotice={onNotice} />
            <button onClick={close} aria-label="Close chat">
              <X />
            </button>
          </div>
        </header>

        {syncing && <div className="chat-sync-line" aria-label="Loading conversation" />}

        <div
          className="chat-messages wa-messages"
          ref={messagesRef}
          onScroll={handleScroll}
          aria-live="polite"
        >
          <div className="wa-privacy-note">
            <CheckCheck />
            This order chat is private to its participants.
          </div>

          {initialLoading && !messages.length ? (
            <ChatSkeleton />
          ) : messages.length ? (
            messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDay =
                !previous ||
                new Date(previous.createdAt).toDateString() !==
                  new Date(message.createdAt).toDateString();
              const grouped =
                Boolean(previous) &&
                previous.senderId === message.senderId &&
                message.createdAt - previous.createdAt < 5 * 60 * 1000 &&
                !showDay;
              const mine = message.senderId === actorId;
              return (
                <Fragment key={message.id}>
                  {showDay && (
                    <div className="wa-day">{formatDay(message.createdAt)}</div>
                  )}
                  <article
                    className={[
                      mine ? "mine" : "",
                      grouped ? "grouped" : "",
                      `message-${message.type}`,
                      message.status === "failed" ? "failed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {!mine && !grouped && (
                      <b>
                        {message.who}
                        <small>{message.kind}</small>
                      </b>
                    )}

                    {message.type === "image" && message.mediaUrl ? (
                      <button
                        className="wa-image"
                        onClick={() => setViewerUrl(message.mediaUrl ?? "")}
                        aria-label="Open image"
                      >
                        <img src={message.mediaUrl} alt={`Shared by ${message.who}`} />
                        {message.status === "sending" && (
                          <span className="wa-upload-progress">
                            <Loader2 />
                            {message.progress ?? 0}%
                          </span>
                        )}
                      </button>
                    ) : message.type === "audio" && message.mediaUrl ? (
                      <VoiceNote
                        src={message.mediaUrl}
                        durationMs={message.durationMs ?? 0}
                        pending={message.status === "sending"}
                        progress={message.progress ?? 0}
                      />
                    ) : (
                      <p>{message.text}</p>
                    )}

                    {message.type === "image" &&
                      message.text &&
                      message.text !== "Photo" && <p>{message.text}</p>}

                    <div className="wa-message-meta">
                      <time>{message.time}</time>
                      {mine && <MessageStatus state={message.status} />}
                    </div>

                    {message.status === "failed" && (
                      <button
                        className="wa-retry"
                        onClick={() => retryMessage(message)}
                      >
                        <RotateCcw />
                        Tap to retry
                      </button>
                    )}
                  </article>
                </Fragment>
              );
            })
          ) : (
            <div className="wa-empty-chat">
              <MessageCircle />
              <h3>Start the conversation</h3>
              <p>Send a message, photo, or voice note about this order.</p>
            </div>
          )}
        </div>

        {!atBottom || unread > 0 ? (
          <button className="wa-scroll-bottom" onClick={() => scrollToBottom(true)}>
            <ChevronDown />
            {unread > 0 && <span>{unread}</span>}
          </button>
        ) : null}

        {recording ? (
          <div className="wa-recording">
            <button onClick={() => stopRecording("cancel")} aria-label="Cancel recording">
              <Trash2 />
            </button>
            <div className="wa-recording-time">
              <span />
              {formatDuration(recordingSeconds)}
            </div>
            <div className="wa-wave" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <button
              className="wa-record-send"
              onClick={() => stopRecording("send")}
              aria-label="Send voice note"
            >
              <Send />
            </button>
          </div>
        ) : (
          <div className="wa-compose-wrap">
            {emojiOpen && (
              <div className="wa-emoji-picker">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setDraft((current) => `${current}${emoji}`);
                      textareaRef.current?.focus();
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <div className="wa-compose">
              <input
                ref={fileInputRef}
                className="chat-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  chooseImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                className={emojiOpen ? "active" : ""}
                onClick={() => setEmojiOpen((open) => !open)}
                aria-label="Choose emoji"
              >
                <Smile />
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendText();
                  }
                }}
                placeholder="Message"
                aria-label="Message"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image"
              >
                <Paperclip />
              </button>
            </div>
            {draft.trim() ? (
              <button
                className="wa-main-action"
                onClick={() => void sendText()}
                aria-label="Send message"
              >
                <Send />
              </button>
            ) : (
              <button
                className="wa-main-action"
                onClick={startRecording}
                aria-label="Record voice note"
              >
                <Mic />
              </button>
            )}
          </div>
        )}

        {imageDraft && (
          <div className="wa-preview" role="dialog" aria-modal="true">
            <header>
              <button onClick={discardImageDraft} aria-label="Cancel image">
                <X />
              </button>
              <b>Send photo</b>
            </header>
            <div className="wa-preview-image">
              <img src={imageDraft.url} alt="Selected upload" />
            </div>
            <div className="wa-preview-compose">
              <input
                value={imageDraft.caption}
                onChange={(event) =>
                  setImageDraft((current) =>
                    current ? { ...current, caption: event.target.value } : current,
                  )
                }
                onKeyDown={(event) => event.key === "Enter" && sendImageDraft()}
                placeholder="Add a caption…"
                autoFocus
              />
              <button onClick={sendImageDraft} aria-label="Send photo">
                <Send />
              </button>
            </div>
          </div>
        )}

        {viewerUrl && (
          <div className="wa-lightbox" role="dialog" aria-modal="true">
            <button onClick={() => setViewerUrl("")} aria-label="Close image">
              <X />
            </button>
            <img src={viewerUrl} alt="Shared attachment" />
          </div>
        )}
      </aside>
    </div>
  );
}

function toChatMessage(row: Record<string, unknown>): ChatMessage {
  const createdAt = Number(row.created_at ?? timestampNow());
  const id = String(row.id);
  return {
    id,
    orderId: String(row.order_id),
    senderId: String(row.sender_id),
    who: String(row.sender_name ?? "Order participant"),
    text: String(row.body ?? ""),
    time: formatTime(createdAt),
    createdAt,
    kind: String(row.sender_role ?? ""),
    type: String(row.message_type ?? "text") as MessageType,
    mediaUrl: row.media_key ? `/api/media/${encodeURIComponent(id)}` : undefined,
    durationMs: Number(row.duration_ms ?? 0),
    status: String(row.delivery_status ?? "sent") as DeliveryState,
  };
}

function MessageStatus({ state }: { state: DeliveryState }) {
  if (state === "sending") return <Loader2 className="wa-status-loading" />;
  if (state === "failed") return <span className="wa-status-failed">!</span>;
  if (state === "sent") return <Check />;
  return <CheckCheck className={state === "read" ? "read" : ""} />;
}

function VoiceNote({
  src,
  durationMs,
  pending,
  progress,
}: {
  src: string;
  durationMs: number;
  pending: boolean;
  progress: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, durationMs / 1000));
  const [speed, setSpeed] = useState(1);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => undefined);
    else audio.pause();
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="wa-voice-note">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) =>
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration)
        }
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <button onClick={toggle} disabled={pending} aria-label={playing ? "Pause" : "Play"}>
        {pending ? <Loader2 className="wa-status-loading" /> : playing ? <Pause /> : <Play />}
      </button>
      <div>
        <input
          type="range"
          min="0"
          max={Math.max(duration, 1)}
          step=".1"
          value={Math.min(current, Math.max(duration, 1))}
          onChange={(event) => {
            const value = Number(event.target.value);
            setCurrent(value);
            if (audioRef.current) audioRef.current.currentTime = value;
          }}
          aria-label="Voice note position"
        />
        <span>
          {pending ? `Sending ${progress}%` : formatDuration(Math.floor(current || duration))}
        </span>
      </div>
      <button className="wa-speed" onClick={cycleSpeed} disabled={pending}>
        {speed}x
      </button>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="wa-chat-skeleton" aria-label="Loading messages">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function timestampNow() {
  return Date.now();
}
