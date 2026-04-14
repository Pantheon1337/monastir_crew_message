import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import { api, apiUpload } from '../api.js';
import VoiceMessagePlayer from './VoiceMessagePlayer.jsx';
import VideoNoteInChat from './chat/VideoNoteInChat.jsx';
import MentionText from './chat/MentionText.jsx';
import MentionAutocomplete from './chat/MentionAutocomplete.jsx';
import ChatScaffold from './chat/ChatScaffold.jsx';
import ChatScrollDownFab from './chat/ChatScrollDownFab.jsx';
import SwipeToReplyRow from './chat/SwipeToReplyRow.jsx';
import ChatReadReceipt from './chat/ChatReadReceipt.jsx';
import AvatarLightbox from './AvatarLightbox.jsx';
import ForwardMessageModal from './ForwardMessageModal.jsx';
import ReactionUsersModal from './ReactionUsersModal.jsx';
import { REACTION_KEYS, REACTION_ICONS, emptyReactionCounts, normalizeReactionMine } from '../reactionConstants.js';
import { useVisualViewportRect } from '../hooks/useVisualViewportRect.js';
import { useLeftEdgeSwipeBack } from '../hooks/useLeftEdgeSwipeBack.js';
import { releaseCameraStreamNow } from '../cameraSession.js';
import VideoNoteRecordModal from './chat/VideoNoteRecordModal.jsx';
import ChatStickerPanel from './chat/ChatStickerPanel.jsx';
import ChatComposerIcon from './chat/ChatComposerIcon.jsx';
import { messageGroupFlags, telegramBubbleRadius } from '../chat/messageGrouping.js';
import { loadRoomThreadCache, saveRoomThreadCache } from '../chatThreadCache.js';
import { useChatWallpaperTimelineStyle } from '../hooks/useChatWallpaperTimelineStyle.js';

const QUICK_REACTION_KEYS = REACTION_KEYS.slice(0, 4);

const MAX_MS = 15000;
const MIN_MS = 400;

const POST_LOAD_STICK_MS = 320;

function scrollTimelineToBottom(el) {
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  if (Math.abs(el.scrollTop - max) < 2) return;
  el.scrollTop = max;
}

const CHAT_TIMELINE_STACK_STYLE = {
  flex: '1 1 auto',
  width: '100%',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  boxSizing: 'border-box',
};

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function formatDur(ms) {
  if (ms == null || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return m > 0 ? `${m}:${String(rs).padStart(2, '0')}` : `0:${String(rs).padStart(2, '0')}`;
}

function newClientMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Единый формат для API и WS (mediaUrl, kind, durationMs). */
function normalizeChatMessage(m) {
  if (!m || typeof m !== 'object') return m;
  const durationMs = m.durationMs != null ? m.durationMs : m.duration_ms ?? null;
  const rawPath = m.media_path ?? m.mediaPath;
  let mediaUrl = m.mediaUrl;
  if (!mediaUrl && rawPath) {
    const p = String(rawPath).replace(/^\/+/, '');
    mediaUrl = p.startsWith('uploads/') ? `/${p}` : `/uploads/${p}`;
  }
  if (mediaUrl && typeof window !== 'undefined' && !/^https?:\/\//i.test(String(mediaUrl))) {
    try {
      mediaUrl = new URL(String(mediaUrl), window.location.origin).href;
    } catch {
      /* */
    }
  }
  const kind = m.kind || 'text';
  let refStoryPreviewUrl = m.refStoryPreviewUrl;
  if (refStoryPreviewUrl && typeof window !== 'undefined' && !/^https?:\/\//i.test(String(refStoryPreviewUrl))) {
    try {
      refStoryPreviewUrl = new URL(String(refStoryPreviewUrl), window.location.origin).href;
    } catch {
      /* */
    }
  }
  return {
    ...m,
    kind,
    mediaUrl: mediaUrl ?? null,
    durationMs,
    refStoryId: m.refStoryId ?? null,
    refStoryPreviewUrl: refStoryPreviewUrl ?? null,
    storyReactionKey: m.storyReactionKey ?? null,
    reactions: m.reactions ?? null,
    readByPeer: m.readByPeer === true,
    deliveredToPeer: m.readByPeer === true || m.deliveredToPeer !== false,
    pending: m.pending === true,
    senderAffiliationEmoji: m.senderAffiliationEmoji ?? null,
    revokedForAll: m.revokedForAll === true,
    replyTo: m.replyTo ?? null,
    forwardFrom: m.forwardFrom ?? null,
    editedAt: m.editedAt != null ? m.editedAt : null,
  };
}

function looksLikeVideoFileName(name) {
  if (!name || typeof name !== 'string') return false;
  return /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(name.trim());
}

function useLongPress(onLongPress, { ms = 450, moveTol = 14 } = {}) {
  const timerRef = useRef(null);
  const startRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return {
    onPointerDown(e) {
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        onLongPress(e.clientX, e.clientY);
      }, ms);
    },
    onPointerMove(e) {
      const s = startRef.current;
      if (!s || timerRef.current == null) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (dx * dx + dy * dy > moveTol * moveTol) {
        clearTimer();
        startRef.current = null;
      }
    },
    onPointerUp() {
      clearTimer();
      startRef.current = null;
    },
    onPointerCancel() {
      clearTimer();
      startRef.current = null;
    },
  };
}

function getCopyTextForMessage(m) {
  const k = m.kind || 'text';
  if (k === 'revoked') return 'Сообщение удалено';
  if (k === 'text') return m.body || '';
  if (k === 'voice') return 'Голосовое сообщение';
  if (k === 'video_note') return 'Видеосообщение';
  if (k === 'image') return m.body?.trim() ? `Фото: ${m.body}` : 'Фото';
  if (k === 'file') return m.body?.trim() ? `Файл: ${m.body}` : 'Файл';
  if (k === 'story_reaction') return m.body || 'Реакция на историю';
  if (k === 'sticker') return m.body?.trim() ? `Стикер ${m.body}` : 'Стикер';
  return m.body || '';
}

