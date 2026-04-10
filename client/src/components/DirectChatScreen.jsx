import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import { api, apiUpload } from '../api.js';
import VoiceMessagePlayer from './VoiceMessagePlayer.jsx';
import VideoNoteInChat from './chat/VideoNoteInChat.jsx';
import MentionText from './chat/MentionText.jsx';
import MentionAutocomplete from './chat/MentionAutocomplete.jsx';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import ChatScaffold from './chat/ChatScaffold.jsx';
import ChatScrollDownFab from './chat/ChatScrollDownFab.jsx';
import SwipeToReplyRow from './chat/SwipeToReplyRow.jsx';
import ForwardMessageModal from './ForwardMessageModal.jsx';
import ReactionUsersModal from './ReactionUsersModal.jsx';
import { REACTION_KEYS, REACTION_ICONS } from '../reactionConstants.js';
import { useVisualViewportRect } from '../hooks/useVisualViewportRect.js';
import {
  getOrCreateCameraStream,
  scheduleReleaseCameraStream,
  releaseCameraStreamNow,
} from '../cameraSession.js';

const MAX_MS = 15000;
const MIN_MS = 400;

/** Лента «прижата» к низу при малом числе сообщений — иначе жест и колесо ощущаются перевёрнутыми. */
const CHAT_TIMELINE_STACK_STYLE = {
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  boxSizing: 'border-box',
};

function formatRuSeenAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return 'только что';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(diff / 3_600_000);
  const minsRem = Math.floor((diff % 3_600_000) / 60_000);
  if (diff < 86_400_000) {
    if (minsRem < 2) return `${hours} ч назад`;
    return `${hours} ч ${minsRem} мин назад`;
  }
  try {
    return new Date(ts).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'давно';
  }
}

function peerPresenceSubtitle(online, lastSeenAt, lastSeenHidden) {
  if (online === true) return 'онлайн';
  if (lastSeenHidden) return 'был(а) недавно';
  if (online === false && typeof lastSeenAt === 'number' && lastSeenAt > 0) {
    return `был(а) в сети · ${formatRuSeenAgo(lastSeenAt)}`;
  }
  if (online === false) return 'не в сети';
  return null;
}
/** Видеокружок можно чуть короче голоса. */
const MIN_MS_VIDEO = 320;

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return 'video/webm;codecs=vp8,opus';
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
  if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) return 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
  return '';
}

/** Длина обводки SVG (прогресс записи кружка). */
const VIDEO_RING_R = 118;
const VIDEO_RING_LEN = 2 * Math.PI * VIDEO_RING_R;

function buildVideoNoteFile(blob, mr) {
  const rawMime = (mr.mimeType || blob.type || '').trim().toLowerCase();
  let ext = 'webm';
  let fileType = 'video/webm';
  if (rawMime.startsWith('video/')) {
    fileType = rawMime.split(';')[0];
    if (rawMime.includes('mp4') || rawMime.includes('quicktime')) ext = 'mp4';
    else if (rawMime.includes('webm')) ext = 'webm';
    else ext = 'mp4';
  } else if (rawMime.startsWith('audio/webm')) {
    fileType = 'video/webm';
    ext = 'webm';
  } else if (rawMime.includes('mp4')) {
    fileType = 'video/mp4';
    ext = 'mp4';
  } else {
    const fallback = pickVideoMime();
    if (fallback.includes('mp4')) {
      fileType = 'video/mp4';
      ext = 'mp4';
    }
  }
  return new File([blob], `note.${ext}`, { type: fileType });
}

