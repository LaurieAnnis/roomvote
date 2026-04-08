import { useState } from 'react';
import HostView from './views/HostView';
import PlayerView from './views/PlayerView';

export default function App() {
  const [mode, setMode] = useState(null);

  if (mode === 'host') return <HostView />;
  if (mode === 'player') return <PlayerView />;

  return (
    <div style={{ textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>
      <h1>Roomvote</h1>
      <p>What are you?</p>
      <button onClick={() => setMode('host')} style={{ margin: '1rem', padding: '1rem 2rem', fontSize: '1.2rem' }}>
        Host
      </button>
      <button onClick={() => setMode('player')} style={{ margin: '1rem', padding: '1rem 2rem', fontSize: '1.2rem' }}>
        Player
      </button>
    </div>
  );
}
