export default function Heatmap({ options, reactions }) {
  const sorted = [...options].sort((a, b) => {
    const aCheck = (reactions[a.id]?.counts?.['✓'] || 0);
    const bCheck = (reactions[b.id]?.counts?.['✓'] || 0);
    return bCheck - aCheck;
  });

  return (
    <div style={styles.container}>
      {sorted.map((option, i) => {
        const r = reactions[option.id]?.counts || { '✓': 0, '!': 0, '✗': 0 };
        const total = (r['✓'] || 0) + (r['!'] || 0) + (r['✗'] || 0);

        const checkPct = total > 0 ? (r['✓'] / total) * 100 : 0;
        const bangPct = total > 0 ? (r['!'] / total) * 100 : 0;
        const xPct = total > 0 ? (r['✗'] / total) * 100 : 0;

        return (
          <div key={option.id} style={styles.row}>
            <div style={styles.rank}>#{i + 1}</div>

            <div style={styles.content}>
              <div style={styles.optionText}>{option.text}</div>

              <div style={styles.barContainer}>
                {checkPct > 0 && (
                  <div style={{ ...styles.barSegment, width: `${checkPct}%`, background: '#4caf50' }}>
                    {checkPct > 8 && <span style={styles.barLabel}>✓ {r['✓']}</span>}
                  </div>
                )}
                {bangPct > 0 && (
                  <div style={{ ...styles.barSegment, width: `${bangPct}%`, background: '#ff9800' }}>
                    {bangPct > 8 && <span style={styles.barLabel}>! {r['!']}</span>}
                  </div>
                )}
                {xPct > 0 && (
                  <div style={{ ...styles.barSegment, width: `${xPct}%`, background: '#f44336' }}>
                    {xPct > 8 && <span style={styles.barLabel}>✗ {r['✗']}</span>}
                  </div>
                )}
                {total === 0 && (
                  <div style={{ ...styles.barSegment, width: '100%', background: '#333' }} />
                )}
              </div>

              <div style={styles.counts}>
                <span style={styles.countGreen}>✓ {r['✓'] || 0}</span>
                <span style={styles.countYellow}>! {r['!'] || 0}</span>
                <span style={styles.countRed}>✗ {r['✗'] || 0}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  rank: {
    color: '#888',
    minWidth: '2.5rem',
    paddingTop: '0.25rem',
    fontSize: '0.9rem',
  },
  content: {
    flex: 1,
  },
  optionText: {
    fontSize: '1rem',
    marginBottom: '0.5rem',
  },
  barContainer: {
    display: 'flex',
    height: '28px',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '0.35rem',
    background: '#333',
  },
  barSegment: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'width 0.6s ease',
    overflow: 'hidden',
  },
  barLabel: {
    fontSize: '0.75rem',
    color: '#fff',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  counts: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.8rem',
  },
  countGreen: { color: '#4caf50' },
  countYellow: { color: '#ff9800' },
  countRed: { color: '#f44336' },
};
