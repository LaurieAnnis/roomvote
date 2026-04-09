import { useEffect, useState } from 'react';

export function useTimer(timerStartedAt, timerSeconds) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!timerStartedAt || !timerSeconds) {
      setSecondsLeft(null);
      return;
    }

    function tick() {
      const startMs = timerStartedAt.toMillis
        ? timerStartedAt.toMillis()
        : new Date(timerStartedAt).getTime();
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const remaining = Math.max(0, timerSeconds - elapsed);
      setSecondsLeft(remaining);
    }

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [timerStartedAt, timerSeconds]);

  return secondsLeft;
}

export function formatTime(seconds) {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}
