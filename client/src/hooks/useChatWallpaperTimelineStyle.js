import { useEffect, useMemo, useState } from 'react';
import { getChatWallpaperTimelineStyle } from '../chatWallpaper.js';

/** Пересчитывает стиль таймлайна при смене фона из профиля (localStorage + событие). */
export function useChatWallpaperTimelineStyle(userId) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((x) => x + 1);
    window.addEventListener('chatWallpaperChanged', on);
    return () => window.removeEventListener('chatWallpaperChanged', on);
  }, []);
  return useMemo(() => getChatWallpaperTimelineStyle(userId), [userId, tick]);
}
