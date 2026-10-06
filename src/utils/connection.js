import { useEffect, useState } from 'react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';

// Phones suspend background tabs. When the tab comes back, the Firestore
// stream is sometimes left half-dead and stops delivering updates with no
// error, which looks like "the prompt never showed up". Cycling the network
// forces fresh streams and a fresh snapshot of every active listener.

const HIDDEN_THRESHOLD_MS = 5000;
let installed = false;

export async function cycleNetwork() {
  try {
    await disableNetwork(db);
    await enableNetwork(db);
  } catch (err) {
    console.error('Firestore reconnect failed:', err);
  }
}

export function installReconnectHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  let hiddenAt = null;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt > HIDDEN_THRESHOLD_MS) {
      cycleNetwork();
    }
    hiddenAt = null;
  });

  // iOS Safari can restore a page from its back-forward cache with every
  // connection closed. A reload is safe because identity is persisted.
  window.addEventListener('pageshow', e => {
    if (e.persisted) window.location.reload();
  });

  window.addEventListener('online', () => {
    cycleNetwork();
  });
}

// True only after `active` has stayed true for `delayMs`, so a brief
// blip during normal startup doesn't flash a warning.
export function useDelayedFlag(active, delayMs = 2500) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(t);
      setElapsed(false);
    };
  }, [active, delayMs]);

  return active && elapsed;
}
