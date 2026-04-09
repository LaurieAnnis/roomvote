const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwRzvvfrGx4n9UG4ityzPU78bkoizb-VBZTZLhETDtM8UyUBus42TnihHGXYLpQgE4S/exec';

export async function logRoundToSheet(sessionName, roomCode, round, submissions, reactions, votes, players) {
  const timestamp = new Date().toISOString();
  const rows = [];

  if (round.type === 'submit') {
    submissions.forEach(s => {
      rows.push({
        timestamp,
        sessionName,
        roomCode,
        roundType: 'submit',
        roundPrompt: round.prompt,
        itemText: '',
        checkCount: '',
        bangCount: '',
        xCount: '',
        individualReactions: '',
        playerName: s.playerName,
        submissionText: s.text,
        voteOption: '',
      });
    });
  }

  if (round.type === 'react') {
    round.options.forEach(option => {
      const r = reactions[option.id] || { counts: { '✓': 0, '!': 0, '✗': 0 }, individual: {} };
      const individualStr = Object.entries(r.individual)
        .map(([pid, symbol]) => {
          const player = players.find(p => p.id === pid);
          return `${player ? player.name : pid}:${symbol}`;
        })
        .join(' | ');

      rows.push({
        timestamp,
        sessionName,
        roomCode,
        roundType: 'react',
        roundPrompt: round.prompt,
        itemText: option.text,
        checkCount: r.counts['✓'] || 0,
        bangCount: r.counts['!'] || 0,
        xCount: r.counts['✗'] || 0,
        individualReactions: individualStr,
        playerName: '',
        submissionText: '',
        voteOption: '',
      });
    });
  }

  if (round.type === 'vote') {
    round.options.forEach(option => {
      const voteCount = Object.values(votes).filter(v => v === option.id).length;
      const voterNames = Object.entries(votes)
        .filter(([, optId]) => optId === option.id)
        .map(([pid]) => {
          const player = players.find(p => p.id === pid);
          return player ? player.name : pid;
        })
        .join(' | ');

      rows.push({
        timestamp,
        sessionName,
        roomCode,
        roundType: 'vote',
        roundPrompt: round.prompt,
        itemText: option.text,
        checkCount: voteCount,
        bangCount: '',
        xCount: '',
        individualReactions: '',
        playerName: voterNames,
        submissionText: '',
        voteOption: option.text,
      });
    });
  }

  if (rows.length === 0) return;

  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
  } catch (err) {
    console.error('Sheet log failed:', err);
  }
}
