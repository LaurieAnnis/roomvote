import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import {
  doc, updateDoc, onSnapshot,
  collection, serverTimestamp
} from 'firebase/firestore';
import Timer from '../Timer';
import Heatmap from '../Heatmap';
import { normalizeReactionSnapshot, writeReaction } from '../../utils/reactions';

// ─── Host ────────────────────────────────────────────────────────────────────

export function ReactRoundHost({ roomCode, round, roundId, players, sessionName }) {
  const [reactions, setReactions] = useState({});
  const [currentIndex, setCurrentIndex] = useState(round.currentItemIndex || 0);
  const [advancing, setAdvancing] = useState(false);

  const showNames = round.showNames ?? true;
  const showResultsLive = round.showResultsLive ?? true;

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'rooms', roomCode, 'rounds', roundId, 'reactions'),
      snap => setReactions(normalizeReactionSnapshot(snap)),
      err => console.error('Reactions listener failed:', err)
    );
    return () => unsub();
  }, [roomCode, roundId]);

  useEffect(() => {
    setCurrentIndex(round.currentItemIndex || 0);
  }, [round.currentItemIndex]);

  const currentOption = round.options[currentIndex];
  const isLast = currentIndex >= round.options.length - 1;

  const reactedCount = currentOption && reactions[currentOption.id]?.individual
    ? Object.keys(reactions[currentOption.id].individual).length
    : 0;

  async function nextItem() {
    if (advancing) return;
    const nextIndex = currentIndex + 1;
    setAdvancing(true);
    try {
      await updateDoc(doc(db, 'rooms', roomCode, 'rounds', roundId), {
        currentItemIndex: nextIndex,
        timerStartedAt: serverTimestamp(),
      });
      setCurrentIndex(nextIndex);
    } finally {
      setAdvancing(false);
    }
  }

  async function revealHeatmap() {
    await updateDoc(doc(db, 'rooms', roomCode, 'rounds', roundId), {
      status: 'complete',
    });
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'reviewing',
    });

    const { logRoundToSheet } = await import('../../utils/sheets');
    await logRoundToSheet(sessionName, roomCode, round, [], reactions, {}, players);
  }

  if (round.status === 'complete') {
    return (
      <div style={styles.container}>
        <h2 style={styles.prompt}>{round.prompt}</h2>
        <h3 style={styles.sectionLabel}>Reaction results</h3>
        <Heatmap options={round.options} reactions={reactions} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.prompt}>{round.prompt}</h2>

      {round.timerStartedAt && (
        <Timer
          timerStartedAt={round.timerStartedAt}
          timerSeconds={round.timerSeconds}
          style={{ marginBottom: '1.5rem' }}
        />
      )}

      <div style={styles.progressLabel}>
        {currentIndex + 1} of {round.options.length}
      </div>

      {currentOption && (
        <div style={styles.currentItem}>
          <p style={styles.currentText}>{currentOption.text}</p>
          {showNames && currentOption.authorId && (
            <p style={styles.authorLabel}>
              {players.find(p => p.id === currentOption.authorId)?.name || ''}
            </p>
          )}
        </div>
      )}

      {showResultsLive ? (
        <div style={styles.liveReactions}>
          {currentOption && reactions[currentOption.id] && (
            <>
              <span style={styles.countGreen}>
                ✓ {reactions[currentOption.id]?.counts?.['✓'] || 0}
              </span>
              <span style={styles.countYellow}>
                ! {reactions[currentOption.id]?.counts?.['!'] || 0}
              </span>
              <span style={styles.countRed}>
                ✗ {reactions[currentOption.id]?.counts?.['✗'] || 0}
              </span>
            </>
          )}
        </div>
      ) : null}

      <div style={styles.reactedCount}>
        {reactedCount} of {players.length} reacted
      </div>

      <div style={styles.buttonRow}>
        {!isLast ? (
          <button onClick={nextItem} disabled={advancing} style={styles.primaryButton}>
            Next →
          </button>
        ) : (
          <button onClick={revealHeatmap} style={styles.revealButton}>
            Reveal all reactions
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Player ──────────────────────────────────────────────────────────────────

export function ReactRoundPlayer({ roomCode, round, roundId, playerId }) {
  const [myReactions, setMyReactions] = useState({});
  const [serverReaction, setServerReaction] = useState({ optionId: null, symbol: null });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState({ optionId: null, message: null });
  const sendingRef = useRef(false);

  const currentIndex = round.currentItemIndex || 0;
  const roundStatus = round.status;
  const currentOption = round.options[currentIndex];
  const currentOptionId = currentOption?.id;
  const myReactionForCurrent = currentOptionId
    ? myReactions[currentOptionId]
      || (serverReaction.optionId === currentOptionId ? serverReaction.symbol : null)
    : null;
  const errorForCurrent = error.optionId === currentOptionId ? error.message : null;

  // Watch this item's reaction doc so a reloaded phone knows it already
  // reacted, instead of offering the buttons again.
  useEffect(() => {
    if (!currentOptionId) return;
    const unsub = onSnapshot(
      doc(db, 'rooms', roomCode, 'rounds', roundId, 'reactions', currentOptionId),
      snap => setServerReaction({
        optionId: currentOptionId,
        symbol: snap.data()?.individual?.[playerId] || null,
      }),
      err => console.error('Reaction listener failed:', err)
    );
    return () => unsub();
  }, [roomCode, roundId, currentOptionId, playerId]);

  async function react(symbol) {
    if (!currentOption || sendingRef.current) return;
    if (myReactionForCurrent) return;

    const optionId = currentOption.id;
    sendingRef.current = true;
    setSending(true);
    setError({ optionId: null, message: null });

    const reactionRef = doc(db, 'rooms', roomCode, 'rounds', roundId, 'reactions', optionId);
    try {
      await writeReaction(db, reactionRef, playerId, symbol);
      setMyReactions(prev => ({ ...prev, [optionId]: symbol }));
    } catch (err) {
      console.error('Reaction failed:', err);
      setError({ optionId, message: `That didn't go through (${err.code || 'error'}). Tap again.` });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (roundStatus === 'complete') {
    return (
      <div style={styles.centeredMessage}>
        <h2>Round complete.</h2>
        <p style={styles.subtext}>Check the host screen for results.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <p style={styles.progressLabel}>
        {currentIndex + 1} of {round.options.length}
      </p>

      {currentOption && (
        <div style={styles.currentItem}>
          <p style={styles.currentText}>{currentOption.text}</p>
        </div>
      )}

      {round.timerStartedAt && (
        <Timer
          timerStartedAt={round.timerStartedAt}
          timerSeconds={round.timerSeconds}
          style={{ marginBottom: '1.5rem' }}
        />
      )}

      {myReactionForCurrent ? (
        <div style={styles.reacted}>
          <p style={styles.reactedLabel}>You reacted:</p>
          <span style={styles.reactedSymbol}>{myReactionForCurrent}</span>
        </div>
      ) : (
        <div style={styles.reactionButtons}>
          <button
            onClick={() => react('✓')}
            disabled={sending}
            style={{ ...styles.reactionButton, borderColor: '#4caf50', color: '#4caf50' }}
          >
            ✓
          </button>
          <button
            onClick={() => react('!')}
            disabled={sending}
            style={{ ...styles.reactionButton, borderColor: '#ff9800', color: '#ff9800' }}
          >
            !
          </button>
          <button
            onClick={() => react('✗')}
            disabled={sending}
            style={{ ...styles.reactionButton, borderColor: '#f44336', color: '#f44336' }}
          >
            ✗
          </button>
        </div>
      )}
      {errorForCurrent && <p style={styles.error}>{errorForCurrent}</p>}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  error: {
    color: '#f44336',
    fontSize: '0.9rem',
    textAlign: 'center',
    marginTop: '1rem',
  },
  container: {
    fontFamily: 'sans-serif',
    maxWidth: '700px',
    margin: '0 auto',
    padding: '2rem',
  },
  centeredMessage: {
    textAlign: 'center',
    marginTop: '20vh',
    fontFamily: 'sans-serif',
  },
  prompt: {
    fontSize: '1.4rem',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: '1rem',
  },
  subtext: {
    color: '#888',
  },
  progressLabel: {
    textAlign: 'center',
    color: '#888',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  currentItem: {
    border: '2px solid #444',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  currentText: {
    fontSize: '1.3rem',
    margin: 0,
  },
  authorLabel: {
    fontSize: '0.8rem',
    color: '#888',
    marginTop: '0.5rem',
    marginBottom: 0,
  },
  liveReactions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '2rem',
    fontSize: '1.2rem',
    marginBottom: '2rem',
  },
  reactionButtons: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  reactionButton: {
    width: '80px',
    height: '80px',
    fontSize: '2rem',
    background: 'transparent',
    border: '3px solid',
    borderRadius: '50%',
    cursor: 'pointer',
  },
  reacted: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  reactedLabel: {
    color: '#888',
    marginBottom: '0.5rem',
  },
  reactedSymbol: {
    fontSize: '3rem',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  revealButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: '#9c27b0',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  reactedCount: {
    textAlign: 'center',
    color: '#888',
    fontSize: '0.9rem',
    marginBottom: '1.5rem',
  },
  countGreen: { color: '#4caf50', fontSize: '1.1rem' },
  countYellow: { color: '#ff9800', fontSize: '1.1rem' },
  countRed: { color: '#f44336', fontSize: '1.1rem' },
};
