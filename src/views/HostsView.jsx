import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  doc, setDoc, updateDoc, onSnapshot,
  collection, serverTimestamp
} from 'firebase/firestore';
import { generateRoomCode } from '../utils/roomCode';

export default function HostView() {
  const [roomCode, setRoomCode] = useState(null);
  const [status, setStatus] = useState('lobby');
  const [options, setOptions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [votes, setVotes] = useState({});
  const [newOptionText, setNewOptionText] = useState('');

  async function createRoom() {
    const code = generateRoomCode();
    await setDoc(doc(db, 'rooms', code), {
      status: 'lobby',
      options: [],
      createdAt: serverTimestamp(),
    });
    setRoomCode(code);
  }

  useEffect(() => {
    if (!roomCode) return;

    const unsub = onSnapshot(doc(db, 'rooms', roomCode), (snap) => {
      const data = snap.data();
      if (!data) return;
      setStatus(data.status);
      setOptions(data.options || []);
    });

    const unsubPlayers = onSnapshot(collection(db, 'rooms', roomCode, 'players'), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubVotes = onSnapshot(collection(db, 'rooms', roomCode, 'votes'), (snap) => {
      const v = {};
      snap.docs.forEach(d => { v[d.id] = d.data().optionId; });
      setVotes(v);
    });

    return () => { unsub(); unsubPlayers(); unsubVotes(); };
  }, [roomCode]);

  async function addOption() {
    if (!newOptionText.trim()) return;
    const newOption = { id: crypto.randomUUID(), text: newOptionText.trim() };
    await updateDoc(doc(db, 'rooms', roomCode), {
      options: [...options, newOption],
    });
    setNewOptionText('');
  }

  async function removeOption(id) {
    await updateDoc(doc(db, 'rooms', roomCode), {
      options: options.filter(o => o.id !== id),
    });
  }

  async function startVoting() {
    await updateDoc(doc(db, 'rooms', roomCode), { status: 'voting' });
  }

  async function revealVotes() {
    await updateDoc(doc(db, 'rooms', roomCode), { status: 'revealed' });
  }

  async function closeRoom() {
    await updateDoc(doc(db, 'rooms', roomCode), { status: 'closed' });
  }

  const voteCounts = options.reduce((acc, o) => {
    acc[o.id] = Object.values(votes).filter(v => v === o.id).length;
    return acc;
  }, {});

  if (!roomCode) {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>
        <h2>Host</h2>
        <button onClick={createRoom} style={{ padding: '1rem 2rem', fontSize: '1.2rem' }}>
          Create Room
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '4rem', textAlign: 'center', letterSpacing: '0.5rem' }}>{roomCode}</h1>
      <p style={{ textAlign: 'center', color: '#666' }}>Status: {status}</p>

      <h2>Players ({players.length})</h2>
      <ul>
        {players.map(p => (
          <li key={p.id}>
            {p.name} {votes[p.id] ? '✓' : '⏳'}
          </li>
        ))}
      </ul>

      <h2>Options</h2>
      {options.map(o => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <span style={{ flex: 1 }}>{o.text}</span>
          {status === 'revealed' && <strong>{voteCounts[o.id]} votes</strong>}
          {status === 'lobby' && (
            <button onClick={() => removeOption(o.id)}>Remove</button>
          )}
        </div>
      ))}

      {status === 'lobby' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <input
            value={newOptionText}
            onChange={e => setNewOptionText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addOption()}
            placeholder="Add an option..."
            style={{ flex: 1, padding: '0.5rem' }}
          />
          <button onClick={addOption}>Add</button>
        </div>
      )}

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
        {status === 'lobby' && (
          <button onClick={startVoting} disabled={options.length < 2}>
            Start Voting
          </button>
        )}
        {status === 'voting' && (
          <button onClick={revealVotes}>
            Reveal ({Object.keys(votes).length}/{players.length} voted)
          </button>
        )}
        {status === 'revealed' && (
          <button onClick={closeRoom}>Close Room</button>
        )}
      </div>
    </div>
  );
}
