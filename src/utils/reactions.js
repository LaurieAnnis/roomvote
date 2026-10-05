import { setDoc, increment } from 'firebase/firestore';

// The `counts` field on a reaction doc can drift from reality (older builds
// lost reactions to a create race, and a double tap could increment twice).
// `individual` holds exactly one symbol per player, so counts are rebuilt
// from it everywhere results are shown or logged.

export const SYMBOLS = ['✓', '!', '✗'];

export function normalizeReaction(data) {
  const individual = data?.individual || {};
  const counts = { '✓': 0, '!': 0, '✗': 0 };
  Object.values(individual).forEach(symbol => {
    if (symbol in counts) counts[symbol] += 1;
  });
  return { ...data, individual, counts };
}

export function normalizeReactionSnapshot(snap) {
  const r = {};
  snap.docs.forEach(d => { r[d.id] = normalizeReaction(d.data()); });
  return r;
}

// Records one player's reaction without ever overwriting anyone else's.
// The old flow read the doc, and if it was missing, created it with setDoc.
// Thirty phones doing that at once all "created" it, and each write erased
// the reactions before it. A merge write needs no read: it creates the doc
// if needed and only touches this player's key and one counter.
// (A transaction was tried first; under classroom-level contention most
// phones' transactions were rejected.)
export async function writeReaction(db, reactionRef, playerId, symbol) {
  await setDoc(
    reactionRef,
    {
      counts: { [symbol]: increment(1) },
      individual: { [playerId]: symbol },
    },
    { merge: true }
  );
}
