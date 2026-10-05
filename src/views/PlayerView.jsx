import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { SubmitRoundPlayer } from '../components/rounds/SubmitRound';
import { ReactRoundPlayer } from '../components/rounds/ReactRound';
import { VoteRoundPlayer } from '../components/rounds/VoteRound';
import ConnectionBanner from '../components/ConnectionBanner';
import { makeId } from '../utils/ids';
import { loadPlayerSession, savePlayerSession, clearPlayerSession } from '../utils/session';

function readUrlRoom() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('room') || '').trim().toUpperCase();
}

function describeError(err) {
  if (!err) return '';
  if (err.code === 'permission-denied') return 'The room refused the request.';
  if (err.code === 'unavailable') return 'No connection to the room.';
  return err.code || err.message || 'Unknown error.';
}

export default function PlayerView() {
  // A stored session only counts for the room in the URL (when there is one),
  // so scanning a new QR code never drops you into last week's room.
  const [initial] = useState(() => {
    const urlRoom = readUrlRoom();
    const stored = loadPlayerSession(urlRoom || null);
    return { urlRoom, stored };
  });

  const [roomCode, setRoomCode] = useState(initial.stored?.roomCode || initial.urlRoom);
  const [name, setName] = useState(initial.stored?.name || '');
  const [playerId, setPlayerId] = useState(() => initial.stored?.playerId || makeId());
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [rejoining, setRejoining] = useState(!!initial.stored);
  const [error, setError] = useState(null);

  const [roomStatus, setRoomStatus] = useState('lobby');
  const [currentRoundId, setCurrentRoundId] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [joinedCode, setJoinedCode] = useState('');
  const [offline, setOffline] = useState(false);
  const [listenError, setListenError] = useState(null);

  const joiningRef = useRef(false);

  async function joinRoom({ code, playerName, id, alreadyRegistered }) {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setError(null);

    try {
      const snap = await getDoc(doc(db, 'rooms', code));

      if (!snap.exists()) {
        clearPlayerSession();
        setError('Room not found. Check the code and try again.');
        return;
      }

      if (snap.data().status === 'closed') {
        clearPlayerSession();
        setError('This session has ended.');
        return;
      }

      // A reload reuses the player doc it already created, so the host's
      // player count doesn't grow every time a phone locks.
      if (!alreadyRegistered) {
        await setDoc(doc(db, 'rooms', code, 'players', id), {
          name: playerName,
          joinedAt: serverTimestamp(),
        });
      }

      savePlayerSession({ roomCode: code, playerId: id, name: playerName });
      // Keep the room in the URL so a reload comes straight back here.
      if (readUrlRoom() !== code) {
        window.history.replaceState(null, '', `?room=${code}`);
      }
      setJoinedCode(code);
      setJoined(true);
    } catch (err) {
      console.error('Join failed:', err);
      setError(`Couldn't join: ${describeError(err)} Check your Wi-Fi and tap Join again.`);
    } finally {
      joiningRef.current = false;
      setJoining(false);
      setRejoining(false);
    }
  }

  function handleJoinClick() {
    const code = roomCode.trim().toUpperCase();
    const playerName = name.trim();
    if (!code || !playerName) return;

    const stored = loadPlayerSession(code);
    const sameIdentity = stored && stored.playerId === playerId && stored.name === playerName;
    joinRoom({ code, playerName, id: playerId, alreadyRegistered: !!sameIdentity });
  }

  function joinAsSomeoneElse() {
    clearPlayerSession();
    setPlayerId(makeId());
    setName('');
    setJoined(false);
    setJoinedCode('');
    setCurrentRoundId(null);
    setCurrentRound(null);
    setRoomStatus('lobby');
  }

  // Automatic rejoin after a reload.
  useEffect(() => {
    const s = initial.stored;
    if (!s) return;
    joinRoom({ code: s.roomCode, playerName: s.name, id: s.playerId, alreadyRegistered: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!joined) return;

    const unsubRoom = onSnapshot(
      doc(db, 'rooms', joinedCode),
      { includeMetadataChanges: true },
      snap => {
        setListenError(null);
        setOffline(snap.metadata.fromCache);
        if (!snap.exists()) {
          if (!snap.metadata.fromCache) {
            clearPlayerSession();
            setRoomStatus('closed');
          }
          return;
        }
        const data = snap.data();
        setRoomStatus(data.status);
        setCurrentRoundId(data.currentRoundId);
      },
      err => {
        console.error('Room listener failed:', err);
        setListenError(err);
      }
    );

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
      },
      err => {
        console.error('Round listener failed:', err);
        setListenError(err);
      }
    );

    return () => unsub();
  }, [currentRoundId, joinedCode]);

  const banner = <ConnectionBanner offline={joined && offline} error={listenError} />;

  if (rejoining) {
    return (
      <div style={styles.centered}>
        <h2>Rejoining…</h2>
        <p style={styles.subtext}>Reconnecting you to room {initial.stored.roomCode}.</p>
      </div>
    );
  }

  if (!joined) {
    const canJoin = roomCode.trim() && name.trim() && !joining;
    return (
      <div style={styles.centered}>
        <h2>Join a Room</h2>
        <input
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleJoinClick()}
          placeholder="Room code"
          maxLength={4}
          style={styles.codeInput}
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoinClick()}
          placeholder="Your name"
          maxLength={50}
          style={styles.nameInput}
          autoFocus={roomCode.length === 4}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          onClick={handleJoinClick}
          disabled={!canJoin}
          style={{ ...styles.primaryButton, opacity: canJoin ? 1 : 0.5 }}
        >
          {joining ? 'Joining…' : 'Join'}
        </button>
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

  if (roomStatus === 'lobby' || !currentRound) {
    return (
      <div style={styles.centered}>
        {banner}
        <h2>You're in, {name.trim()}.</h2>
        <p style={styles.subtext}>Waiting for the host to start...</p>
        <p style={styles.hint}>Keep this tab open. If your phone locks, it will reconnect on its own.</p>
        <button onClick={joinAsSomeoneElse} style={styles.linkButton}>
          Not you? Join with a different name
        </button>
      </div>
    );
  }

  if (roomStatus === 'reviewing') {
    return (
      <div style={styles.centered}>
        {banner}
        <h2>Round complete.</h2>
        <p style={styles.subtext}>Stand by for the next round.</p>
      </div>
    );
  }

  const roundProps = {
    roomCode: joinedCode,
    round: currentRound,
    roundId: currentRound.id,
    playerId,
    playerName: name.trim(),
  };

  return (
    <div>
      {banner}
      {currentRound.type === 'submit' && <SubmitRoundPlayer {...roundProps} key={currentRound.id} />}
      {currentRound.type === 'react' && <ReactRoundPlayer {...roundProps} key={currentRound.id} />}
      {currentRound.type === 'vote' && <VoteRoundPlayer {...roundProps} key={currentRound.id} />}
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
    textAlign: 'center',
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
    maxWidth: '20rem',
  },
  subtext: {
    color: '#888',
  },
  hint: {
    color: '#666',
    fontSize: '0.85rem',
    maxWidth: '20rem',
  },
  linkButton: {
    marginTop: '2rem',
    background: 'none',
    border: 'none',
    color: '#888',
    textDecoration: 'underline',
    fontSize: '0.85rem',
    cursor: 'pointer',
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
