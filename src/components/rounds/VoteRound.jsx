import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, serverTimestamp
} from 'firebase/firestore';
import Timer from '../Timer';
import Heatmap from '../Heatmap';

// ─── Host ───────────────────────────────────────────────────────────────────

export function VoteRoundHost({ roomCode, round, roundId, players, sessionName }) {
  const [votes, setVotes] = useState({});

  const showNames = round.showNames ?? true;
  const showResultsLive = round.showResultsLive ?? true;

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'rooms', roomCode, 'rounds', roundId, 'votes'),
      snap => {
        const v = {};
        snap.docs.forEach(d => { v[d.id] = d.data().optionId; });
        setVotes(v);
      },
      err => console.error('Votes listener failed:', err)
    );
    return () => unsub();
  }, [roomCode, roundId]);

  const votedCount = Object.keys(votes).length;
  const totalCount = players.length;

  const voteCounts = round.options.reduce((acc, o) => {
    acc[o.id] = Object.values(votes).filter(v => v === o.id).length;
    return acc;
  }, {});

  async function revealVotes() {
    await updateDoc(doc(db, 'rooms', roomCode, 'rounds', roundId), {
      status: 'complete',
    });
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'reviewing',
    });

    const { logRoundToSheet } = await import('../../utils/sheets');
    await logRoundToSheet(sessionName, roomCode, round, [], {}, votes, players);
  }

  if (round.status === 'complete') {
    const sorted = [...round.options].sort(
      (a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
    );
    return (
      <div style={styles.container}>
        <h2 style={styles.prompt}>{round.prompt}</h2>
        <h3 style={styles.sectionLabel}>Results</h3>
        {sorted.map((o, i) => (
          <div key={o.id} style={styles.resultRow}>
            <span style={styles.rank}>#{i + 1}</span>
            <span style={styles.optionText}>{o.text}</span>
            <span style={styles.voteCount}>{voteCounts[o.id] || 0} votes</span>
          </div>
        ))}
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

      <p style={styles.tally}>
        {votedCount} / {totalCount} voted
      </p>

      {showResultsLive && (
        <div style={styles.optionList}>
          {round.options.map(o => (
            <div key={o.id} style={styles.optionRow}>
              <span style={styles.optionText}>{o.text}</span>
              <span style={styles.voteCount}>{voteCounts[o.id] || 0}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={revealVotes}
        style={styles.primaryButton}
      >
        Reveal ({votedCount}/{totalCount} voted)
      </button>
    </div>
  );
}

// ─── Player ──────────────────────────────────────────────────────────────────

export function VoteRoundPlayer({ roomCode, round, roundId, playerId, playerName }) {
  const [myVote, setMyVote] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const sendingRef = useRef(false);
  const roundStatus = round.status;

  // After a reload, check whether this player already voted.
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'rooms', roomCode, 'rounds', roundId, 'votes', playerId))
      .then(snap => { if (!cancelled && snap.exists()) setMyVote(snap.data().optionId); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [roomCode, roundId, playerId]);

  async function castVote(optionId) {
    if (myVote || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'rooms', roomCode, 'rounds', roundId, 'votes', playerId),
        { optionId, votedAt: serverTimestamp(), playerName }
      );
      setMyVote(optionId);
    } catch (err) {
      console.error('Vote failed:', err);
      setError(`That didn't go through (${err.code || 'error'}). Tap your choice again.`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (roundStatus === 'complete') {
    return (
      <div style={styles.centeredMessage}>
        <h2>Results are in.</h2>
        <p style={styles.subtext}>Check the host screen.</p>
      </div>
    );
  }

  if (myVote) {
    return (
      <div style={styles.centeredMessage}>
        <h2>Vote cast.</h2>
        <p style={styles.subtext}>Waiting for others...</p>
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

      <div style={styles.optionList}>
        {round.options.map(o => (
          <button
            key={o.id}
            onClick={() => castVote(o.id)}
            disabled={sending}
            style={{ ...styles.voteButton, opacity: sending ? 0.5 : 1 }}
          >
            {o.text}
          </button>
        ))}
      </div>
      {error && <p style={styles.error}>{error}</p>}
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
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: '1rem',
  },
  tally: {
    textAlign: 'center',
    color: '#888',
    marginBottom: '1rem',
  },
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  optionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    border: '1px solid #444',
    borderRadius: '8px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    border: '1px solid #444',
    borderRadius: '8px',
    marginBottom: '0.5rem',
  },
  rank: {
    color: '#888',
    minWidth: '2rem',
  },
  optionText: {
    flex: 1,
  },
  voteCount: {
    fontWeight: 'bold',
    minWidth: '4rem',
    textAlign: 'right',
  },
  voteButton: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    background: '#1e1e1e',
    color: '#fff',
    border: '2px solid #444',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
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
};