/** Меню слева от точки касания (палец не попадает на первую кнопку). opts — доп. отступ от пальца. */
function clampMenuPosition(x, y, w, h, opts = {}) {
  const gapX = opts.gapX ?? 32;
  const gapY = opts.gapY ?? 22;
  if (typeof window === 'undefined') return { left: x - w - gapX, top: y - h - gapY };
  const vv = window.visualViewport;
  if (!vv) {
    const left = Math.max(8, Math.min(x - w - gapX, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(y - h - gapY, window.innerHeight - h - 8));
    return { left, top };
  }
  const ox = vv.offsetLeft;
  const oy = vv.offsetTop;
  const vw = vv.width;
  const vh = vv.height;
  const left = Math.max(ox + 8, Math.min(x - w - gapX, ox + vw - w - 8));
  let top = y - h - gapY;
  if (top < oy + 8) top = y + gapY;
  return { left, top: Math.max(oy + 8, Math.min(top, oy + vh - h - 8)) };
}

function ChatMessageReactions({ roomId, messageId, userId, reactions, onUpdate, align = 'flex-start' }) {
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoList, setWhoList] = useState([]);
  const counts = { ...emptyReactionCounts(), ...(reactions?.counts || {}) };
  for (const k of REACTION_KEYS) counts[k] = Number(counts[k]) || 0;
  const mineList = normalizeReactionMine(reactions?.mine);
  const keysToShow = REACTION_KEYS.filter((k) => (counts[k] ?? 0) > 0);
  if (keysToShow.length === 0) return null;
  const totalReactions = REACTION_KEYS.reduce((a, k) => a + (counts[k] ?? 0), 0);

  async function pick(key) {
    const path = `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reaction`;
    const { ok, data } = await api(path, {
      method: 'POST',
      body: { reaction: key },
      userId,
    });
    if (!ok) {
      if (data?.error) alert(data.error);
      return;
    }
    if (data?.reactions) onUpdate?.(data.reactions);
  }

  async function openWho() {
    const path = `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reactions`;
    const { ok, data } = await api(path, { userId });
    if (ok) setWhoList(data?.users || []);
    setWhoOpen(true);
  }

  return (
    <>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          gap: 4,
          marginTop: 6,
          flexWrap: 'wrap',
          justifyContent: align,
          alignItems: 'center',
        }}
      >
        {keysToShow.map((key) => {
          const n = counts[key] ?? 0;
          const active = mineList.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => void pick(key)}
              style={{
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 999,
                background: active ? 'rgba(193, 123, 75, 0.2)' : 'transparent',
                padding: '2px 8px',
                fontSize: 13,
                cursor: 'pointer',
                color: 'inherit',
                lineHeight: 1.3,
              }}
            >
              {REACTION_ICONS[key]}
              {n > 0 ? <span className="muted" style={{ fontSize: 10, marginLeft: 2 }}>{n}</span> : null}
            </button>
          );
        })}
        {totalReactions > 0 ? (
          <button
            type="button"
            className="btn-outline"
            style={{ fontSize: 10, padding: '2px 8px', minHeight: 0 }}
            onClick={() => void openWho()}
          >
            Кто
          </button>
        ) : null}
      </div>
      <ReactionUsersModal open={whoOpen} users={whoList} onClose={() => setWhoOpen(false)} />
    </>
  );
}

