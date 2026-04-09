import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  doc, setDoc, onSnapshot,
  collection, serverTimestamp
} from 'firebase/firestore';
import { SubmitRoundPlayer } from '../components/rounds/SubmitRound';
import { ReactRoundPlayer } from '../components/rounds/ReactRound';
import { VoteRoundPlayer } from '../components/rounds/VoteRound';

export default function PlayerView() {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [playerId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState(null);

  const [roomStatus, setRoomStatus] = useState('lobby');
  const [currentRoundId, setCurrentRoundId] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [joinedCode, setJoinedCode] = useState('');

  async function joinRoom() {
    const code = roomCode.trim().toUpperCase();
    if (!code || !name.trim()) return;

    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'rooms', code));

    if (!snap.exists()) {
      setError('Room not found. Check the code and try again.');
      return;
    }

    if (snap.data().status === 'closed') {
      setError('This session has ended.');
      return;
    }

    await setDoc(doc(db, 'rooms', code, 'players', playerId), {
      name: name.trim(),
      joinedAt: serverTimestamp(),
    });

    setJoinedCode(code);
    setJoined(true);
    setError(null);
  }

  useEffect(() => {
    if (!joined) return;

    const unsubRoom = onSnapshot(doc(db, 'rooms', joinedCode), snap => {
      const data = snap.data();
      if (!data) return;
      setRoomStatus(data.status);
      setCurrentRoundId(data.currentRoundId);
    });

    return () => unsubRoom();
  }, [joined, joinedCode]);

  useEffect(() => {
    if (!currentRoundId || !joinedCode) {
      setCurrentRound(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'rooms', joinedCode, 'rounds', currentRoundId),
      snap => {
        if (snap.exists()) {
          setCurrentRound({ id: snap.id, ...snap.data() });
        }
      }
    );

    return () => unsub();
  }, [currentRoundId, joinedCode]);

  if (!joined) {
    return (
      <div style={styles.centered}>
        <h2>Join a Room</h2>
        <input
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && joinRoom()}
          placeholder="Room code"
          maxLength={4}
          style={styles.codeInput}
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && joinRoom()}
          placeholder="Your name"
          style={styles.nameInput}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          onClick={joinRoom}
          disabled={!roomCode.trim() || !name.trim()}
          style={{
            ...styles.primaryButton,
            opacity: roomCode.trim() && name.trim() ? 1 : 0.5,
          }}
        >
          Join
        </button>
      </div>
    );
  }

  if (roomStatus === 'lobby' || !currentRound) {
    return (
      <div style={styles.centered}>
        <h2>You're in.</h2>
        <p style={styles.subtext}>Waiting for the host to start...</p>
      </div>
    );
  }

  if (roomStatus === 'reviewing') {
    return (
      <div style={styles.centered}>
        <h2>Round complete.</h2>
        <p style={styles.subtext}>Stand by for the next round.</p>
      </div>
    );
  }

  if (roomStatus === 'closed') {
    return (
      <div style={styles.centered}>
        <h2>Session ended.</h2>
        <p style={styles.subtext}>Thanks for participating.</p>
      </div>
    );
  }

  return (
    <div>
      {currentRound.type === 'submit' && (
        <SubmitRoundPlayer
          roomCode={joinedCode}
          round={currentRound}
          roundId={currentRound.id}
          playerId={playerId}
          playerName={name.trim()}
        />
      )}
      {currentRound.type === 'react' && (
        <ReactRoundPlayer
          roomCode={joinedCode}
          round={currentRound}
          roundId={currentRound.id}
          playerId={playerId}
          playerName={name.trim()}
        />
      )}
      {currentRound.type === 'vote' && (
        <VoteRoundPlayer
          roomCode={joinedCode}
          round={currentRound}
          roundId={currentRound.id}
          playerId={playerId}
          playerName={name.trim()}
        />
      )}
    </div>
  );
}

const styles = {
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: '20vh',
    fontFamily: 'sans-serif',
    padding: '1rem',
    gap: '0.75rem',
  },
  codeInput: {
    padding: '0.75rem',
    fontSize: '2rem',
    textAlign: 'center',
    width: '8rem',
    letterSpacing: '0.4rem',
    background: '#1e1e1e',
    color: '#fff',
    border: '2px solid #444',
    borderRadius: '8px',
  },
  nameInput: {
    padding: '0.75rem',
    fontSize: '1rem',
    width: '16rem',
    background: '#1e1e1e',
    color: '#fff',
    border: '2px solid #444',
    borderRadius: '8px',
    textAlign: 'center',
  },
  error: {
    color: '#f44336',
    fontSize: '0.9rem',
  },
  subtext: {
    color: '#888',
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
