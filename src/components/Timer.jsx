import { useTimer, formatTime } from '../utils/timer';

export default function Timer({ timerStartedAt, timerSeconds, style }) {
  const secondsLeft = useTimer(timerStartedAt, timerSeconds);

  if (secondsLeft === null) return null;

  const pct = timerSeconds > 0 ? secondsLeft / timerSeconds : 0;
  const color = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336';

  return (
    <div style={{ textAlign: 'center', ...style }}>
      <div style={{
        fontSize: '3rem',
        fontWeight: 'bold',
        color,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {formatTime(secondsLeft)}
      </div>
      <div style={{
        height: '6px',
        background: '#333',
        borderRadius: '3px',
        marginTop: '0.5rem',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct * 100}%`,
          background: color,
          transition: 'width 0.5s linear, background 0.5s',
        }} />
      </div>
    </div>
  );
}
