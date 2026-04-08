import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  doc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';

export default function PlayerView() {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [playerId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState('lobby');
  const [options, setOptions] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [error, setError] = useState(null);

  async function joinRoom() {
    const code = roomCode.trim().toUpperCase();
    if (!code || !name.trim()) return;

    const roomRef = doc(db, 'rooms', code);
    const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(roomRef));

    if (!snap.exists()) {
      setError('Room not found. Check the code and try again.');
      return;
    }

    await setDoc(doc(db, 'rooms', code, 'players', playerId), {
      name: name.trim(),
      joinedAt: serverTimestamp(),
      hasVoted: false,
    });

    setRoomCode(code);
    setJoined(true);
    setError(null);
  }

  useEffect(() => {
    if (!joined) return;

    const unsub = onSnapshot(doc(db, 'rooms', roomCode), (snap) => {
      const data = snap.data();
      if (!data) return;
      setStatus(data.status);
      setOptions(data.options || []);
    });

    return () => unsub();
  }, [joined, roomCode]);

  async function castVote(optionId) {
    if (myVote) return;
    await setDoc(doc(db, 'rooms', roomCode, 'votes', playerId), {
      optionId,
      votedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'rooms', roomCode, 'players', playerId), {
      hasVoted: true,
    });
    setMyVote(optionId);
  }

  if (!joined) {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif', padding: '1rem' }}>
        <h2>Join a Room</h2>
        <input
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          placeholder="Room code"
          maxLength={4}
          style={{ display: 'block', margin: '0.5rem auto', padding: '0.75rem', fontSize: '1.5rem', textAlign: 'center', width: '8rem', letterSpacing: '0.3rem' }}
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          style={{ display: 'block', margin: '0.5rem auto', padding: '0.75rem', fontSize: '1rem', width: '16rem' }}
        />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button
          onClick={joinRoom}
          style={{ marginTop: '1rem', padding: '0.75rem 2rem', fontSize: '1rem' }}
        >
          Join
        </button>
      </div>
    );
  }

  if (status === 'lobby') {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>
        <h2>You're in, {name.split(' ')[0]}.</h2>
        <p style={{ color: '#666' }}>Waiting for the host to start voting...</p>
      </div>
    );
  }

  if (status === 'voting') {
    return (
      <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
        <h2>{myVote ? 'Vote cast.' : 'Cast your vote.'}</h2>
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => castVote(o.id)}
            disabled={!!myVote}
            style={{
              display: 'block',
              width: '100%',
              padding: '1rem',
              marginBottom: '0.75rem',
              fontSize: '1rem',
              background: myVote === o.id ? '#4caf50' : myVote ? '#eee' : '#fff',
              border: '2px solid #ccc',
              borderRadius: '8px',
              cursor: myVote ? 'default' : 'pointer',
            }}
          >
            {o.text}
          </button>
        ))}
        {myVote && <p style={{ color: '#666', textAlign: 'center' }}>Waiting for others...</p>}
      </div>
    );
  }

  if (status === 'revealed' || status === 'closed') {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>
        <h2>Results are in.</h2>
        <p style={{ color: '#666' }}>Check the host screen.</p>
      </div>
    );
  }

  return null;
}
