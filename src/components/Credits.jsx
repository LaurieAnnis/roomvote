import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const SPEED_LABELS = ['▸', '▸▸', '▸▸▸'];
const SPEED_VALUES = [25, 50, 90]; // pixels per second — slowest to fastest

export default function Credits({ sessionName, roomCode, rounds, players, onClose }) {
  const [roundData, setRoundData] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [scrollY, setScrollY] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const animRef = useRef(null);
  const lastTimeRef = useRef(null);

  const completedRounds = rounds
    .filter(r => r.status === 'complete')
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return aTime - bTime;
    });

  // Fetch subcollection data for all completed rounds
  useEffect(() => {
    if (completedRounds.length === 0) return;

    async function fetchAll() {
      const data = [];

      for (const round of completedRounds) {
        const entry = { ...round };

        if (round.type === 'submit') {
          const snap = await getDocs(
            collection(db, 'rooms', roomCode, 'rounds', round.id, 'submissions')
          );
          entry.submissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        if (round.type === 'react') {
          const snap = await getDocs(
            collection(db, 'rooms', roomCode, 'rounds', round.id, 'reactions')
          );
          const reactions = {};
          snap.docs.forEach(d => { reactions[d.id] = d.data(); });
          entry.reactions = reactions;
        }

        if (round.type === 'vote') {
          const snap = await getDocs(
            collection(db, 'rooms', roomCode, 'rounds', round.id, 'votes')
          );
          const votes = {};
          snap.docs.forEach(d => { votes[d.id] = d.data().optionId; });
          entry.votes = votes;
        }

        data.push(entry);
      }

      setRoundData(data);
      setHighlights(generateHighlights(data, players));
    }

    fetchAll();
  }, [completedRounds.length]);

  // Auto-scroll animation
  useEffect(() => {
    if (paused || !roundData) return;

    lastTimeRef.current = null;

    function tick(timestamp) {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setScrollY(prev => prev + SPEED_VALUES[speedIndex] * delta);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [paused, speedIndex, roundData]);

  function togglePause() {
    setPaused(p => !p);
  }

  function cycleSpeed() {
    setSpeedIndex(i => (i + 1) % SPEED_LABELS.length);
  }

  if (!roundData) {
    return (
      <div style={styles.loading}>
        <p>Loading credits...</p>
      </div>
    );
  }

  return (
    <div style={styles.viewport} onClick={togglePause}>
      {/* Scrolling content */}
      <div style={styles.scrollWrapper}>
        <div
          style={{
            ...styles.scrollContent,
            transform: `translateY(${-scrollY}px)`,
          }}
        >
          {/* Title card */}
          <div style={styles.titleCard}>
            <h1 style={styles.sessionTitle}>{sessionName}</h1>
            <p style={styles.playerRoll}>
              {players.map(p => p.name).join(' · ')}
            </p>
          </div>

          {/* Round recaps */}
          {roundData.map((round, i) => (
            <div key={round.id} style={styles.roundSection}>
              <div style={styles.roundHeader}>
                <span style={styles.roundNumber}>Round {i + 1}</span>
                <span style={styles.roundType}>{round.type}</span>
              </div>
              <h2 style={styles.roundPrompt}>{round.prompt}</h2>

              {round.type === 'submit' && round.submissions && (
                <div style={styles.resultsList}>
                  {round.submissions.map(s => (
                    <div key={s.id} style={styles.creditRow}>
                      <span style={styles.creditName}>{s.playerName}</span>
                      <span style={styles.creditValue}>{s.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {round.type === 'react' && round.reactions && (
                <div style={styles.resultsList}>
                  {round.options.map(opt => {
                    const r = round.reactions[opt.id];
                    const checks = r?.counts?.['✓'] || 0;
                    const bangs = r?.counts?.['!'] || 0;
                    const exes = r?.counts?.['✗'] || 0;
                    return (
                      <div key={opt.id} style={styles.creditRow}>
                        <span style={styles.creditValue}>{opt.text}</span>
                        <span style={styles.reactionSummary}>
                          <span style={styles.countGreen}>✓{checks}</span>
                          {' '}
                          <span style={styles.countYellow}>!{bangs}</span>
                          {' '}
                          <span style={styles.countRed}>✗{exes}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {round.type === 'vote' && round.votes && (
                <div style={styles.resultsList}>
                  {[...round.options]
                    .sort((a, b) => {
                      const aCount = Object.values(round.votes).filter(v => v === a.id).length;
                      const bCount = Object.values(round.votes).filter(v => v === b.id).length;
                      return bCount - aCount;
                    })
                    .map((opt, j) => {
                      const count = Object.values(round.votes).filter(v => v === opt.id).length;
                      return (
                        <div key={opt.id} style={styles.creditRow}>
                          <span style={styles.rank}>#{j + 1}</span>
                          <span style={styles.creditValue}>{opt.text}</span>
                          <span style={styles.voteCount}>{count} vote{count !== 1 ? 's' : ''}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))}

          {/* Highlights */}
          {highlights.length > 0 && (
            <div style={styles.highlightsSection}>
              <h2 style={styles.highlightsTitle}>Highlights</h2>
              {highlights.map((h, i) => (
                <div key={i} style={styles.highlightCard}>
                  <div style={styles.highlightLabel}>{h.label}</div>
                  <div style={styles.highlightValue}>{h.value}</div>
                  {h.detail && <div style={styles.highlightDetail}>{h.detail}</div>}
                </div>
              ))}
            </div>
          )}

          {/* End spacer so content scrolls fully off */}
          <div style={styles.endSpacer}>
            <p style={styles.endText}>Thanks for playing.</p>
          </div>
        </div>
      </div>

      {/* Fixed controls */}
      <div style={styles.controls} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={styles.controlButton}>
          ← Back to session
        </button>
        <button onClick={togglePause} style={styles.controlButton}>
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>
        <button onClick={cycleSpeed} style={styles.controlButton}>
          {SPEED_LABELS[speedIndex]}
        </button>
      </div>
    </div>
  );
}

// ─── Highlight generation ────────────────────────────────────────────────────

function generateHighlights(roundData, players) {
  const highlights = [];

  // Submit rounds: most submissions across all submit rounds per player
  const submitCounts = {};
  roundData.filter(r => r.type === 'submit').forEach(r => {
    (r.submissions || []).forEach(s => {
      submitCounts[s.playerName] = (submitCounts[s.playerName] || 0) + 1;
    });
  });

  if (Object.keys(submitCounts).length > 0) {
    const topSubmitter = Object.entries(submitCounts)
      .sort((a, b) => b[1] - a[1])[0];
    if (topSubmitter[1] > 1) {
      highlights.push({
        label: 'Most Prolific',
        value: topSubmitter[0],
        detail: `${topSubmitter[1]} submissions`,
      });
    }
  }

  // React rounds: item with most checkmarks
  let bestChecks = { text: '', count: 0 };
  roundData.filter(r => r.type === 'react').forEach(r => {
    (r.options || []).forEach(opt => {
      const checks = r.reactions?.[opt.id]?.counts?.['✓'] || 0;
      if (checks > bestChecks.count) {
        bestChecks = { text: opt.text, count: checks };
      }
    });
  });
  if (bestChecks.count > 0) {
    highlights.push({
      label: 'Most Enthusiasm',
      value: bestChecks.text,
      detail: `${bestChecks.count} ✓`,
    });
  }

  // React rounds: most controversial (highest ! count)
  let mostBangs = { text: '', count: 0 };
  roundData.filter(r => r.type === 'react').forEach(r => {
    (r.options || []).forEach(opt => {
      const bangs = r.reactions?.[opt.id]?.counts?.['!'] || 0;
      if (bangs > mostBangs.count) {
        mostBangs = { text: opt.text, count: bangs };
      }
    });
  });
  if (mostBangs.count > 0) {
    highlights.push({
      label: 'Most Debated',
      value: mostBangs.text,
      detail: `${mostBangs.count} !`,
    });
  }

  // Vote rounds: top voted option across all vote rounds
  let topVoted = { text: '', count: 0, prompt: '' };
  roundData.filter(r => r.type === 'vote').forEach(r => {
    (r.options || []).forEach(opt => {
      const count = Object.values(r.votes || {}).filter(v => v === opt.id).length;
      if (count > topVoted.count) {
        topVoted = { text: opt.text, count, prompt: r.prompt };
      }
    });
  });
  if (topVoted.count > 0) {
    highlights.push({
      label: 'Top Vote-Getter',
      value: topVoted.text,
      detail: `${topVoted.count} vote${topVoted.count !== 1 ? 's' : ''}`,
    });
  }

  // Most active player overall (submissions + votes + reactions)
  const activity = {};
  roundData.forEach(r => {
    if (r.type === 'submit') {
      (r.submissions || []).forEach(s => {
        activity[s.playerName] = (activity[s.playerName] || 0) + 1;
      });
    }
    if (r.type === 'vote') {
      Object.keys(r.votes || {}).forEach(playerId => {
        const player = players.find(p => p.id === playerId);
        if (player) {
          activity[player.name] = (activity[player.name] || 0) + 1;
        }
      });
    }
    if (r.type === 'react') {
      Object.values(r.reactions || {}).forEach(reaction => {
        Object.keys(reaction.individual || {}).forEach(playerId => {
          const player = players.find(p => p.id === playerId);
          if (player) {
            activity[player.name] = (activity[player.name] || 0) + 1;
          }
        });
      });
    }
  });

  if (Object.keys(activity).length > 0) {
    const topActive = Object.entries(activity)
      .sort((a, b) => b[1] - a[1])[0];
    highlights.push({
      label: 'Most Active',
      value: topActive[0],
      detail: `${topActive[1]} total actions`,
    });
  }

  return highlights;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  viewport: {
    position: 'fixed',
    inset: 0,
    background: '#16171d',
    overflow: 'hidden',
    cursor: 'pointer',
    zIndex: 1000,
  },
  loading: {
    position: 'fixed',
    inset: 0,
    background: '#16171d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    fontFamily: 'sans-serif',
    fontSize: '1.2rem',
  },
  scrollWrapper: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scrollContent: {
    position: 'absolute',
    top: '100vh',
    width: '100%',
    maxWidth: '700px',
    padding: '0 2rem',
    boxSizing: 'border-box',
    fontFamily: 'sans-serif',
  },
  titleCard: {
    textAlign: 'center',
    paddingBottom: '6rem',
  },
  sessionTitle: {
    fontSize: '3rem',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '1.5rem',
  },
  playerRoll: {
    fontSize: '1.1rem',
    color: '#888',
    lineHeight: '2',
  },
  roundSection: {
    marginBottom: '5rem',
  },
  roundHeader: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  roundNumber: {
    fontSize: '0.85rem',
    color: '#4caf50',
    textTransform: 'uppercase',
    letterSpacing: '0.1rem',
  },
  roundType: {
    fontSize: '0.75rem',
    color: '#666',
    textTransform: 'uppercase',
  },
  roundPrompt: {
    fontSize: '1.5rem',
    color: '#fff',
    marginBottom: '1.5rem',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  creditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.6rem 0',
    borderBottom: '1px solid #2e303a',
  },
  creditName: {
    fontSize: '0.85rem',
    color: '#4caf50',
    minWidth: '8rem',
  },
  creditValue: {
    fontSize: '1rem',
    color: '#ccc',
    flex: 1,
  },
  reactionSummary: {
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
  },
  rank: {
    color: '#888',
    minWidth: '2.5rem',
    fontSize: '0.9rem',
  },
  voteCount: {
    color: '#888',
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
  },
  highlightsSection: {
    paddingTop: '3rem',
    paddingBottom: '3rem',
    borderTop: '1px solid #2e303a',
  },
  highlightsTitle: {
    fontSize: '1.8rem',
    color: '#ff9800',
    textAlign: 'center',
    marginBottom: '2rem',
  },
  highlightCard: {
    textAlign: 'center',
    marginBottom: '3rem',
  },
  highlightLabel: {
    fontSize: '0.85rem',
    color: '#ff9800',
    textTransform: 'uppercase',
    letterSpacing: '0.15rem',
    marginBottom: '0.5rem',
  },
  highlightValue: {
    fontSize: '1.6rem',
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: '0.25rem',
  },
  highlightDetail: {
    fontSize: '0.95rem',
    color: '#888',
  },
  endSpacer: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: {
    fontSize: '1.2rem',
    color: '#444',
  },
  controls: {
    position: 'fixed',
    bottom: '1.5rem',
    right: '1.5rem',
    display: 'flex',
    gap: '0.5rem',
    zIndex: 1001,
  },
  controlButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    background: 'rgba(30, 30, 30, 0.9)',
    color: '#aaa',
    border: '1px solid #444',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  countGreen: { color: '#4caf50' },
  countYellow: { color: '#ff9800' },
  countRed: { color: '#f44336' },
};