function MessageBubble({
  m,
  userId,
  roomId,
  formatTime,
  onReactionsLocalUpdate,
  onOpenActionMenu,
  onMentionProfile,
  allowSwipeReply = true,
  onSwipeReply,
  onOpenImagePreview,
  isFirstInGroup = true,
  isLastInGroup = true,
}) {
  const mine = m.senderId === userId;
  const kind = m.kind || 'text';
  const shellRef = useRef(null);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const block = (ev) => {
      ev.preventDefault();
    };
    el.addEventListener('selectstart', block);
    el.addEventListener('dragstart', block);
    return () => {
      el.removeEventListener('selectstart', block);
      el.removeEventListener('dragstart', block);
    };
  }, []);

  const lp = useLongPress(
    (x, y) => {
      onOpenActionMenu?.(m, x, y);
    },
    { ms: 480, moveTol: 12 },
  );

  const isMediaShell = kind === 'video_note' || kind === 'sticker';
  const isRevoked = kind === 'revoked' || m.revokedForAll;
  const bubbleRadius = telegramBubbleRadius(mine, isFirstInGroup, isLastInGroup);
  const bubbleBg = isRevoked
    ? mine
      ? 'var(--chat-bubble-revoked-out)'
      : 'var(--chat-bubble-revoked-in)'
    : mine
      ? 'var(--chat-bubble-outgoing)'
      : 'var(--chat-bubble-incoming)';

  let inner = null;
  if (isRevoked) {
    inner = (
      <p style={{ margin: 0, fontSize: 12, fontStyle: 'italic', opacity: 0.8 }}>Сообщение удалено</p>
    );
  } else if (kind === 'voice' && m.mediaUrl) {
    inner = <VoiceMessagePlayer src={m.mediaUrl} durationMs={m.durationMs} mine={mine} />;
  } else if (kind === 'video_note' && m.mediaUrl) {
    inner = (
      <div onPointerDown={(e) => e.stopPropagation()}>
        <VideoNoteInChat src={m.mediaUrl} durationMs={m.durationMs} />
      </div>
    );
  } else if (kind === 'sticker' && m.mediaUrl) {
    inner = (
      <div onPointerDown={(e) => e.stopPropagation()} style={{ lineHeight: 0 }}>
        <img
          src={m.mediaUrl}
          alt={m.body?.trim() ? m.body : ''}
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            maxWidth: 180,
            maxHeight: 180,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            verticalAlign: 'bottom',
          }}
        />
      </div>
    );
  } else if (kind === 'image' && m.mediaUrl) {
    inner = (
      <div style={{ minWidth: 0, maxWidth: '100%' }}>
        <img
          className="chat-media-inline-img"
          src={m.mediaUrl}
          alt={m.body?.trim() ? m.body : 'Фото'}
          title="Открыть полностью"
          loading="lazy"
          decoding="async"
          sizes="280px"
          style={{ display: 'block', verticalAlign: 'top' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenImagePreview?.(m.mediaUrl);
          }}
        />
        {m.body?.trim() ? (
          <div className="chat-image-caption">
            <MentionText text={m.body} onMentionClick={onMentionProfile} />
          </div>
        ) : null}
      </div>
    );
  } else if (kind === 'file' && m.mediaUrl && looksLikeVideoFileName(m.body)) {
    const cap = m.body?.trim() || '';
    inner = (
      <div style={{ minWidth: 0, maxWidth: 'var(--chat-bubble-max)' }} onPointerDown={(e) => e.stopPropagation()}>
        <video
          src={m.mediaUrl}
          controls
          playsInline
          preload="metadata"
          style={{ width: '100%', maxHeight: 360, borderRadius: 12, display: 'block', background: '#000' }}
        />
        {cap ? (
          <div className="chat-image-caption">
            <MentionText text={cap} onMentionClick={onMentionProfile} />
          </div>
        ) : null}
      </div>
    );
  } else if (kind === 'file' && m.mediaUrl) {
    const name = m.body?.trim() || 'Скачать файл';
    inner = (
      <a
        className="chat-file-chip"
        href={m.mediaUrl}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="chat-file-chip__icon" aria-hidden>
          📎
        </span>
        <span className="chat-file-chip__name">{name}</span>
      </a>
    );
  } else if (kind === 'story_reaction') {
    const rk = m.storyReactionKey;
    inner = (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {m.refStoryPreviewUrl ? (
          <img
            src={m.refStoryPreviewUrl}
            alt=""
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
          />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
        )}
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 22, lineHeight: 1.2 }}>{rk && REACTION_ICONS[rk] ? REACTION_ICONS[rk] : '💬'}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Реакция на историю
          </div>
        </div>
      </div>
    );
  } else {
    inner = <MentionText text={m.body} onMentionClick={onMentionProfile} />;
  }

  const swipeReplyDisabled = isRevoked || allowSwipeReply === false;

  return (
    <div
      className={mine ? 'chat-message-row chat-message-row--out' : 'chat-message-row chat-message-row--in'}
      style={{
        marginBottom: isLastInGroup ? 12 : 3,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <SwipeToReplyRow
        disabled={swipeReplyDisabled || !onSwipeReply}
        onReply={() => {
          const preview =
            m.kind === 'text'
              ? (m.body || '').trim().slice(0, 120)
              : getCopyTextForMessage(m).slice(0, 120);
          onSwipeReply?.({
            id: m.id,
            senderNickname: m.senderNickname || 'user',
            preview: preview || '·',
          });
        }}
      >
        <div
          ref={shellRef}
          className={`chat-message-bubble-shell chat-tg-bubble${!isMediaShell ? ' chat-message-bubble--solid' : ''}`}
          {...lp}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenActionMenu?.(m, e.clientX, e.clientY);
          }}
          style={{
            borderRadius: isMediaShell ? 0 : bubbleRadius,
            padding: isMediaShell ? 0 : undefined,
            background: isMediaShell ? 'transparent' : bubbleBg,
            overflow: isMediaShell ? 'visible' : 'hidden',
            maxWidth: isMediaShell ? 'var(--chat-bubble-max)' : undefined,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'manipulation',
          }}
        >
        {m.forwardFrom?.originalAuthorNickname ? (
          <div className="chat-bubble-forward-label muted">
            Переслано от @{m.forwardFrom.originalAuthorNickname}
          </div>
        ) : null}
        {m.replyTo ? (
          <div className="chat-bubble-reply">
            <div className="chat-bubble-reply__author">@{m.replyTo.senderNickname || 'user'}</div>
            <div className="chat-bubble-reply__preview">{m.replyTo.preview}</div>
          </div>
        ) : null}
        {!mine && !isRevoked && roomId && isFirstInGroup ? (
          <div className="chat-sender-name">
            @{m.senderNickname || 'user'}
            {m.senderAffiliationEmoji ? <span aria-hidden> {m.senderAffiliationEmoji}</span> : null}
          </div>
        ) : null}
        {inner}
        {!isRevoked ? (
        <ChatMessageReactions
          roomId={roomId}
          messageId={m.id}
          userId={userId}
          reactions={m.reactions}
          align={mine ? 'flex-end' : 'flex-start'}
          onUpdate={(r) => onReactionsLocalUpdate?.(m.id, r)}
        />
        ) : null}
        <div className="chat-bubble-meta-row">
          <span className="chat-bubble-time">
            {formatTime(m.createdAt)}
            {kind === 'text' && m.editedAt != null ? (
              <span title="Сообщение изменено" style={{ opacity: 0.9 }}>
                {' '}
                · изм.
              </span>
            ) : null}
          </span>
          {mine ? (
            <ChatReadReceipt readByPeer={m.readByPeer} deliveredToPeer={m.deliveredToPeer} pending={m.pending} />
          ) : null}
        </div>
        </div>
      </SwipeToReplyRow>
    </div>
  );
}

