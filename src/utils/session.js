// Remembers who this browser is, so a reload or a locked phone
// rejoins as the same player (or the same host room) instead of a new one.

const PLAYER_KEY = 'roomvote:player';
const HOST_KEY = 'roomvote:host';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or storage disabled: identity lasts until reload.
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Returns { roomCode, playerId, name } or null.
// When roomCode is given, only a session for that room counts.
export function loadPlayerSession(roomCode) {
  const s = read(PLAYER_KEY);
  if (!s || !s.roomCode || !s.playerId || !s.name) return null;
  if (roomCode && s.roomCode !== roomCode) return null;
  return s;
}

export function savePlayerSession(session) {
  write(PLAYER_KEY, session);
}

export function clearPlayerSession() {
  remove(PLAYER_KEY);
}

// Returns { roomCode, sessionName, uid } or null.
export function loadHostSession(uid) {
  const s = read(HOST_KEY);
  if (!s || !s.roomCode || s.uid !== uid) return null;
  return s;
}

export function saveHostSession(session) {
  write(HOST_KEY, session);
}

export function clearHostSession() {
  remove(HOST_KEY);
}
