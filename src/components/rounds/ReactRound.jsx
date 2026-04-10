import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  doc, setDoc, updateDoc, onSnapshot,
  collection, serverTimestamp
} from 'firebase/firestore';
import Timer from '../Timer';
import Heatmap from '../Heatmap';

// ─── Host ────────────────────────────────────────────────────────────────────

export function ReactRoundHost({ roomCode, round, roundId, players, sessionName }) {
  const [reactions, setReactions] = useState({});
  const [currentIndex, setCurrentIndex] = useState(round.currentItemIndex || 0);

  const showNames = round.showNames ?? true;
  const showResultsLive = round.showResultsLive ?? true;

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'rooms', roomCode, 'rounds', roundId, 'reactions'),
      snap => {
        const r = {};
        snap.docs.forEach(d => { r[d.id] = d.data(); });
        setReactions(r);
      }
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
    const nextIndex = currentIndex + 1;
    await updateDoc(doc(db, 'rooms', roomCode, 'rounds', roundId), {
      currentItemIndex: nextIndex,
      timerStartedAt: serverTimestamp(),
    });
    setCurrentIndex(nextIndex);
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
          <button onClick={nextItem} style={styles.primaryButton}>
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

export function ReactRoundPlayer({ roomCode, round, roundId, playerId, playerName }) {
  const [currentIndex, setCurrentIndex] = useState(round.currentItemIndex || 0);
  const [myReactions, setMyReactions] = useState({});
  const [roundStatus, setRoundStatus] = useState(round.status);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'rooms', roomCode, 'rounds', roundId),
      snap => {
        const data = snap.data();
        if (!data) return;
        setCurrentIndex(data.currentItemIndex || 0);
        setRoundStatus(data.status);
      }
    );
    return () => unsub();
  }, [roomCode, roundId]);

  async function react(symbol) {
    const currentOption = round.options[currentIndex];
    if (!currentOption) return;
    if (myReactions[currentOption.id]) return;

    const reactionRef = doc(
      db, 'rooms', roomCode, 'rounds', roundId, 'reactions', currentOption.id
    );

    const { increment, setDoc: fsSetDoc, updateDoc: fsUpdateDoc, getDoc } = 
      await import('firebase/firestore');
    
    const existing = await getDoc(reactionRef);
    
    if (!existing.exists()) {
      await fsSetDoc(reactionRef, {
        counts: { '✓': 0, '!': 0, '✗': 0 },
        individual: { [playerId]: symbol },
      });
      await fsUpdateDoc(reactionRef, {
        [`counts.${symbol}`]: increment(1),
      });
    } else {
      await fsUpdateDoc(reactionRef, {
        [`counts.${symbol}`]: increment(1),
        [`individual.${playerId}`]: symbol,
      });
    }

    setMyReactions(prev => ({ ...prev, [currentOption.id]: symbol }));
  }

  const currentOption = round.options[currentIndex];
  const myReactionForCurrent = currentOption ? myReactions[currentOption.id] : null;

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
            style={{ ...styles.reactionButton, borderColor: '#4caf50', color: '#4caf50' }}
          >
            ✓
          </button>
          <button
            onClick={() => react('!')}
            style={{ ...styles.reactionButton, borderColor: '#ff9800', color: '#ff9800' }}
          >
            !
          </button>
          <button
            onClick={() => react('✗')}
            style={{ ...styles.reactionButton, borderColor: '#f44336', color: '#f44336' }}
          >
            ✗
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
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
    justifyContent: 'flex-end',
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