export default function RoomChatScreen({
  userId,
  roomId,
  roomTitle,
  onClose,
  lastEvent,
  onAfterChange,
  onOpenRoomInfo,
  onOpenProfileByUserId,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [videoModal, setVideoModal] = useState(false);
  /** Пустое поле: «кружок» (видео) ↔ микрофон (аудио) */
  const [mediaMode, setMediaMode] = useState('video');
  const [messageMenu, setMessageMenu] = useState(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState(null);
  const [replyDraft, setReplyDraft] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [caretPos, setCaretPos] = useState(0);
  const [roomMembers, setRoomMembers] = useState([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const composerInputRef = useRef(null);
  const chatFileInputRef = useRef(null);
  /** Не скроллить ленту сразу после отправки — иначе iOS снимает фокус с поля и закрывает клавиатуру. */
  const suppressChatScrollUntilRef = useRef(0);
  /** Автоскролл при новых сообщениях / resize только если пользователь у нижней границы ленты. */
  const stickToBottomRef = useRef(true);
  const loadEndedAtRef = useRef(0);
  const stickScrollRafRef = useRef(0);

  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const voiceCtxRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceTimerRef = useRef(null);
  const voiceBusyRef = useRef(false);
  const holdTimerRef = useRef(null);
  /** Становится true только если сработал таймер удержания (до старта записи). */
  const longPressArmedRef = useRef(false);
  const mediaModeRef = useRef('video');
  const HOLD_START_MS = 300;

  const scrollLayoutKey = useMemo(() => {
    const n = messages.length;
    if (n === 0) return '0';
    return `${n}:${messages[n - 1]?.id ?? ''}`;
  }, [messages]);

  useEffect(() => {
    mediaModeRef.current = mediaMode;
  }, [mediaMode]);

  useLeftEdgeSwipeBack(onClose, {
    disabled:
      videoModal ||
      voiceRecording ||
      messageMenu != null ||
      forwardOpen ||
      imagePreviewUrl != null ||
      stickerPanelOpen,
  });

  const onMentionProfile = useCallback(
    async (nick) => {
      const { ok, data } = await api(`/api/users/lookup/${encodeURIComponent(nick)}`, { userId });
      if (!ok) {
        alert(data?.error || 'Не удалось открыть профиль');
        return;
      }
      onOpenProfileByUserId?.(data.user.id);
    },
    [userId, onOpenProfileByUserId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    loadEndedAtRef.current = 0;
    setHasMoreOlder(false);
    const cached = loadRoomThreadCache(userId, roomId);
    setMessages(cached?.length ? cached.map(normalizeChatMessage) : []);
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/messages?limit=200`, { userId });
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить чат');
      setLoading(false);
      return;
    }
    const raw = data.messages || [];
    setMessages(raw.map(normalizeChatMessage));
    setHasMoreOlder(data.hasMore === true);
    saveRoomThreadCache(userId, roomId, raw);
    setErr(null);
    loadEndedAtRef.current = Date.now();
    setLoading(false);
  }, [roomId, userId]);

  const loadOlder = useCallback(async () => {
    if (!roomId || !userId || loadingOlder || !hasMoreOlder) return;
    const oldest = messages[0];
    if (!oldest?.id || oldest.createdAt == null) return;
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const q = new URLSearchParams({
        limit: '100',
        beforeCreatedAt: String(oldest.createdAt),
        beforeId: String(oldest.id),
      });
      const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/messages?${q.toString()}`, {
        userId,
      });
      if (!ok) return;
      const raw = data.messages || [];
      const batch = raw.map(normalizeChatMessage);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...batch.filter((m) => m.id && !seen.has(m.id)), ...prev];
      });
      setHasMoreOlder(data.hasMore === true);
      requestAnimationFrame(() => {
        const root = scrollRef.current;
        if (!root) return;
        root.scrollTop = prevScrollTop + (root.scrollHeight - prevScrollHeight);
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [roomId, userId, loadingOlder, hasMoreOlder, messages]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !userId) return undefined;
    let cancelled = false;
    (async () => {
      const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}`, { userId });
      if (cancelled || !ok || !data?.room?.members) return;
      setRoomMembers(data.room.members);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return undefined;
    let cancelled = false;
    (async () => {
      await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
      if (!cancelled) onAfterChange?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'room:message:new') return;
    if (lastEvent.payload?.roomId !== roomId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
    (async () => {
      await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
      onAfterChange?.();
    })();
  }, [lastEvent, roomId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'room:message:reaction') return;
    if (lastEvent.payload?.roomId !== roomId) return;
    const { messageId, reactions } = lastEvent.payload || {};
    if (!messageId || !reactions) return;
    setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, reactions } : x)));
  }, [lastEvent, roomId]);

  useEffect(() => {
    if (lastEvent?.type !== 'room:message:updated') return;
    if (lastEvent.payload?.roomId !== roomId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    onAfterChange?.();
  }, [lastEvent, roomId, onAfterChange]);

  useEffect(() => {
    if (!messageMenu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMessageMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [messageMenu]);

  /** Скролл ленты без scrollIntoView — на iOS scrollIntoView уводит фокус с поля и закрывает клавиатуру. */
  const scrollMessagesToBottomImmediate = useCallback(() => {
    scrollTimelineToBottom(scrollRef.current);
  }, []);

  /** Для ResizeObserver / visualViewport: только если «прилипли» к низу; не дёргать при чтении истории. */
  const scrollMessagesToBottom = useCallback(() => {
    if (typeof window !== 'undefined' && Date.now() < suppressChatScrollUntilRef.current) {
      return;
    }
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottomImmediate();
  }, [scrollMessagesToBottomImmediate]);

  const scheduleScrollToBottomIfStuck = useCallback(() => {
    if (typeof window !== 'undefined' && Date.now() < suppressChatScrollUntilRef.current) return;
    if (!stickToBottomRef.current) return;
    cancelAnimationFrame(stickScrollRafRef.current);
    stickScrollRafRef.current = requestAnimationFrame(() => {
      stickScrollRafRef.current = 0;
      scrollMessagesToBottom();
    });
  }, [scrollMessagesToBottom]);

  useLayoutEffect(() => {
    if (loading) return;
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottomImmediate();
    requestAnimationFrame(scrollMessagesToBottomImmediate);
  }, [scrollLayoutKey, loading, scrollMessagesToBottomImmediate]);

  useEffect(() => {
    const onWinResize = () => {
      scheduleScrollToBottomIfStuck();
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [scheduleScrollToBottomIfStuck]);

  const onVisualViewportSync = useCallback(() => {
    scheduleScrollToBottomIfStuck();
  }, [scheduleScrollToBottomIfStuck]);

  const vvRect = useVisualViewportRect(onVisualViewportSync);

  const messageMenuPosition = useMemo(() => {
    if (!messageMenu) return null;
    const sm = messageMenu.submenu ?? 'actions';
    if (sm === 'quick') {
      return clampMenuPosition(messageMenu.x, messageMenu.y, 304, 54, { gapX: 34, gapY: 26 });
    }
    if (sm === 'reactions') {
      const h =
        typeof window !== 'undefined' ? Math.min(280, Math.max(200, window.innerHeight * 0.38)) : 260;
      return clampMenuPosition(messageMenu.x, messageMenu.y, 300, h, { gapX: 34, gapY: 26 });
    }
    return clampMenuPosition(messageMenu.x, messageMenu.y, 268, 360, { gapX: 36, gapY: 28 });
  }, [messageMenu, vvRect]);

  const [showScrollDownFab, setShowScrollDownFab] = useState(false);
  const syncScrollDownFab = useCallback(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) {
      setShowScrollDownFab(false);
      return;
    }
    if (loading) return;
    if (loadEndedAtRef.current && Date.now() - loadEndedAtRef.current < POST_LOAD_STICK_MS) {
      stickToBottomRef.current = true;
      setShowScrollDownFab(false);
      const gapStick = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (gapStick > 6) scrollTimelineToBottom(el);
      return;
    }
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = gap <= 96;
    setShowScrollDownFab(gap > 96);
  }, [messages.length, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    syncScrollDownFab();

    let fabRaf = 0;
    const scheduleFabSync = () => {
      if (fabRaf) return;
      fabRaf = requestAnimationFrame(() => {
        fabRaf = 0;
        syncScrollDownFab();
      });
    };

    const onScroll = () => {
      scheduleFabSync();
      if (el.scrollTop < 120 && hasMoreOlder && !loadingOlder) {
        void loadOlder();
      }
    };

    const ro = new ResizeObserver(() => {
      scheduleScrollToBottomIfStuck();
      requestAnimationFrame(syncScrollDownFab);
    });
    ro.observe(el);

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (fabRaf) cancelAnimationFrame(fabRaf);
    };
  }, [
    syncScrollDownFab,
    scheduleScrollToBottomIfStuck,
    messages.length,
    hasMoreOlder,
    loadingOlder,
    loadOlder,
  ]);

  useEffect(() => {
    syncScrollDownFab();
  }, [scrollLayoutKey, loading, syncScrollDownFab]);

  const appendMessage = useCallback((m) => {
    const row = normalizeChatMessage(m);
    setMessages((prev) => {
      if (prev.some((x) => x.id === row.id)) return prev;
      return [...prev, row];
    });
  }, []);

  const sendChatAttachment = useCallback(
    async (file) => {
      if (!file) return;
      setMediaUploading(true);
      setErr(null);
      try {
        const isImg = (file.type || '').startsWith('image/');
        const { ok, data } = await apiUpload(`/api/rooms/${encodeURIComponent(roomId)}/messages/media`, {
          file,
          userId,
          fieldName: 'file',
          extraFields: {
            ...(isImg ? { caption: text.trim() } : {}),
            clientMessageId: newClientMessageId(),
          },
        });
        if (!ok) {
          setErr(data?.error || 'Не отправлено');
          return;
        }
        if (isImg && text.trim()) {
          setText('');
        }
        appendMessage(data.message);
        await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
        onAfterChange?.();
      } finally {
        setMediaUploading(false);
      }
    },
    [roomId, userId, text, appendMessage, onAfterChange],
  );

  const insertEmojiAtCaret = useCallback((ch) => {
    const el = composerInputRef.current;
    if (!el || !ch) return;
    const cur = text;
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + ch + cur.slice(end);
    setText(next);
    queueMicrotask(() => {
      el.focus();
      const pos = start + ch.length;
      el.setSelectionRange(pos, pos);
      setCaretPos(pos);
    });
  }, [text]);

  const sendStickerMessage = useCallback(
    async (packDir, file) => {
      if (!packDir || !file) return;
      setErr(null);
      setStickerPanelOpen(false);
      const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/messages/sticker`, {
        method: 'POST',
        userId,
        body: {
          packDir,
          file,
          replyToId: replyDraft?.id,
          clientMessageId: newClientMessageId(),
        },
      });
      if (!ok) {
        setErr(data?.error || 'Не отправлено');
        return;
      }
      setReplyDraft(null);
      appendMessage(data.message);
      await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
      onAfterChange?.();
    },
    [roomId, userId, replyDraft?.id, appendMessage, onAfterChange],
  );

  const stopVoiceGlobal = useRef(null);

  const stopVoiceAndSend = useCallback(async () => {
    const fn = stopVoiceGlobal.current;
    if (fn) await fn();
  }, []);

  const startVoice = useCallback(async () => {
    if (voiceBusyRef.current) return;
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      voiceStreamRef.current = stream;
      const mime = pickAudioMime();
      const audioRecOpts = { audioBitsPerSecond: 128_000 };
      if (mime) audioRecOpts.mimeType = mime;
      let mr;
      try {
        mr = new MediaRecorder(stream, audioRecOpts);
      } catch {
        mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      }
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      const started = Date.now();
      mr.start(180);
      voiceCtxRef.current = { mr, chunks, started };
      voiceBusyRef.current = true;
      setVoiceRecording(true);
      voiceTimerRef.current = setTimeout(() => {
        void stopVoiceAndSend();
      }, MAX_MS);

      const cleanupWindow = () => {
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      const onUp = async () => {
        cleanupWindow();
        await doStopVoice();
      };

      async function doStopVoice() {
        if (voiceTimerRef.current) {
          clearTimeout(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
        const ctx = voiceCtxRef.current;
        voiceCtxRef.current = null;
        voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
        voiceBusyRef.current = false;
        setVoiceRecording(false);
        stopVoiceGlobal.current = null;
        if (!ctx) return;
        const { mr: recorder, chunks: ch, started: t0 } = ctx;
        await new Promise((r) => {
          recorder.onstop = r;
          try {
            recorder.stop();
          } catch {
            r();
          }
        });
        const elapsed = Math.min(MAX_MS, Date.now() - t0);
        if (elapsed < MIN_MS) {
          setErr('Слишком коротко — удерживайте от 0,4 с');
          return;
        }
        const blob = new Blob(ch, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' });
        const { ok, data } = await apiUpload(`/api/rooms/${encodeURIComponent(roomId)}/messages/voice`, {
          file,
          userId,
          fieldName: 'file',
          extraFields: { durationMs: String(elapsed), clientMessageId: newClientMessageId() },
        });
        if (!ok) {
          setErr(data?.error || 'Не отправлено');
          return;
        }
        appendMessage(data.message);
        await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
        onAfterChange?.();
      }

      stopVoiceGlobal.current = doStopVoice;
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    } catch (e) {
      setErr(e?.message || 'Нет доступа к микрофону');
    }
  }, [roomId, userId, appendMessage, onAfterChange, stopVoiceAndSend]);

  useEffect(() => {
    return () => {
      void stopVoiceAndSend();
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      releaseCameraStreamNow();
    };
  }, [stopVoiceAndSend]);

  function refocusComposer() {
    const el = composerInputRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      if (typeof el.readOnly === 'boolean') {
        el.readOnly = true;
        el.readOnly = false;
      }
      el.focus({ preventScroll: true });
    } catch {
      el?.focus();
    }
  }

  /** Без <form>: на iOS submit формы часто закрывает клавиатуру. */
  async function sendTextMessage() {
    const t = text.trim();
    if (!t) return;
    if (editingMessageId) {
      const { ok, data } = await api(
        `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(editingMessageId)}`,
        { method: 'PATCH', body: { body: t }, userId },
      );
      if (!ok) {
        setErr(data?.error || 'Не удалось сохранить');
        return;
      }
      if (data?.message) {
        setMessages((prev) =>
          prev.map((x) => (x.id === editingMessageId ? normalizeChatMessage(data.message) : x)),
        );
      }
      suppressChatScrollUntilRef.current = Date.now() + 900;
      setEditingMessageId(null);
      setText('');
      setErr(null);
      queueMicrotask(() => {
        scrollMessagesToBottomImmediate();
        refocusComposer();
      });
      requestAnimationFrame(() => {
        refocusComposer();
        requestAnimationFrame(refocusComposer);
      });
      [40, 160, 320, 600, 1200].forEach((ms) => window.setTimeout(refocusComposer, ms));
      window.setTimeout(() => {
        void api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId }).then(() => {
          onAfterChange?.();
        });
      }, 450);
      return;
    }
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: 'POST',
      body: { body: t, replyToId: replyDraft?.id, clientMessageId: newClientMessageId() },
      userId,
    });
    if (!ok) {
      setErr(data?.error || 'Не отправлено');
      return;
    }
    suppressChatScrollUntilRef.current = Date.now() + 900;
    setText('');
    setReplyDraft(null);
    setErr(null);
    appendMessage(data.message);
    queueMicrotask(() => {
      scrollMessagesToBottomImmediate();
      refocusComposer();
    });
    requestAnimationFrame(() => {
      refocusComposer();
      requestAnimationFrame(refocusComposer);
    });
    [40, 160, 320, 600, 1200].forEach((ms) => window.setTimeout(refocusComposer, ms));
    window.setTimeout(() => {
      void api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId }).then(() => {
        onAfterChange?.();
      });
    }, 450);
  }

  function formatTime(ts) {
    if (ts == null) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Удержание в режиме «кружок»: полноэкранная запись (VideoNoteRecordModal). */
  function startVideoHoldFromComposer() {
    setErr(null);
    setVideoModal(true);
  }

  async function sendVideoNoteFromModal(file, durationMs) {
    const { ok, data } = await apiUpload(`/api/rooms/${encodeURIComponent(roomId)}/messages/video-note`, {
      file,
      userId,
      fieldName: 'file',
      extraFields: { durationMs: String(durationMs), clientMessageId: newClientMessageId() },
    });
    if (!ok) {
      throw new Error(data?.error || 'Не отправлено');
    }
    appendMessage(data.message);
    await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
    onAfterChange?.();
  }

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onMediaButtonPointerDown(e) {
    e.preventDefault();
    longPressArmedRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      longPressArmedRef.current = true;
      const mode = mediaModeRef.current;
      void (async () => {
        try {
          if (mode === 'voice') await startVoice();
          else await startVideoHoldFromComposer();
        } catch {
          longPressArmedRef.current = false;
        }
      })();
    }, HOLD_START_MS);
  }

  function onMediaButtonPointerUp() {
    clearHoldTimer();
    if (voiceRecording) {
      void stopVoiceAndSend();
      longPressArmedRef.current = false;
      return;
    }
    if (!longPressArmedRef.current) {
      setMediaMode((m) => (m === 'video' ? 'voice' : 'video'));
    }
    longPressArmedRef.current = false;
  }

  function onMediaButtonPointerCancel() {
    clearHoldTimer();
    longPressArmedRef.current = false;
  }

  const hasTypedText = Boolean(text.trim());

  const mentionCandidates = useMemo(() => {
    return (roomMembers || [])
      .filter((m) => m.nickname)
      .map((m) => ({
        nickname: m.nickname,
        id: m.id,
        label: [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.nickname,
      }));
  }, [roomMembers]);

  const handleMentionPick = useCallback(
    (nickname, mentionState) => {
      if (!mentionState) return;
      const before = text.slice(0, mentionState.start);
      const after = text.slice(mentionState.end);
      const insert = `@${nickname} `;
      const next = before + insert + after;
      setText(next);
      const pos = before.length + insert.length;
      queueMicrotask(() => {
        const el = composerInputRef.current;
        if (el && typeof el.setSelectionRange === 'function') {
          el.setSelectionRange(pos, pos);
        }
        setCaretPos(pos);
      });
    },
    [text],
  );

  const timelineWallpaperStyle = useChatWallpaperTimelineStyle(userId);

  useLayoutEffect(() => {
    const el = composerInputRef.current;
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 130)}px`;
  }, [text]);

  return (
    <>
      <ChatScaffold
        vvRect={vvRect}
        zIndex={80}
        timelineSurfaceStyle={timelineWallpaperStyle}
        top={
          <header className="chat-screen-header">
        <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Назад">
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--accent)' }}>#</span> {roomTitle || 'Комната'}
          </div>
          <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
            Групповой чат
          </div>
        </div>
        {onOpenRoomInfo ? (
          <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onOpenRoomInfo} aria-label="Об участниках">
            ℹ
          </button>
        ) : null}
          </header>
        }
        timelineRef={scrollRef}
        timeline={
          <div style={CHAT_TIMELINE_STACK_STYLE}>
            {loading ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Загрузка…
              </p>
            ) : err && messages.length === 0 ? (
              <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
            ) : messages.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Нет сообщений. Тап по кружку/микрофону справа переключает режим, удержание — запись (до 15 с).
              </p>
            ) : (
              <>
                {hasMoreOlder || loadingOlder ? (
                  <div className="muted" style={{ fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
                    {loadingOlder ? 'Загрузка более ранних сообщений…' : 'Прокрутите вверх, чтобы подгрузить историю'}
                  </div>
                ) : null}
                {messages.map((m, i) => {
                const g = messageGroupFlags(messages, i);
                return (
                <MessageBubble
                  key={m.id}
                  m={m}
                  userId={userId}
                  roomId={roomId}
                  formatTime={formatTime}
                  isFirstInGroup={g.isFirstInGroup}
                  isLastInGroup={g.isLastInGroup}
                  allowSwipeReply
                  onSwipeReply={(draft) => {
                    setReplyDraft(draft);
                    queueMicrotask(() => refocusComposer());
                  }}
                  onReactionsLocalUpdate={(id, reactions) =>
                    setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, reactions } : x)))
                  }
                  onOpenActionMenu={(msg, x, y) => setMessageMenu({ m: msg, x, y, submenu: 'quick' })}
                  onMentionProfile={onMentionProfile}
                  onOpenImagePreview={(url) => setImagePreviewUrl(url)}
                />
                );
              })}
              </>
            )}
            <div
              ref={messagesEndRef}
              aria-hidden
              style={{ height: 1, width: '100%', overflow: 'hidden', flexShrink: 0 }}
            />
          </div>
        }
        errorBanner={
          err && messages.length > 0 ? (
            <div style={{ padding: '0 12px', fontSize: 11, color: '#c45c5c' }}>{err}</div>
          ) : null
        }
        footer={
          <div
            role="group"
            aria-label="Поле сообщения"
            className="chat-composer-bar"
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            {editingMessageId ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 0 8px',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: 6,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="muted" style={{ fontSize: 10 }}>
                    Редактирование сообщения
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>Под текстом будет пометка «изменено»</div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Отменить редактирование"
                  style={{ width: 32, height: 32, flexShrink: 0 }}
                  onClick={() => {
                    setEditingMessageId(null);
                    setText('');
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
            {replyDraft && !editingMessageId ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 0 8px',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: 6,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="muted" style={{ fontSize: 10 }}>
                    Ответ @{replyDraft.senderNickname || 'user'}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: 0.9 }}>{replyDraft.preview}</div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Отменить ответ"
                  style={{ width: 32, height: 32, flexShrink: 0 }}
                  onClick={() => setReplyDraft(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, width: '100%' }}>
            <input
              ref={chatFileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.7z"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void sendChatAttachment(f);
              }}
            />
            <button
              type="button"
              className="icon-btn"
              disabled={mediaUploading || voiceRecording || videoModal}
              aria-label="Прикрепить фото или файл"
              onClick={() => chatFileInputRef.current?.click()}
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                fontSize: 18,
                opacity: mediaUploading ? 0.55 : 1,
              }}
            >
              {mediaUploading ? (
                <span style={{ fontSize: 16, lineHeight: 1 }}>…</span>
              ) : (
                <ChatComposerIcon name="attach" fallback="📎" alt="" size={22} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={mediaUploading || voiceRecording || videoModal}
              aria-label="Стикеры и эмодзи"
              onClick={() => setStickerPanelOpen((v) => !v)}
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                opacity: stickerPanelOpen ? 1 : 0.9,
                background: stickerPanelOpen ? 'rgba(127,127,127,0.15)' : undefined,
              }}
            >
              <ChatComposerIcon name="stickers" fallback="😀" alt="" size={22} />
            </button>
            <div className="chat-composer-field-wrap">
              <MentionAutocomplete
                candidates={mentionCandidates}
                text={text}
                caretPos={caretPos}
                onPick={handleMentionPick}
              />
              <textarea
                ref={composerInputRef}
                className="text-input chat-composer-textarea"
                style={{ width: '100%' }}
                rows={1}
                placeholder="Сообщение…"
                value={text}
                enterKeyHint="send"
                onChange={(e) => {
                  setText(e.target.value);
                  setCaretPos(e.target.selectionStart ?? 0);
                }}
                onSelect={(e) => setCaretPos(e.target.selectionStart ?? 0)}
                onClick={(e) => setCaretPos(e.target.selectionStart ?? 0)}
                onKeyUp={(e) => setCaretPos(e.target.selectionStart ?? 0)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && editingMessageId) {
                    e.preventDefault();
                    setEditingMessageId(null);
                    setText('');
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendTextMessage();
                  }
                }}
                onFocus={() => {
                  stickToBottomRef.current = true;
                  scrollMessagesToBottomImmediate();
                  requestAnimationFrame(scrollMessagesToBottomImmediate);
                }}
                maxLength={4000}
              />
            </div>
        {hasTypedText ? (
          <button
            type="button"
            className="chat-send-btn"
            aria-label="Отправить"
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void sendTextMessage()}
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontSize: 20,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              touchAction: 'manipulation',
            }}
          >
            ➤
          </button>
        ) : (
          <button
            type="button"
            className="chat-media-record-btn"
            aria-label={mediaMode === 'video' ? 'Видеокружок. Тап — переключить на аудио. Удержать — записать.' : 'Голос. Тап — переключить на кружок. Удержать — записать.'}
            onPointerDown={onMediaButtonPointerDown}
            onPointerUp={onMediaButtonPointerUp}
            onPointerCancel={onMediaButtonPointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: '50%',
              border: `2px solid ${voiceRecording ? 'var(--accent)' : mediaMode === 'video' ? 'var(--border)' : 'var(--border)'}`,
              background: voiceRecording ? 'rgba(193, 123, 75, 0.15)' : 'transparent',
              fontSize: mediaMode === 'video' ? 20 : 19,
              cursor: 'pointer',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              touchAction: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
            }}
          >
            <ChatComposerIcon
              name={mediaMode === 'video' ? 'video' : 'mic'}
              fallback={mediaMode === 'video' ? '◉' : '🎤'}
              alt=""
              size={mediaMode === 'video' ? 22 : 21}
            />
          </button>
        )}
            </div>
          </div>
        }
      />

      <ChatScrollDownFab
        visible={showScrollDownFab}
        scrollRef={scrollRef}
        bottomOffsetPx={92}
        onJumpToBottom={() => {
          stickToBottomRef.current = true;
        }}
      />

      <ChatStickerPanel
        open={stickerPanelOpen}
        onClose={() => setStickerPanelOpen(false)}
        userId={userId}
        disabled={mediaUploading || voiceRecording || Boolean(videoModal)}
        onEmojiPick={(em) => {
          insertEmojiAtCaret(em);
        }}
        onSendSticker={sendStickerMessage}
      />

      {voiceRecording && !videoModal ? (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: 0,
            right: 0,
            textAlign: 'center',
            pointerEvents: 'none',
            fontSize: 12,
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          Запись голоса… отпустите (до 15 с)
        </div>
      ) : null}

      <VideoNoteRecordModal
        open={videoModal}
        onClose={() => setVideoModal(false)}
        onSend={async (file, durationMs) => {
          await sendVideoNoteFromModal(file, durationMs);
        }}
      />

      {messageMenu ? (
        <>
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 94,
              background: 'rgba(0,0,0,0.4)',
            }}
            onClick={() => setMessageMenu(null)}
          />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              zIndex: 95,
              width:
                (messageMenu.submenu ?? 'actions') === 'quick'
                  ? 'auto'
                  : (messageMenu.submenu ?? 'actions') === 'reactions'
                    ? 300
                    : 260,
              maxWidth: 'min(304px, calc(100vw - 20px))',
              ...(messageMenuPosition || { left: 8, top: 8 }),
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              padding: (messageMenu.submenu ?? 'actions') === 'quick' ? '6px 8px' : 10,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {(messageMenu.submenu ?? 'actions') === 'quick' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                {QUICK_REACTION_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={`Реакция ${k}`}
                    onClick={async () => {
                      const msg = messageMenu.m;
                      const { ok, data } = await api(
                        `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(msg.id)}/reaction`,
                        { method: 'POST', body: { reaction: k }, userId },
                      );
                      if (!ok) {
                        if (data?.error) alert(data.error);
                      } else if (data?.reactions) {
                        setMessages((prev) => prev.map((x) => (x.id === msg.id ? { ...x, reactions: data.reactions } : x)));
                      }
                      setMessageMenu(null);
                    }}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.06)',
                      fontSize: 20,
                      cursor: 'pointer',
                      color: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    {REACTION_ICONS[k]}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Все реакции"
                  title="Все реакции"
                  onClick={() => setMessageMenu((prev) => (prev ? { ...prev, submenu: 'reactions' } : null))}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.04)',
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                    color: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  ···
                </button>
                <button
                  type="button"
                  aria-label="Другие действия"
                  onClick={() => setMessageMenu((prev) => (prev ? { ...prev, submenu: 'actions' } : null))}
                  style={{
                    padding: '0 10px',
                    height: 42,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.06)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  Ещё
                </button>
              </div>
            ) : null}
            {(messageMenu.submenu ?? 'actions') === 'reactions' ? (
              <>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
                  onClick={() => setMessageMenu((prev) => (prev ? { ...prev, submenu: 'quick' } : null))}
                >
                  ← К быстрым
                </button>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    maxHeight: 'min(240px, 42vh)',
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {REACTION_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={async () => {
                        const msg = messageMenu.m;
                        const { ok, data } = await api(
                          `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(msg.id)}/reaction`,
                          { method: 'POST', body: { reaction: k }, userId },
                        );
                        if (!ok) {
                          if (data?.error) alert(data.error);
                        } else if (data?.reactions) {
                          setMessages((prev) => prev.map((x) => (x.id === msg.id ? { ...x, reactions: data.reactions } : x)));
                        }
                        setMessageMenu(null);
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.04)',
                        fontSize: 18,
                        cursor: 'pointer',
                        color: 'inherit',
                      }}
                    >
                      {REACTION_ICONS[k]}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {(messageMenu.submenu ?? 'actions') === 'actions' ? (
              <>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ width: '100%', marginBottom: 10, fontSize: 12 }}
                  onClick={() => setMessageMenu((prev) => (prev ? { ...prev, submenu: 'quick' } : null))}
                >
                  ← К реакциям
                </button>
            {messageMenu.m.kind !== 'revoked' && !messageMenu.m.revokedForAll ? (
              <button
                type="button"
                className="btn-outline"
                style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
                onClick={() => {
                  const msg = messageMenu.m;
                  const preview =
                    msg.kind === 'text'
                      ? (msg.body || '').trim().slice(0, 120)
                      : getCopyTextForMessage(msg).slice(0, 120);
                  setReplyDraft({
                    id: msg.id,
                    senderNickname: msg.senderNickname || 'user',
                    preview: preview || '·',
                  });
                  setMessageMenu(null);
                }}
              >
                Ответить
              </button>
            ) : null}
            {messageMenu.m.senderId === userId &&
            messageMenu.m.kind === 'text' &&
            !messageMenu.m.revokedForAll ? (
              <button
                type="button"
                className="btn-outline"
                style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
                onClick={() => {
                  const msg = messageMenu.m;
                  setEditingMessageId(msg.id);
                  setText(msg.body || '');
                  setReplyDraft(null);
                  setMessageMenu(null);
                  queueMicrotask(() => refocusComposer());
                }}
              >
                Изменить
              </button>
            ) : null}
            <button
              type="button"
              className="btn-outline"
              style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
              onClick={async () => {
                const t = getCopyTextForMessage(messageMenu.m);
                try {
                  await navigator.clipboard.writeText(t);
                } catch {
                  setErr('Не удалось скопировать');
                }
                setMessageMenu(null);
              }}
            >
              Скопировать
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
              onClick={async () => {
                const msg = messageMenu.m;
                setMessageMenu(null);
                const { ok, data } = await api(
                  `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(msg.id)}/delete-for-me`,
                  { method: 'POST', userId },
                );
                if (!ok) {
                  setErr(data?.error || 'Не удалось удалить');
                  return;
                }
                setMessages((prev) => prev.filter((x) => x.id !== msg.id));
                onAfterChange?.();
              }}
            >
              Удалить у себя
            </button>
            {messageMenu.m.senderId === userId &&
            messageMenu.m.kind !== 'revoked' &&
            !messageMenu.m.revokedForAll ? (
              <button
                type="button"
                className="btn-outline"
                style={{ width: '100%', marginBottom: 8, fontSize: 12, color: '#c45c5c', borderColor: 'rgba(196,92,92,0.45)' }}
                onClick={async () => {
                  const msg = messageMenu.m;
                  setMessageMenu(null);
                  const { ok, data } = await api(
                    `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(msg.id)}/delete-for-everyone`,
                    { method: 'POST', userId },
                  );
                  if (!ok) {
                    setErr(data?.error || 'Не удалось удалить');
                    return;
                  }
                  if (data?.message) {
                    setMessages((prev) => prev.map((x) => (x.id === msg.id ? normalizeChatMessage(data.message) : x)));
                  }
                  onAfterChange?.();
                }}
              >
                Удалить у всех
              </button>
            ) : null}
            {messageMenu.m.kind !== 'revoked' && !messageMenu.m.revokedForAll ? (
              <button
                type="button"
                className="btn-outline"
                style={{ width: '100%', fontSize: 12 }}
                onClick={() => {
                  const id = messageMenu.m.id;
                  setMessageMenu(null);
                  setForwardMessageId(id);
                  setForwardOpen(true);
                }}
              >
                Переслать…
              </button>
            ) : null}
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {forwardOpen && forwardMessageId ? (
        <ForwardMessageModal
          open
          onClose={() => {
            setForwardOpen(false);
            setForwardMessageId(null);
          }}
          userId={userId}
          source={{ type: 'room', id: roomId }}
          messageId={forwardMessageId}
          onAfterForward={() => onAfterChange?.()}
        />
      ) : null}

      {imagePreviewUrl ? (
        <AvatarLightbox fullSize url={imagePreviewUrl} onClose={() => setImagePreviewUrl(null)} />
      ) : null}
    </>
  );
}
