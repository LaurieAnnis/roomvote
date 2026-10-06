import { useEffect } from 'react';
import { db } from '../firebase';
import { cycleNetwork } from './connection';

// A phone's connection can die silently (Wi-Fi roaming, a router dropping an
// idle connection). The listeners keep their last data and get no error, so
// the phone sits on an old screen until it reloads; the SDK's own timeout
// took about 45 seconds in testing.
//
// Every 20 seconds this asks Firestore's REST API for the room (and, during a
// React round, the round, since that's where the current item lives). That is a separate plain web request, so a dead listener
// connection can't answer it from stale state (the SDK's getDocFromServer
// can). If the listeners are behind the server and stay behind, the phone
// reconnects; if reconnecting doesn't help three checks in a row, it reloads,
// which is safe because a reload rejoins as the same player.
//
// Read budget: on the free Spark plan Firestore stops answering after 50,000
// reads a day. At 30 phones this costs about 5,400 reads an hour outside React
// rounds and about 10,800 an hour during them.

const PROBE_EVERY_MS = 20000;
const PROBE_TIMEOUT_MS = 6000;
const GRACE_MS = 2500;
const RELOAD_AFTER = 3;

function restBase() {
  // Tests point this at the local emulator; normal builds leave it unset.
  if (import.meta.env.VITE_FIRESTORE_REST_BASE) return import.meta.env.VITE_FIRESTORE_REST_BASE;
  const projectId = db.app.options.projectId;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function decode(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('doubleValue' in v) return v.doubleValue;
  return undefined;
}

async function fetchFields(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${restBase()}/${path}`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const out = {};
    Object.entries(json.fields || {}).forEach(([k, v]) => { out[k] = decode(v); });
    return out;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function roomKey(d) {
  return d ? `${d.currentRoundId || ''}|${d.status || ''}|${!!d.creditsRolling}` : '';
}

function roundKey(id, d) {
  return d ? `${id || ''}|${d.currentItemIndex || 0}|${d.status || ''}` : '';
}

// seenRef.current = { room, round } as the listeners last delivered them.
export function useSyncWatchdog({ enabled, roomCode, seenRef }) {
  useEffect(() => {
    if (!enabled || !roomCode) return;
    let cancelled = false;
    let running = false;
    let misses = 0;

    function seenKeys() {
      const s = seenRef.current;
      return `${roomKey(s.room)}#${roundKey(s.round?.id, s.round)}`;
    }

    async function serverKeys() {
      const room = await fetchFields(`rooms/${roomCode}`);
      if (!room) return null;
      const seenRound = seenRef.current.round;
      let roundPart = roundKey(seenRound?.id, seenRound);
      // A new round, a finished round and the credits all show up on the room
      // (currentRoundId and status). Only a React round's current item lives
      // on the round alone, so that is the only time the round is read.
      const roundId = room.currentRoundId || null;
      if (roundId && roundId === seenRound?.id && seenRound?.type === 'react') {
        const round = await fetchFields(`rooms/${roomCode}/rounds/${roundId}`);
        if (round) roundPart = roundKey(roundId, round);
      }
      return `${roomKey(room)}#${roundPart}`;
    }

    async function probe() {
      if (running || cancelled || document.visibilityState !== 'visible') return;
      if (seenRef.current.room?.status === 'closed') return;
      running = true;
      try {
        const before = seenKeys();
        const server = await serverKeys();
        // Offline: the reconnecting banner covers it.
        if (cancelled || server === null) return;
        if (seenKeys() === server) { misses = 0; return; }

        // Give a healthy listener time to deliver a change the host just made.
        await sleep(GRACE_MS);
        if (cancelled) return;
        const after = seenKeys();
        if (after === server || after !== before) { misses = 0; return; }

        misses += 1;
        if (misses >= RELOAD_AFTER) {
          console.warn('Sync: still behind after reconnecting; reloading.');
          window.location.reload();
          return;
        }
        console.warn('Sync: listeners fell behind the server; reconnecting.');
        await cycleNetwork();
      } catch (err) {
        // A check that hangs until the timeout means the connection is unhealthy
        // (often the same one the listeners use); one that fails at once means
        // the phone is offline, which the reconnecting banner already covers.
        if (!cancelled && err?.name === 'AbortError') {
          misses += 1;
          if (misses >= RELOAD_AFTER) {
            console.warn('Sync: server unreachable after reconnecting; reloading.');
            window.location.reload();
            return;
          }
          console.warn('Sync: check timed out; reconnecting.');
          await cycleNetwork();
        }
      } finally {
        running = false;
      }
    }

    const timer = setInterval(probe, PROBE_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, roomCode, seenRef]);
}
