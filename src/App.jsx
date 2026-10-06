import { useState } from 'react';
import HostView from './views/HostView';
import PlayerView from './views/PlayerView';

export default function App() {
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) return 'player';
    if (params.has('host')) return 'host';
    return null;
  });

  function chooseHost() {
    // Keeps a reload on the host screen, where the room reopens itself.
    window.history.replaceState(null, '', '?host');
    setMode('host');
  }

  if (mode === 'host') return <HostView />;
  if (mode === 'player') return <PlayerView />;

  return (
    <div style={{ textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>
      <h1>Roomvote</h1>
      <p>What are you?</p>
      <button onClick={chooseHost} style={{ margin: '1rem', padding: '1rem 2rem', fontSize: '1.2rem' }}>
        Host
      </button>
      <button onClick={() => setMode('player')} style={{ margin: '1rem', padding: '1rem 2rem', fontSize: '1.2rem' }}>
        Player
      </button>
    </div>
  );
}