function formatDur(ms) {
  if (ms == null || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return m > 0 ? `${m}:${String(rs).padStart(2, '0')}` : `0:${String(rs).padStart(2, '0')}`;
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
    senderAffiliationEmoji: m.senderAffiliationEmoji ?? null,
    revokedForAll: m.revokedForAll === true,
    replyTo: m.replyTo ?? null,
    forwardFrom: m.forwardFrom ?? null,
    editedAt: m.editedAt != null ? m.editedAt : null,
    pinnedForMe: m.pinnedForMe === true,
    pinnedShared: m.pinnedShared === true,
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
  return m.body || '';
}

/** Меню слева от точки касания (палец не попадает на первую кнопку). */
function clampMenuPosition(x, y, w, h) {
  const gapX = 22;
  const gapY = 16;
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

function ChatMessageReactions({ chatId, roomId, messageId, userId, reactions, onUpdate, align = 'flex-start' }) {
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoList, setWhoList] = useState([]);
  const counts = reactions?.counts ?? { up: 0, down: 0, fire: 0, poop: 0 };
  const mine = reactions?.mine ?? null;
  const keysToShow = REACTION_KEYS.filter((k) => (counts[k] ?? 0) > 0);
  if (keysToShow.length === 0) return null;
  const totalReactions = REACTION_KEYS.reduce((a, k) => a + (counts[k] ?? 0), 0);

  async function pick(key) {
    const path = roomId
      ? `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reaction`
      : `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reaction`;
    const { ok, data } = await api(path, {
      method: 'POST',
      body: { reaction: key },
      userId,
    });
    if (ok && data?.reactions) onUpdate?.(data.reactions);
  }

  async function openWho() {
    const path = roomId
      ? `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reactions`
      : `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reactions`;
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
          const active = mine === key;
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

function pinChipPreview(m) {
  const k = m.kind || 'text';
  if (k === 'voice') return '🎤 Голосовое';
  if (k === 'video_note') return '🎬 Видео';
  if (k === 'image') return '🖼 Фото';
  if (k === 'file') return '📎 Файл';
  if (k === 'story_reaction') return 'История';
  return (m.body || '').trim().slice(0, 36) || '…';
}

function MessageBubble({
  m,
  userId,
  chatId,
  roomId,
  formatTime,
  onReactionsLocalUpdate,
  onOpenActionMenu,
  onMentionProfile,
  allowSwipeReply = true,
  onSwipeReply,
  savedChat = false,
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

  const isMediaShell = kind === 'voice' || kind === 'video_note';
  const isRevoked = kind === 'revoked' || m.revokedForAll;

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
  } else if (kind === 'image' && m.mediaUrl) {
    inner = (
      <div style={{ maxWidth: 280 }}>
        <img
          className="chat-media-inline-img"
          src={m.mediaUrl}
          alt={m.body?.trim() ? m.body : ''}
          loading="lazy"
          decoding="async"
          sizes="(max-width: 480px) 90vw, 280px"
          style={{ maxWidth: '100%', borderRadius: 12, display: 'block', verticalAlign: 'top' }}
        />
        {m.body?.trim() ? (
          <div style={{ marginTop: 8 }}>
            <MentionText text={m.body} onMentionClick={onMentionProfile} />
          </div>
        ) : null}
      </div>
    );
  } else if (kind === 'file' && m.mediaUrl && looksLikeVideoFileName(m.body)) {
    const cap = m.body?.trim() || '';
    inner = (
      <div style={{ maxWidth: 280 }} onPointerDown={(e) => e.stopPropagation()}>
        <video
          src={m.mediaUrl}
          controls
          playsInline
          preload="metadata"
          style={{ width: '100%', maxHeight: 360, borderRadius: 12, display: 'block', background: '#000' }}
        />
        {cap ? (
          <div style={{ marginTop: 8 }}>
            <MentionText text={cap} onMentionClick={onMentionProfile} />
          </div>
        ) : null}
      </div>
    );
  } else if (kind === 'file' && m.mediaUrl) {
    const name = m.body?.trim() || 'Скачать файл';
    inner = (
      <a
        href={m.mediaUrl}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid var(--border)',
          color: 'inherit',
          textDecoration: 'none',
          maxWidth: 280,
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden>
          📎
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
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
      id={m.id ? `chat-msg-${m.id}` : undefined}
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        width: '100%',
        minWidth: 0,
        marginBottom: 8,
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
          className="chat-message-bubble-shell"
          {...lp}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenActionMenu?.(m, e.clientX, e.clientY);
          }}
          style={{
            display: 'inline-block',
            maxWidth: '92%',
            minWidth: 0,
            verticalAlign: 'top',
            border: isMediaShell ? 'none' : '1px solid var(--border)',
            borderRadius: isMediaShell ? 0 : 'var(--radius)',
            padding: isMediaShell ? 0 : '8px 10px',
            fontSize: 13,
            background: isMediaShell ? 'transparent' : mine ? 'rgba(193, 123, 75, 0.12)' : 'transparent',
            boxShadow: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'manipulation',
          }}
        >
        {m.forwardFrom?.originalAuthorNickname ? (
          <div className="muted" style={{ fontSize: 10, marginBottom: 6, lineHeight: 1.3 }}>
            Переслано от @{m.forwardFrom.originalAuthorNickname}
          </div>
        ) : null}
        {m.replyTo ? (
          <div
            style={{
              borderLeft: '3px solid var(--accent)',
              paddingLeft: 8,
              marginBottom: 8,
              opacity: 0.92,
            }}
          >
            <div className="muted" style={{ fontSize: 10 }}>
              @{m.replyTo.senderNickname || 'user'}
            </div>
            <div style={{ fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>{m.replyTo.preview}</div>
          </div>
        ) : null}
        {!mine && !isRevoked ? (
          <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>
            @{m.senderNickname || 'user'}
            {m.senderAffiliationEmoji ? <span aria-hidden> {m.senderAffiliationEmoji}</span> : null}
          </div>
        ) : null}
        {inner}
        {!isRevoked ? (
        <ChatMessageReactions
          chatId={chatId}
          roomId={roomId}
          messageId={m.id}
          userId={userId}
          reactions={m.reactions}
          align={mine ? 'flex-end' : 'flex-start'}
          onUpdate={(r) => onReactionsLocalUpdate?.(m.id, r)}
        />
        ) : null}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            justifyContent: mine ? 'flex-end' : 'flex-start',
          }}
        >
          <span className="muted" style={{ fontSize: 9 }}>
            {m.pinnedForMe ? (
              <span title={m.pinnedShared ? 'Закреплено для обоих' : 'Закреплено у вас'} aria-hidden>
                📌{' '}
              </span>
            ) : null}
            {formatTime(m.createdAt)}
            {kind === 'text' && m.editedAt != null ? (
              <span title="Сообщение изменено" style={{ opacity: 0.85 }}>
                {' '}
                · изменено
              </span>
            ) : null}
          </span>
          {mine && !roomId && !savedChat ? (
            <span
              style={{
                fontSize: 12,
                lineHeight: 1,
                color: m.readByPeer ? 'var(--online)' : 'var(--muted)',
                opacity: m.readByPeer ? 1 : 0.85,
              }}
              title={m.readByPeer ? 'Прочитано' : 'Доставлено'}
              aria-hidden
            >
              ✓✓
            </span>
          ) : null}
        </div>
        </div>
      </SwipeToReplyRow>
    </div>
  );
}

export default function DirectChatScreen({
  userId,
  chatId,
  peerLabel,
  peerNickname,
  peerAffiliationEmoji,
  peerUserId,
  peerAvatarUrl,
  peerOnline,
  peerLastSeenAt,
  peerLastSeenHidden = false,
  onClose,
  lastEvent,
  onAfterChange,
  onOpenPeerProfile,
  onOpenProfileByUserId,
  canMessage = true,
  friendsActive = true,
  isSavedMessages = false,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [videoModal, setVideoModal] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  /** Пустое поле: «кружок» (видео) ↔ микрофон (аудио) */
  const [mediaMode, setMediaMode] = useState('video');
  const [messageMenu, setMessageMenu] = useState(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState(null);
  const [replyDraft, setReplyDraft] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [caretPos, setCaretPos] = useState(0);
  const [mediaUploading, setMediaUploading] = useState(false);
  const composerInputRef = useRef(null);
  const chatFileInputRef = useRef(null);
  /** Не скроллить ленту сразу после отправки — иначе iOS снимает фокус с поля и закрывает клавиатуру. */
  const suppressChatScrollUntilRef = useRef(0);
  /** Автоскролл при новых сообщениях / resize только если пользователь у нижней границы ленты. */
  const stickToBottomRef = useRef(true);
  /** Первые мс после загрузки истории не сбрасываем «прилипание к низу» (иначе scrollTop=0 даёт ложный «не внизу»). */
  const loadEndedAtRef = useRef(0);

  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const voiceCtxRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceTimerRef = useRef(null);
  const voiceBusyRef = useRef(false);
  const videoStreamRef = useRef(null);
  const videoElRef = useRef(null);
  const videoRecRef = useRef(null);
  const videoTimerRef = useRef(null);
  const videoPointerCleanupRef = useRef(null);
  const videoRingAccentRef = useRef(null);
  const holdTimerRef = useRef(null);
  /** Длительность текущей записи кружка (мс), для таймера в UI. */
  const [videoRecordElapsedMs, setVideoRecordElapsedMs] = useState(0);
  /** Становится true только если сработал таймер удержания (до старта записи). */
  const longPressArmedRef = useRef(false);
  const mediaModeRef = useRef('video');
  const HOLD_START_MS = 300;

  useEffect(() => {
    mediaModeRef.current = mediaMode;
  }, [mediaMode]);

  useEffect(() => {
    if (!videoModal || !videoRecording) {
      setVideoRecordElapsedMs(0);
      return undefined;
    }
    const id = window.setInterval(() => {
      const s = videoRecRef.current?.started;
      setVideoRecordElapsedMs(s ? Math.min(MAX_MS, Date.now() - s) : 0);
    }, 100);
    return () => window.clearInterval(id);
  }, [videoModal, videoRecording]);

  useEffect(() => {
    if (!videoModal || !videoRecording) return undefined;
    let raf = 0;
    const tick = () => {
      const ctx = videoRecRef.current;
      const el = videoRingAccentRef.current;
      if (!ctx || !el) return;
      const p = Math.min(1, (Date.now() - ctx.started) / MAX_MS);
      el.setAttribute('stroke-dashoffset', String(VIDEO_RING_LEN * (1 - p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoModal, videoRecording]);

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
    setMessages([]);
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`, { userId });
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить чат');
      setLoading(false);
      return;
    }
    setMessages((data.messages || []).map(normalizeChatMessage));
    setErr(null);
    loadEndedAtRef.current = Date.now();
    setLoading(false);
  }, [chatId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !userId) return undefined;
    let cancelled = false;
    (async () => {
      await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
      if (!cancelled) onAfterChange?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:new') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
    (async () => {
      await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
      onAfterChange?.();
    })();
  }, [lastEvent, chatId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:peerRead') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const readAt = lastEvent.payload.readAt;
    if (readAt == null) return;
    setMessages((prev) =>
      prev.map((msg) =>
        msg.senderId === userId && (msg.createdAt ?? 0) <= readAt ? { ...msg, readByPeer: true } : msg,
      ),
    );
  }, [lastEvent, chatId, userId]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:reaction') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const { messageId, reactions } = lastEvent.payload || {};
    if (!messageId || !reactions) return;
    setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, reactions } : x)));
  }, [lastEvent, chatId]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:updated') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    onAfterChange?.();
  }, [lastEvent, chatId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:pinsChanged') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    void load();
  }, [lastEvent, chatId, load]);

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
    const root = scrollRef.current;
    if (root) {
      root.scrollTop = root.scrollHeight;
    }
  }, []);

  /** Для ResizeObserver / visualViewport: только если «прилипли» к низу; не дёргать при чтении истории. */
  const scrollMessagesToBottom = useCallback(() => {
    if (typeof window !== 'undefined' && Date.now() < suppressChatScrollUntilRef.current) {
      return;
    }
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottomImmediate();
  }, [scrollMessagesToBottomImmediate]);

  /** Новые сообщения — вниз только пока пользователь у последних (при входе в чат — всегда). */
  useLayoutEffect(() => {
    if (loading) return;
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottomImmediate();
    const a = requestAnimationFrame(() => {
      scrollMessagesToBottomImmediate();
      requestAnimationFrame(() => scrollMessagesToBottomImmediate());
    });
    return () => cancelAnimationFrame(a);
  }, [messages, loading, scrollMessagesToBottomImmediate]);

  /** После смены высоты области (клавиатура, vv) — без лишних отложенных каскадов, один кадр. */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (typeof window !== 'undefined' && Date.now() < suppressChatScrollUntilRef.current) {
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        scrollMessagesToBottom();
      });
    });
    ro.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scrollMessagesToBottom]);

  useEffect(() => {
    const onWinResize = () => {
      if (typeof window !== 'undefined' && Date.now() < suppressChatScrollUntilRef.current) return;
      requestAnimationFrame(scrollMessagesToBottom);
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [scrollMessagesToBottom]);

  const onVisualViewportSync = useCallback(() => {
    if (typeof window !== 'undefined' && Date.now() < suppressChatScrollUntilRef.current) return;
    requestAnimationFrame(scrollMessagesToBottom);
  }, [scrollMessagesToBottom]);

  const vvRect = useVisualViewportRect(onVisualViewportSync);

  const messageMenuPosition = useMemo(() => {
    if (!messageMenu) return null;
    return clampMenuPosition(messageMenu.x, messageMenu.y, 232, 280);
  }, [messageMenu, vvRect]);

  const pinnedChips = useMemo(() => {
    return messages
      .filter((m) => m.pinnedForMe && m.kind !== 'revoked' && !m.revokedForAll)
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [messages]);

  const scrollToPinnedMessage = useCallback((mid) => {
    suppressChatScrollUntilRef.current = Date.now() + 700;
    stickToBottomRef.current = false;
    requestAnimationFrame(() => {
      const el = typeof document !== 'undefined' ? document.getElementById(`chat-msg-${mid}`) : null;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }, []);

  const [showScrollDownFab, setShowScrollDownFab] = useState(false);
  const syncScrollDownFab = useCallback(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) {
      setShowScrollDownFab(false);
      return;
    }
    if (loading) return;
    if (loadEndedAtRef.current && Date.now() - loadEndedAtRef.current < 420) {
      stickToBottomRef.current = true;
      setShowScrollDownFab(false);
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
    el.addEventListener('scroll', syncScrollDownFab, { passive: true });
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(syncScrollDownFab);
    });
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', syncScrollDownFab);
      ro.disconnect();
    };
  }, [syncScrollDownFab, messages.length]);

  useLayoutEffect(() => {
    syncScrollDownFab();
  }, [messages, loading, syncScrollDownFab]);

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
      if (canMessage === false) return;
      setMediaUploading(true);
      setErr(null);
      try {
        const isImg = (file.type || '').startsWith('image/');
        const { ok, data } = await apiUpload(`/api/chats/${encodeURIComponent(chatId)}/messages/media`, {
          file,
          userId,
          fieldName: 'file',
          extraFields: isImg ? { caption: text.trim() } : {},
        });
        if (!ok) {
          setErr(data?.error || 'Не отправлено');
          return;
        }
        if (isImg && text.trim()) {
          setText('');
        }
        appendMessage(data.message);
        await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
        onAfterChange?.();
      } finally {
        setMediaUploading(false);
      }
    },
    [chatId, userId, text, appendMessage, onAfterChange, canMessage],
  );

  const stopVoiceGlobal = useRef(null);

  const stopVoiceAndSend = useCallback(async () => {
    const fn = stopVoiceGlobal.current;
    if (fn) await fn();
  }, []);

  const startVoice = useCallback(async () => {
    if (canMessage === false) return;
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
        const { ok, data } = await apiUpload(`/api/chats/${encodeURIComponent(chatId)}/messages/voice`, {
          file,
          userId,
          fieldName: 'file',
          extraFields: { durationMs: String(elapsed) },
        });
        if (!ok) {
          setErr(data?.error || 'Не отправлено');
          return;
        }
        appendMessage(data.message);
        await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
        onAfterChange?.();
      }

      stopVoiceGlobal.current = doStopVoice;
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    } catch (e) {
      setErr(e?.message || 'Нет доступа к микрофону');
    }
  }, [chatId, userId, appendMessage, onAfterChange, stopVoiceAndSend, canMessage]);

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
    if (canMessage === false) return;
    const t = text.trim();
    if (!t) return;
    if (editingMessageId) {
      const { ok, data } = await api(
        `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(editingMessageId)}`,
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
        void api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId }).then(() => {
          onAfterChange?.();
        });
      }, 450);
      return;
    }
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: { body: t, replyToId: replyDraft?.id },
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
      void api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId }).then(() => {
        onAfterChange?.();
      });
    }, 450);
  }

  function formatTime(ts) {
    if (ts == null) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Удержание в режиме «кружок»: открыть камеру и сразу писать кружок */
  async function startVideoHoldFromComposer() {
    if (canMessage === false) return;
    setErr(null);
    setVideoModal(true);
    await new Promise((r) => setTimeout(r, 40));
    let stream;
    try {
      stream = await getOrCreateCameraStream();
    } catch (e) {
      setErr(e?.message || 'Нет доступа к камере');
      setVideoModal(false);
      longPressArmedRef.current = false;
      return;
    }
    videoStreamRef.current = stream;
    for (let i = 0; i < 20; i++) {
      const el = videoElRef.current;
      if (el) {
        el.srcObject = stream;
        el.muted = true;
        el.playsInline = true;
        await el.play().catch(() => {});
        break;
      }
      await new Promise((r) => setTimeout(r, 35));
    }
    if (!videoElRef.current) {
      setErr('Камера не готова');
      releaseCameraStreamNow();
      videoStreamRef.current = null;
      setVideoModal(false);
      longPressArmedRef.current = false;
      return;
    }
    await startVideoRecord();
  }

  function closeVideoModal() {
    videoPointerCleanupRef.current?.();
    videoPointerCleanupRef.current = null;
    if (videoTimerRef.current) {
      clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    const ctx = videoRecRef.current;
    if (ctx?.mr) {
      try {
        ctx.mr.stop();
      } catch {
        /* */
      }
    }
    videoRecRef.current = null;
    videoStreamRef.current = null;
    if (videoElRef.current) videoElRef.current.srcObject = null;
    scheduleReleaseCameraStream();
    setVideoRecording(false);
    setVideoModal(false);
  }

  async function startVideoRecord() {
    const stream = videoStreamRef.current;
    if (!stream || videoRecRef.current) return;
    const mime = pickVideoMime();
    const videoRecOpts = {
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    };
    if (mime) videoRecOpts.mimeType = mime;
    let mr;
    try {
      mr = new MediaRecorder(stream, videoRecOpts);
    } catch {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    }
    const chunks = [];
    mr.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    const started = Date.now();
    mr.start(200);
    videoRecRef.current = { mr, chunks, started };
    setVideoRecording(true);
    videoTimerRef.current = setTimeout(() => void stopVideoRecord(), MAX_MS);
    const onWinUp = () => void stopVideoRecord();
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
    videoPointerCleanupRef.current = () => {
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
    };
  }

  async function stopVideoRecord() {
    videoPointerCleanupRef.current?.();
    videoPointerCleanupRef.current = null;
    if (videoTimerRef.current) {
      clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    const ctx = videoRecRef.current;
    videoRecRef.current = null;
    setVideoRecording(false);
    if (!ctx) return;
    const { mr, chunks, started } = ctx;
    try {
      if (typeof mr.requestData === 'function') mr.requestData();
    } catch {
      /* */
    }
    await new Promise((r) => {
      mr.onstop = r;
      try {
        mr.stop();
      } catch {
        r();
      }
    });
    const elapsed = Math.min(MAX_MS, Date.now() - started);
    if (elapsed < MIN_MS_VIDEO) {
      setErr('Слишком коротко');
      closeVideoModal();
      return;
    }
    const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
    if (!blob.size) {
      setErr('Пустая запись — попробуйте ещё раз');
      closeVideoModal();
      return;
    }
    const file = buildVideoNoteFile(blob, mr);
    if (canMessage === false) {
      closeVideoModal();
      return;
    }
    const { ok, data } = await apiUpload(`/api/chats/${encodeURIComponent(chatId)}/messages/video-note`, {
      file,
      userId,
      fieldName: 'file',
      extraFields: { durationMs: String(elapsed) },
    });
    if (!ok) {
      setErr(data?.error || 'Не отправлено');
      closeVideoModal();
      return;
    }
    appendMessage(data.message);
    await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
    onAfterChange?.();
    closeVideoModal();
  }

  useEffect(() => {
    if (!videoModal) return undefined;
    const t = setTimeout(() => {
      const el = videoElRef.current;
      const s = videoStreamRef.current;
      if (el && s) {
        el.srcObject = s;
        el.play().catch(() => {});
      }
    }, 50);
    return () => clearTimeout(t);
  }, [videoModal]);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onMediaButtonPointerDown(e) {
    if (canMessage === false) return;
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
    if (videoRecRef.current) {
      void stopVideoRecord();
      longPressArmedRef.current = false;
      return;
    }
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
    if (isSavedMessages || !peerNickname) return [];
    return [{ nickname: peerNickname, label: 'Собеседник' }];
  }, [peerNickname, isSavedMessages]);

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

  const peerPresenceLine =
    !isSavedMessages && peerUserId != null
      ? peerPresenceSubtitle(
          typeof peerOnline === 'boolean' ? peerOnline : undefined,
          peerLastSeenAt,
          peerLastSeenHidden,
        )
      : null;

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
        zIndex={60}
        top={
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
        <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Назад">
          ‹
        </button>
        <button
          type="button"
          onClick={() => peerUserId && onOpenPeerProfile?.()}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            color: 'inherit',
            padding: '4px 0',
            cursor: peerUserId && onOpenPeerProfile ? 'pointer' : 'default',
          }}
          disabled={!peerUserId || !onOpenPeerProfile}
        >
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isSavedMessages ? (
              'Избранное'
            ) : peerNickname ? (
              <NicknameWithBadge nickname={peerNickname} affiliationEmoji={peerAffiliationEmoji} />
            ) : (
              peerLabel || 'Чат'
            )}
          </div>
          {peerPresenceLine != null ? (
            <div className="muted" style={{ fontSize: 10, marginTop: 3, lineHeight: 1.35 }}>
              {peerPresenceLine}
            </div>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => peerUserId && onOpenPeerProfile?.()}
          aria-label="Профиль собеседника"
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: peerUserId && onOpenPeerProfile ? 'pointer' : 'default',
            borderRadius: '50%',
            flexShrink: 0,
          }}
          disabled={!peerUserId || !onOpenPeerProfile}
        >
          <UserAvatar src={peerAvatarUrl} size={40} presenceOnline={typeof peerOnline === 'boolean' ? peerOnline : undefined} />
        </button>
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
                {isSavedMessages
                  ? 'Заметки и сохранённые мысли — только для вас.'
                  : 'Нет сообщений. Тап по кружку/микрофону справа переключает режим, удержание — запись (до 15 с).'}
              </p>
            ) : (
              <>
                {pinnedChips.length > 0 ? (
                  <div style={{ width: '100%', flexShrink: 0, marginBottom: 8 }}>
                    <div className="muted" style={{ fontSize: 10, marginBottom: 6 }}>
                      Закреплено
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {pinnedChips.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="btn-outline"
                          style={{ fontSize: 11, maxWidth: '100%', textAlign: 'left', lineHeight: 1.3 }}
                          onClick={() => scrollToPinnedMessage(m.id)}
                        >
                          {m.pinnedShared ? '📌 ' : ''}
                          {pinChipPreview(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    m={m}
                    userId={userId}
                    chatId={chatId}
                    formatTime={formatTime}
                    savedChat={isSavedMessages}
                    allowSwipeReply={canMessage}
                    onSwipeReply={(draft) => {
                      setReplyDraft(draft);
                      queueMicrotask(() => refocusComposer());
                    }}
                    onReactionsLocalUpdate={(id, reactions) =>
                      setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, reactions } : x)))
                    }
                    onOpenActionMenu={(msg, x, y) => setMessageMenu({ m: msg, x, y, showReactions: false })}
                    onMentionProfile={onMentionProfile}
                  />
                ))}
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
          <>
            {canMessage === false ? (
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  lineHeight: 1.35,
                  background: 'rgba(196, 92, 92, 0.1)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {friendsActive === false
                  ? 'Вы не в друзьях. История сохранена; писать снова можно после повторного добавления в друзья.'
                  : 'Собеседник ограничил вам сообщения (или включена блокировка).'}
              </div>
            ) : null}
            {err && messages.length > 0 ? (
              <div style={{ padding: '0 12px', fontSize: 11, color: '#c45c5c' }}>{err}</div>
            ) : null}
          </>
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
                if (f && canMessage !== false) void sendChatAttachment(f);
              }}
            />
            <button
              type="button"
              className="icon-btn"
              disabled={canMessage === false || mediaUploading || voiceRecording || videoRecording || videoModal}
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
              {mediaUploading ? '…' : '📎'}
            </button>
            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
                placeholder={canMessage === false ? 'Отправка недоступна' : 'Сообщение…'}
                value={text}
                readOnly={canMessage === false}
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
                  const run = () => scrollMessagesToBottomImmediate();
                  run();
                  requestAnimationFrame(run);
                  window.setTimeout(run, 160);
                  window.setTimeout(run, 420);
                }}
                maxLength={4000}
              />
            </div>
        {hasTypedText ? (
          <button
            type="button"
            aria-label="Отправить"
            disabled={canMessage === false}
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
            disabled={canMessage === false}
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
              border: `2px solid ${
                voiceRecording || videoRecording
                  ? 'var(--accent)'
                  : mediaMode === 'video'
                    ? 'var(--border)'
                    : 'var(--border)'
              }`,
              background:
                voiceRecording || videoRecording ? 'rgba(193, 123, 75, 0.15)' : 'transparent',
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
            <span style={{ lineHeight: 1 }}>{mediaMode === 'video' ? '◉' : '🎤'}</span>
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

      {videoModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            paddingTop: 'max(16px, env(safe-area-inset-top))',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 8,
            }}
          >
            <button
              type="button"
              onClick={closeVideoModal}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                background: 'var(--bg)',
                cursor: 'pointer',
                fontSize: 13,
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              Отмена
            </button>
          </div>
          <p
            className="modal-panel"
            style={{
              color: 'var(--text)',
              fontSize: 13,
              marginBottom: 12,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            {videoRecording ? (
              <>
                {formatDur(videoRecordElapsedMs)} / {formatDur(MAX_MS)}
                <br />
                <span className="muted" style={{ fontSize: 11 }}>
                  Отпустите палец — отправится сразу
                </span>
              </>
            ) : (
              'Камера…'
            )}
          </p>
          <div
            style={{
              position: 'relative',
              width: 240,
              height: 240,
              marginBottom: 12,
              touchAction: 'none',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#000',
              }}
            >
              <video ref={videoElRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <svg
              viewBox="0 0 240 240"
              width={252}
              height={252}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                marginLeft: -126,
                marginTop: -126,
                pointerEvents: 'none',
                transform: 'rotate(-90deg)',
              }}
              aria-hidden
            >
              <circle cx="120" cy="120" r={VIDEO_RING_R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="5" />
              <circle
                ref={videoRingAccentRef}
                cx="120"
                cy="120"
                r={VIDEO_RING_R}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={VIDEO_RING_LEN}
                strokeDashoffset={VIDEO_RING_LEN}
              />
            </svg>
          </div>
        </div>
      ) : null}

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
            style={{
              position: 'fixed',
              zIndex: 95,
              width: 232,
              ...(messageMenuPosition || { left: 8, top: 8 }),
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              padding: 10,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <div style={{ marginBottom: 10 }}>
              {!messageMenu.showReactions ? (
                <button
                  type="button"
                  className="btn-outline"
                  style={{ width: '100%', fontSize: 12 }}
                  onClick={() => setMessageMenu((prev) => (prev ? { ...prev, showReactions: true } : null))}
                >
                  Реакция…
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {REACTION_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={async () => {
                        const msg = messageMenu.m;
                        const { ok, data } = await api(
                          `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msg.id)}/reaction`,
                          { method: 'POST', body: { reaction: k }, userId },
                        );
                        if (ok && data?.reactions) {
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
              )}
            </div>
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
            {messageMenu.m.kind !== 'revoked' && !messageMenu.m.revokedForAll ? (
              <>
                {!messageMenu.m.pinnedForMe ? (
                  <>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
                      onClick={async () => {
                        const msg = messageMenu.m;
                        setMessageMenu(null);
                        const { ok, data } = await api(
                          `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msg.id)}/pin`,
                          { method: 'POST', body: { scope: 'self' }, userId },
                        );
                        if (!ok) {
                          setErr(data?.error || 'Не удалось закрепить');
                          return;
                        }
                        await load();
                        onAfterChange?.();
                      }}
                    >
                      Закрепить для себя
                    </button>
                    {!isSavedMessages ? (
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
                        onClick={async () => {
                          const msg = messageMenu.m;
                          setMessageMenu(null);
                          const { ok, data } = await api(
                            `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msg.id)}/pin`,
                            { method: 'POST', body: { scope: 'both' }, userId },
                          );
                          if (!ok) {
                            setErr(data?.error || 'Не удалось закрепить');
                            return;
                          }
                          await load();
                          onAfterChange?.();
                        }}
                      >
                        Закрепить для обоих
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ width: '100%', marginBottom: 8, fontSize: 12 }}
                    onClick={async () => {
                      const msg = messageMenu.m;
                      setMessageMenu(null);
                      const scope = msg.pinnedShared ? 'both' : 'self';
                      const { ok, data } = await api(
                        `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msg.id)}/unpin`,
                        { method: 'POST', body: { scope }, userId },
                      );
                      if (!ok) {
                        setErr(data?.error || 'Не удалось открепить');
                        return;
                      }
                      await load();
                      onAfterChange?.();
                    }}
                  >
                    {messageMenu.m.pinnedShared ? 'Открепить для обоих' : 'Открепить у себя'}
                  </button>
                )}
              </>
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
                  `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msg.id)}/delete-for-me`,
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
                    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msg.id)}/delete-for-everyone`,
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
          source={{ type: 'chat', id: chatId }}
          messageId={forwardMessageId}
          onAfterForward={() => onAfterChange?.()}
        />
      ) : null}
    </>
  );
}
