import { useDelayedFlag } from '../utils/connection';

export default function ConnectionBanner({ offline, error }) {
  const showOffline = useDelayedFlag(offline);
  if (!error && !showOffline) return null;

  return (
    <div style={bannerStyles.banner} role="status">
      <span>
        {error
          ? 'Lost contact with the room.'
          : 'Reconnecting… your answers are saved and will send when you’re back online.'}
      </span>
      <button onClick={() => window.location.reload()} style={bannerStyles.button}>
        Reconnect
      </button>
    </div>
  );
}

const bannerStyles = {
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
    padding: '0.6rem 1rem',
    background: '#ff9800',
    color: '#111',
    fontFamily: 'sans-serif',
    fontSize: '0.95rem',
    textAlign: 'center',
  },
  button: {
    padding: '0.35rem 0.9rem',
    fontSize: '0.9rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
