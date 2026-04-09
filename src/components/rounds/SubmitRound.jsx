import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  doc, setDoc, updateDoc, onSnapshot,
  collection, serverTimestamp
} from 'firebase/firestore';
import Timer from '../Timer';

// ─── Host ────────────────────────────────────────────────────────────────────

export function SubmitRoundHost({ roomCode, round, roundId, players, sessionName }) {
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'rooms', roomCode, 'rounds', roundId, 'submissions'),
      snap => {
        setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );
    return () => unsub();
  }, [roomCode, roundId]);

  async function closeSubmissions() {
    await updateDoc(doc(db, 'rooms', roomCode, 'rounds', roundId), {
      status: 'complete',
    });
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'reviewing',
    });

    const { logRoundToSheet } = await import('../../utils/sheets');
    await logRoundToSheet(sessionName, roomCode, round, submissions, {}, {}, players);
  }

  const submittedIds = new Set(submissions.map(s => s.id));
  const waitingOn = players.filter(p => !submittedIds.has(p.id));

  if (round.status === 'complete') {
    return (
      <div style={styles.container}>
        <h2 style={styles.prompt}>{round.prompt}</h2>
        <h3 style={styles.sectionLabel}>All submissions ({submissions.length})</h3>
        {submissions.map(s => (
          <div key={s.id} style={styles.submissionRow}>
            <span style={styles.playerName}>{s.playerName}</span>
            <span style={styles.submissionText}>{s.text}</span>
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

      <div style={styles.columns}>
        <div style={styles.column}>
          <h3 style={styles.sectionLabel}>
            Submitted ({submissions.length})
          </h3>
          {submissions.map(s => (
            <div key={s.id} style={styles.submissionRow}>
              <span style={styles.playerName}>{s.playerName}</span>
              <span style={styles.submissionText}>{s.text}</span>
            </div>
          ))}
        </div>

        <div style={styles.column}>
          <h3 style={styles.sectionLabel}>
            Waiting on ({waitingOn.length})
          </h3>
          {waitingOn.map(p => (
            <div key={p.id} style={styles.waitingRow}>
              {p.name}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={closeSubmissions}
        style={styles.primaryButton}
      >
        Close submissions ({submissions.length}/{players.length})
      </button>
    </div>
  );
}

// ─── Player ──────────────────────────────────────────────────────────────────

export function SubmitRoundPlayer({ roomCode, round, roundId, playerId, playerName }) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [roundStatus, setRoundStatus] = useState(round.status);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'rooms', roomCode, 'rounds', roundId),
      snap => {
        const data = snap.data();
        if (data) setRoundStatus(data.status);
      }
    );
    return () => unsub();
  }, [roomCode, roundId]);

  async function submit() {
    if (!text.trim() || submitted) return;
    await setDoc(
      doc(db, 'rooms', roomCode, 'rounds', roundId, 'submissions', playerId),
      {
        text: text.trim(),
        submittedAt: serverTimestamp(),
        playerId,
        playerName,
      }
    );
    setSubmitted(true);
  }

  if (roundStatus === 'complete') {
    return (
      <div style={styles.centeredMessage}>
        <h2>Submissions closed.</h2>
        <p style={styles.subtext}>Stand by for the next round.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={styles.centeredMessage}>
        <h2>Submitted.</h2>
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

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type your response..."
        rows={4}
        style={styles.textarea}
      />

      <button
        onClick={submit}
        disabled={!text.trim()}
        style={{
          ...styles.primaryButton,
          opacity: text.trim() ? 1 : 0.5,
          cursor: text.trim() ? 'pointer' : 'default',
        }}
      >
        Submit
      </button>
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
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: '0.75rem',
  },
  subtext: {
    color: '#888',
  },
  columns: {
    display: 'flex',
    gap: '2rem',
    marginBottom: '2rem',
  },
  column: {
    flex: 1,
  },
  submissionRow: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.6rem 0.75rem',
    border: '1px solid #444',
    borderRadius: '6px',
    marginBottom: '0.5rem',
    gap: '0.25rem',
  },
  playerName: {
    fontSize: '0.75rem',
    color: '#888',
  },
  submissionText: {
    fontSize: '1rem',
  },
  waitingRow: {
    padding: '0.6rem 0.75rem',
    border: '1px solid #333',
    borderRadius: '6px',
    marginBottom: '0.5rem',
    color: '#888',
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    background: '#1e1e1e',
    color: '#fff',
    border: '2px solid #444',
    borderRadius: '8px',
    resize: 'vertical',
    marginBottom: '1rem',
    boxSizing: 'border-box',
  },
  primaryButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
  },
};
