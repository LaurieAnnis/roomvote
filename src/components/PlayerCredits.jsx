import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import Credits from './Credits';

// The host already has rounds and players in memory; a phone fetches them
// once when the credits start, then hands them to the same Credits view.
export default function PlayerCredits({ roomCode, sessionName }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDocs(collection(db, 'rooms', roomCode, 'rounds')),
      getDocs(collection(db, 'rooms', roomCode, 'players')),
    ])
      .then(([roundsSnap, playersSnap]) => {
        if (cancelled) return;
        setData({
          rounds: roundsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          players: playersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      })
      .catch(err => {
        console.error('Credits load failed:', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [roomCode]);

  if (failed) {
    return (
      <div style={styles.message}>
        <p>Couldn't load the credits. Watch the big screen!</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.message}>
        <p>Loading credits...</p>
      </div>
    );
  }

  return (
    <Credits
      sessionName={sessionName}
      roomCode={roomCode}
      rounds={data.rounds}
      players={data.players}
      showControls={false}
    />
  );
}

const styles = {
  message: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#16171d',
    color: '#888',
    fontFamily: 'sans-serif',
    fontSize: '1.1rem',
    textAlign: 'center',
    padding: '1rem',
  },
};
