import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
  doc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, serverTimestamp,
  getDocs, deleteDoc, writeBatch
} from 'firebase/firestore';
import { generateRoomCode } from '../utils/roomCode';
import { SubmitRoundHost } from '../components/rounds/SubmitRound';
import { ReactRoundHost } from '../components/rounds/ReactRound';
import { VoteRoundHost } from '../components/rounds/VoteRound';
import Credits from '../components/Credits';
import QRCode from 'qrcode';

const ROUND_TYPES = [
  { value: 'submit', label: 'Submit — players enter free text' },
  { value: 'react', label: 'React — players react to items one by one' },
  { value: 'vote', label: 'Vote — players choose from options' },
];

const DEFAULT_TIMERS = { submit: 180, react: 30, vote: 60 };

const BASE_URL = 'https://roomvote-2026.web.app';

export default function HostView() {
  const [roomCode, setRoomCode] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [roomStatus, setRoomStatus] = useState('lobby');
  const [players, setPlayers] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [currentRoundId, setCurrentRoundId] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [showCredits, setShowCredits] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // new round form
  const [newRoundType, setNewRoundType] = useState('submit');
  const [newRoundPrompt, setNewRoundPrompt] = useState('');
  const [newRoundTimer, setNewRoundTimer] = useState(180);
  const [newRoundOptions, setNewRoundOptions] = useState('');
  const [showNewRound, setShowNewRound] = useState(false);
  const [newRoundShowNames, setNewRoundShowNames] = useState(false);
  const [newRoundShowResultsLive, setNewRoundShowResultsLive] = useState(false);

  // Generate QR code when room is created
  useEffect(() => {
    if (!roomCode) return;
    const joinUrl = `${BASE_URL}?room=${roomCode}`;
    QRCode.toDataURL(joinUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#ffffff', light: '#00000000' },
    }).then(url => setQrDataUrl(url));
  }, [roomCode]);

  async function createRoom() {
    if (!sessionNameInput.trim()) return;
    const code = generateRoomCode();
    await setDoc(doc(db, 'rooms', code), {
      sessionName: sessionNameInput.trim(),
      status: 'lobby',
      currentRoundId: null,
      createdAt: serverTimestamp(),
    });
    setRoomCode(code);
    setSessionName(sessionNameInput.trim());
  }

  useEffect(() => {
    if (!roomCode) return;

    const unsubRoom = onSnapshot(doc(db, 'rooms', roomCode), snap => {
      const data = snap.data();
      if (!data) return;
      setRoomStatus(data.status);
      setCurrentRoundId(data.currentRoundId);
    });

    const unsubPlayers = onSnapshot(
      collection(db, 'rooms', roomCode, 'players'),
      snap => setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubRounds = onSnapshot(
      collection(db, 'rooms', roomCode, 'rounds'),
      snap => setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubRoom(); unsubPlayers(); unsubRounds(); };
  }, [roomCode]);

  useEffect(() => {
    if (!currentRoundId || rounds.length === 0) {
      setCurrentRound(null);
      return;
    }
    const round = rounds.find(r => r.id === currentRoundId);
    setCurrentRound(round || null);
  }, [currentRoundId, rounds]);

  async function startRound() {
    if (!newRoundPrompt.trim()) return;

    const options = newRoundType !== 'submit'
      ? newRoundOptions
          .split('\n')
          .map(t => t.trim())
          .filter(Boolean)
          .map(text => ({ id: crypto.randomUUID(), text }))
      : [];

    const roundData = {
      type: newRoundType,
      prompt: newRoundPrompt.trim(),
      status: 'open',
      timerSeconds: newRoundTimer,
      timerStartedAt: serverTimestamp(),
      currentItemIndex: 0,
      options,
      showNames: newRoundShowNames,
      showResultsLive: newRoundShowResultsLive,
      createdAt: serverTimestamp(),
    };

    const roundRef = await addDoc(
      collection(db, 'rooms', roomCode, 'rounds'),
      roundData
    );

    await updateDoc(doc(db, 'rooms', roomCode), {
      currentRoundId: roundRef.id,
      status: 'active',
    });

    setNewRoundPrompt('');
    setNewRoundOptions('');
    setNewRoundTimer(DEFAULT_TIMERS[newRoundType]);
    setNewRoundShowNames(false);
    setNewRoundShowResultsLive(false);
    setShowNewRound(false);
  }

  async function redoRound() {
    if (!currentRound) return;

    const roundData = {
      type: currentRound.type,
      prompt: currentRound.prompt,
      status: 'open',
      timerSeconds: currentRound.timerSeconds,
      timerStartedAt: serverTimestamp(),
      currentItemIndex: 0,
      options: currentRound.type !== 'submit'
        ? currentRound.options.map(opt => ({
            id: crypto.randomUUID(),
            text: opt.text,
            ...(opt.authorId ? { authorId: opt.authorId } : {}),
          }))
        : [],
      showNames: currentRound.showNames ?? false,
      showResultsLive: currentRound.showResultsLive ?? false,
      createdAt: serverTimestamp(),
    };

    const roundRef = await addDoc(
      collection(db, 'rooms', roomCode, 'rounds'),
      roundData
    );

    await updateDoc(doc(db, 'rooms', roomCode), {
      currentRoundId: roundRef.id,
      status: 'active',
    });
  }

  async function deleteSession() {
    setDeleting(true);
    try {
      // Delete each round's subcollections (submissions, reactions, votes), then the round doc
      const roundsSnap = await getDocs(collection(db, 'rooms', roomCode, 'rounds'));
      for (const roundDoc of roundsSnap.docs) {
        const roundRef = roundDoc.ref;
        const subcollections = ['submissions', 'reactions', 'votes'];
        for (const sub of subcollections) {
          const subSnap = await getDocs(collection(roundRef, sub));
          const batch = writeBatch(db);
          subSnap.docs.forEach(d => batch.delete(d.ref));
          if (subSnap.docs.length > 0) await batch.commit();
        }
        await deleteDoc(roundRef);
      }

      // Delete players
      const playersSnap = await getDocs(collection(db, 'rooms', roomCode, 'players'));
      const playerBatch = writeBatch(db);
      playersSnap.docs.forEach(d => playerBatch.delete(d.ref));
      if (playersSnap.docs.length > 0) await playerBatch.commit();

      // Delete the room doc itself
      await deleteDoc(doc(db, 'rooms', roomCode));

      // Reset local state back to the create-room screen
      setRoomCode(null);
      setSessionName('');
      setSessionNameInput('');
      setRoomStatus('lobby');
      setPlayers([]);
      setRounds([]);
      setCurrentRoundId(null);
      setCurrentRound(null);
      setQrDataUrl(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Delete session failed:', err);
      alert('Delete failed — check the console. Firestore rules may need to allow deletes.');
    } finally {
      setDeleting(false);
    }
  }

  function handleTypeChange(type) {
    setNewRoundType(type);
    setNewRoundTimer(DEFAULT_TIMERS[type]);
  }

  const completedRounds = rounds.filter(r => r.status === 'complete');
  const hasCompletedRounds = completedRounds.length > 0;
  const noActiveRound = !currentRound || currentRound.status === 'complete';

  if (showCredits) {
    return (
      <Credits
        sessionName={sessionName}
        roomCode={roomCode}
        rounds={rounds}
        players={players}
        onClose={() => setShowCredits(false)}
      />
    );
  }

  if (!roomCode) {
    return (
      <div style={styles.centered}>
        <h2>New Session</h2>
        <input
          value={sessionNameInput}
          onChange={e => setSessionNameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createRoom()}
          placeholder="Session name (e.g. AME 494 Week 1)"
          style={{ ...styles.input, width: '20rem', maxWidth: '100%' }}
        />
        <button
          onClick={createRoom}
          disabled={!sessionNameInput.trim()}
          style={styles.primaryButton}
        >
          Create Room
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>

      {/* Header */}
      <div style={styles.header}>
        {qrDataUrl && (
          <div style={styles.qrContainer}>
            <img src={qrDataUrl} alt="Scan to join" style={styles.qrImage} />
          </div>
        )}
        <div style={styles.roomCode}>{roomCode}</div>
        <div style={styles.sessionName}>{sessionName}</div>
        <div style={styles.playerCount}>
          {players.length} player{players.length !== 1 ? 's' : ''}
          {players.length > 0 && (
            <span style={styles.playerNames}>
              {' — '}{players.map(p => p.name).join(', ')}
            </span>
          )}
        </div>
      </div>

      <hr style={styles.divider} />

      {/* Active round */}
      {currentRound && (
        <div style={styles.section}>
          {currentRound.type === 'submit' && (
            <SubmitRoundHost
              roomCode={roomCode}
              round={currentRound}
              roundId={currentRoundId}
              players={players}
              sessionName={sessionName}
            />
          )}
          {currentRound.type === 'react' && (
            <ReactRoundHost
              roomCode={roomCode}
              round={currentRound}
              roundId={currentRoundId}
              players={players}
              sessionName={sessionName}
            />
          )}
          {currentRound.type === 'vote' && (
            <VoteRoundHost
              roomCode={roomCode}
              round={currentRound}
              roundId={currentRoundId}
              players={players}
              sessionName={sessionName}
            />
          )}

          <div style={styles.redoRow}>
            <button onClick={redoRound} style={styles.redoButton}>
              ↺ Redo Round
            </button>
          </div>
        </div>
      )}

      {/* Round history */}
      {rounds.filter(r => r.id !== currentRoundId && r.status === 'complete').length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionLabel}>Completed rounds</h3>
          {rounds
            .filter(r => r.id !== currentRoundId && r.status === 'complete')
            .map(r => (
              <div key={r.id} style={styles.historyRow}>
                <span style={styles.historyType}>{r.type}</span>
                <span style={styles.historyPrompt}>{r.prompt}</span>
              </div>
            ))}
        </div>
      )}

      <hr style={styles.divider} />

      {/* New round / credits */}
      {(roomStatus === 'lobby' || roomStatus === 'reviewing') && (
        <div style={styles.section}>
          {!showNewRound ? (
            <div style={styles.bottomButtons}>
              <button
                onClick={() => setShowNewRound(true)}
                style={styles.secondaryButton}
              >
                + New Round
              </button>
              {hasCompletedRounds && noActiveRound && (
                <button
                  onClick={() => setShowCredits(true)}
                  style={styles.creditsButton}
                >
                  🎬 Roll Credits
                </button>
              )}
            </div>
          ) : (
            <div style={styles.newRoundForm}>
              <h3 style={styles.sectionLabel}>New round</h3>

              <label style={styles.label}>Round type</label>
              <div style={styles.typeButtons}>
                {ROUND_TYPES.map(rt => (
                  <button
                    key={rt.value}
                    onClick={() => handleTypeChange(rt.value)}
                    style={{
                      ...styles.typeButton,
                      background: newRoundType === rt.value ? '#4caf50' : '#1e1e1e',
                      borderColor: newRoundType === rt.value ? '#4caf50' : '#444',
                    }}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>

              <label style={styles.label}>Prompt</label>
              <textarea
                value={newRoundPrompt}
                onChange={e => setNewRoundPrompt(e.target.value)}
                placeholder="What do you want players to do?"
                rows={2}
                style={styles.textarea}
              />

              {newRoundType !== 'submit' && (
                <>
                  <label style={styles.label}>
                    Options (one per line
                    {newRoundType === 'react' ? ' — paste from spreadsheet or type' : ''})
                  </label>
                  <textarea
                    value={newRoundOptions}
                    onChange={e => setNewRoundOptions(e.target.value)}
                    placeholder={'Option one\nOption two\nOption three'}
                    rows={6}
                    style={styles.textarea}
                  />
                </>
              )}

              <label style={styles.label}>Timer (seconds)</label>
              <input
                type="number"
                value={newRoundTimer}
                onChange={e => setNewRoundTimer(Number(e.target.value))}
                style={{ ...styles.input, width: '8rem' }}
              />

              {/* Visibility toggles */}
              <div style={styles.toggleSection}>
                <label style={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={newRoundShowNames}
                    onChange={e => setNewRoundShowNames(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Show player names on screen
                </label>
                <label style={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={newRoundShowResultsLive}
                    onChange={e => setNewRoundShowResultsLive(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Show results as they come in
                </label>
              </div>

              <div style={styles.formButtons}>
                <button
                  onClick={() => setShowNewRound(false)}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
                <button
                  onClick={startRound}
                  disabled={!newRoundPrompt.trim()}
                  style={{
                    ...styles.primaryButton,
                    opacity: newRoundPrompt.trim() ? 1 : 0.5,
                  }}
                >
                  Start Round
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete session */}
      <hr style={styles.divider} />
      <div style={styles.deleteSection}>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={styles.deleteButton}
        >
          🗑 Delete Session
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={styles.modalOverlay} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Delete this session?</h3>
            <p style={{ color: '#ccc', margin: '0 0 0.5rem 0' }}>
              This will permanently delete room <strong>{roomCode}</strong> and all its data from Firestore.
            </p>
            <p style={{ color: '#888', margin: '0 0 1.5rem 0', fontSize: '0.85rem' }}>
              Google Sheets data is not affected.
            </p>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                onClick={deleteSession}
                disabled={deleting}
                style={{
                  ...styles.deleteConfirmButton,
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, delete it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: 'sans-serif',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginTop: '20vh',
    fontFamily: 'sans-serif',
    padding: '1rem',
  },
  header: {
    textAlign: 'center',
    marginBottom: '1rem',
  },
  qrContainer: {
    marginTop: '2rem',
    marginBottom: '2rem',
    display: 'flex',
    justifyContent: 'center',
  },
  qrImage: {
    width: '200px',
    height: '200px',
  },
  roomCode: {
    fontSize: '4rem',
    fontWeight: 'bold',
    letterSpacing: '0.5rem',
    marginBottom: '2rem',
  },
  sessionName: {
    fontSize: '1rem',
    color: '#aaa',
    marginBottom: '0.5rem',
  },
  playerCount: {
    fontSize: '0.9rem',
    color: '#888',
  },
  playerNames: {
    color: '#aaa',
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #333',
    margin: '1.5rem 0',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionLabel: {
    fontSize: '0.9rem',
    color: '#888',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05rem',
  },
  historyRow: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #2a2a2a',
  },
  historyType: {
    fontSize: '0.75rem',
    color: '#888',
    minWidth: '4rem',
    textTransform: 'uppercase',
  },
  historyPrompt: {
    fontSize: '0.9rem',
    color: '#ccc',
  },
  redoRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '1.5rem',
  },
  redoButton: {
    padding: '0.5rem 1.5rem',
    fontSize: '0.9rem',
    background: 'transparent',
    color: '#ff9800',
    border: '2px solid #ff9800',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  bottomButtons: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  newRoundForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  label: {
    fontSize: '0.85rem',
    color: '#aaa',
  },
  typeButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  typeButton: {
    padding: '0.6rem 1rem',
    fontSize: '0.9rem',
    border: '2px solid',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#fff',
    textAlign: 'left',
  },
  input: {
    padding: '0.6rem',
    fontSize: '1rem',
    background: '#1e1e1e',
    color: '#fff',
    border: '2px solid #444',
    borderRadius: '6px',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '1rem',
    marginTop: '1rem',
  },
  textarea: {
    padding: '0.6rem',
    fontSize: '0.95rem',
    background: '#1e1e1e',
    color: '#fff',
    border: '2px solid #444',
    borderRadius: '6px',
    resize: 'vertical',
    width: '100%',
    boxSizing: 'border-box',
  },
  toggleSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem',
    border: '1px solid #333',
    borderRadius: '8px',
    marginTop: '0.25rem',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.9rem',
    color: '#ccc',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#4caf50',
    cursor: 'pointer',
  },
  formButtons: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
    marginTop: '0.5rem',
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
  secondaryButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: 'transparent',
    color: '#4caf50',
    border: '2px solid #4caf50',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  creditsButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: 'transparent',
    color: '#ff9800',
    border: '2px solid #ff9800',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: 'transparent',
    color: '#888',
    border: '2px solid #444',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  deleteSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '2rem',
  },
  deleteButton: {
    padding: '0.6rem 1.5rem',
    fontSize: '0.85rem',
    background: 'transparent',
    color: '#f44336',
    border: '2px solid #f44336',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1e1e1e',
    border: '2px solid #444',
    borderRadius: '12px',
    padding: '2rem',
    maxWidth: '400px',
    width: '90%',
  },
  modalButtons: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
  },
  deleteConfirmButton: {
    padding: '0.75rem 2rem',
    fontSize: '1rem',
    background: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};
