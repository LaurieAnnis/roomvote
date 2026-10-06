import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { SubmitRoundPlayer } from '../components/rounds/SubmitRound';
import { ReactRoundPlayer } from '../components/rounds/ReactRound';
import { VoteRoundPlayer } from '../components/rounds/VoteRound';
import ConnectionBanner from '../components/ConnectionBanner';
import PlayerCredits from '../components/PlayerCredits';
import { makeId } from '../utils/ids';
import { useSyncWatchdog } from '../utils/useSyncWatchdog';
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
  // Room shown on the "Rejoining…" screen (a reload, or following the host).
  const [rejoinCode, setRejoinCode] = useState(initial.stored?.roomCode || '');
  const [movedFrom, setMovedFrom] = useState(null);
  const [error, setError] = useState(null);

  const [roomStatus, setRoomStatus] = useState('lobby');
  const [currentRoundId, setCurrentRoundId] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [joinedCode, setJoinedCode] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [creditsRolling, setCreditsRolling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [listenError, setListenError] = useState(null);

  const joiningRef = useRef(false);
  // What the listeners last delivered, for the sync watchdog to compare.
  const seenRef = useRef({ room: null, round: null });

  async function joinRoom({ code, playerName, id, alreadyRegistered }) {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setError(null);

    try {
      // A room the host has ended may point at the room that replaced it.
      let snap = await getDoc(doc(db, 'rooms', code));
      for (let hop = 0; hop < 3 && snap.exists() && snap.data().status === 'closed' && snap.data().movedTo; hop++) {
        code = snap.data().movedTo;
        alreadyRegistered = false;
        snap = await getDoc(doc(db, 'rooms', code));
      }

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
      seenRef.current = { room: null, round: null };
      setCurrentRoundId(null);
      setCurrentRound(null);
      setCreditsRolling(false);
      setRoomStatus(snap.data().status || 'lobby');
      setRoomCode(code);
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

  // Back to the join screen, keeping the name, so a student can type another code.
  function leaveRoom() {
    clearPlayerSession();
    seenRef.current = { room: null, round: null };
    setJoined(false);
    setJoinedCode('');
    setRoomCode('');
    setCurrentRoundId(null);
    setCurrentRound(null);
    setCreditsRolling(false);
    setRoomStatus('lobby');
    setMovedFrom(null);
    setError(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  // The host ended this room and opened a new one: follow, same name.
  function followRoom(newCode) {
    if (!newCode || newCode === joinedCode || joiningRef.current) return;
    setMovedFrom(joinedCode);
    setRejoinCode(newCode);
    setRejoining(true);
    joinRoom({ code: newCode, playerName: name.trim(), id: playerId, alreadyRegistered: false });
  }
  const followRef = useRef(followRoom);
  followRef.current = followRoom;

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
    setRejoinCode(s.roomCode);
    joinRoom({ code: s.roomCode, playerName: s.name, id: s.playerId, alreadyRegistered: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const applyRoom = useCallback(data => {
    seenRef.current.room = data;
    setRoomStatus(data.status);
    setCurrentRoundId(data.currentRoundId);
    setSessionName(data.sessionName || '');
    setCreditsRolling(!!data.creditsRolling);
  }, []);

  const applyRound = useCallback((id, data) => {
    const round = { id, ...data };
    seenRef.current.round = round;
    setCurrentRound(round);
  }, []);

  useSyncWatchdog({ enabled: joined, roomCode: joinedCode, seenRef });

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
        applyRoom(data);
        if (data.status === 'closed' && !snap.metadata.fromCache) {
          if (data.movedTo) followRef.current(data.movedTo);
          else clearPlayerSession();
        }
      },
      err => {
        console.error('Room listener failed:', err);
        setListenError(err);
      }
    );

    return () => unsubRoom();
  }, [joined, joinedCode, applyRoom]);

  useEffect(() => {
    if (!currentRoundId || !joinedCode) {
      setCurrentRound(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'rooms', joinedCode, 'rounds', currentRoundId),
      snap => {
        if (snap.exists()) applyRound(snap.id, snap.data());
      },
      err => {
        console.error('Round listener failed:', err);
        setListenError(err);
      }
    );

    return () => unsub();
  }, [currentRoundId, joinedCode, applyRound]);

  const banner = <ConnectionBanner offline={joined && offline} error={listenError} />;

  if (rejoining) {
    return (
      <div style={styles.centered}>
        <h2>Rejoining…</h2>
        <p style={styles.subtext}>
          {movedFrom ? `The host moved to a new room. Joining ${rejoinCode}.` : `Reconnecting you to room ${rejoinCode}.`}
        </p>
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
        <button onClick={leaveRoom} style={{ ...styles.primaryButton, marginTop: '1.5rem' }}>
          Join another room
        </button>
      </div>
    );
  }

  if (creditsRolling) {
    return (
      <>
        {banner}
        <PlayerCredits roomCode={joinedCode} sessionName={sessionName} />
      </>
    );
  }

  if (roomStatus === 'lobby' || !currentRound) {
    return (
      <div style={styles.centered}>
        {banner}
        <h2>You're in, {name.trim()}.</h2>
        <p style={styles.subtext}>Waiting for the host to start...</p>
        <p style={styles.hint}>Keep this tab open. If your phone locks, it will reconnect on its own.</p>
        <div style={styles.linkRow}>
          <button onClick={leaveRoom} style={{ ...styles.linkButton, marginTop: 0 }}>
            Leave this room
          </button>
          <button onClick={joinAsSomeoneElse} style={{ ...styles.linkButton, marginTop: 0 }}>
            Not you? Change name
          </button>
        </div>
      </div>
    );
  }

  if (roomStatus === 'reviewing') {
    return (
      <div style={styles.centered}>
        {banner}
        <h2>Round complete.</h2>
        <p style={styles.subtext}>Stand by for the next round.</p>
        <button onClick={leaveRoom} style={styles.linkButton}>
          Leave this room
        </button>
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
  linkRow: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: '2rem',
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
