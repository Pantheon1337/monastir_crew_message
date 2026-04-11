/**
 * Переиспользование потока камеры между записями кружка в одной сессии страницы.
 * На iOS / PWA повторный getUserMedia часто снова показывает системный запрос —
 * держим поток живым короткое время после закрытия модалки и отдаём тот же stream.
 */

let cachedStream = null;
let releaseTimer = null;
const RELEASE_MS = 12000;

const DEFAULT_CONSTRAINTS = {
  video: {
    facingMode: 'user',
    width: { ideal: 720, max: 1280 },
    height: { ideal: 1280, max: 1920 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: 1,
  },
};

/** Квадратный кадр 1:1 для видеокружка — без «лишнего» кропа в круге и с предсказуемым масштабом. */
const VIDEO_NOTE_BASE = {
  width: { ideal: 540, min: 360 },
  height: { ideal: 540, min: 360 },
  aspectRatio: { ideal: 1 },
  frameRate: { ideal: 30, max: 30 },
};

function streamAlive(stream) {
  if (!stream) return false;
  const v = stream.getVideoTracks()[0];
  return Boolean(v && v.readyState === 'live');
}

function clearReleaseTimer() {
  if (releaseTimer != null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

/**
 * Один живой поток на сессию или новый getUserMedia (один системный запрос до «отпускания»).
 */
export async function getOrCreateCameraStream(constraints = DEFAULT_CONSTRAINTS) {
  clearReleaseTimer();
  if (streamAlive(cachedStream)) {
    return cachedStream;
  }
  if (cachedStream) {
    try {
      cachedStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* */
    }
    cachedStream = null;
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  cachedStream = stream;
  return stream;
}

/**
 * Поток для видеокружка: квадрат 1:1, без зеркалирования в CSS (запись = то, что с камеры).
 * При смене камеры сбрасываем кэш и запрашиваем заново.
 */
export async function getOrCreateVideoNoteStream(facingMode = 'user') {
  clearReleaseTimer();
  if (cachedStream) {
    try {
      cachedStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* */
    }
    cachedStream = null;
  }
  const constraints = {
    video: {
      ...VIDEO_NOTE_BASE,
      facingMode,
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  cachedStream = stream;
  return stream;
}

/**
 * Смена фронт/тыл во время записи: новый видеотрек, те же аудиотреки (без перезапуска MediaRecorder с canvas).
 */
export async function replaceVideoNoteFacingMode(prevStream, facingMode) {
  if (!prevStream) throw new Error('no stream');
  clearReleaseTimer();
  const audioTracks = prevStream.getAudioTracks();
  const newVidOnly = await navigator.mediaDevices.getUserMedia({
    video: {
      ...VIDEO_NOTE_BASE,
      facingMode,
    },
    audio: false,
  });
  const vTrack = newVidOnly.getVideoTracks()[0];
  prevStream.getVideoTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* */
    }
  });
  const combined = new MediaStream([vTrack, ...audioTracks]);
  cachedStream = combined;
  return combined;
}

/** После закрытия модалки записи — отложенная остановка треков (следующая запись успеет переиспользовать). */
export function scheduleReleaseCameraStream() {
  clearReleaseTimer();
  releaseTimer = window.setTimeout(() => {
    releaseTimer = null;
    if (cachedStream) {
      try {
        cachedStream.getTracks().forEach((t) => t.stop());
      } catch {
        /* */
      }
      cachedStream = null;
    }
  }, RELEASE_MS);
}

/** Сразу отпустить (уход со страницы чата, выход из приложения). */
export function releaseCameraStreamNow() {
  clearReleaseTimer();
  if (cachedStream) {
    try {
      cachedStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* */
    }
    cachedStream = null;
  }
}
