# RoomVote

A browser-based, real-time classroom voting app built for AME 494 Indie Game Studio at ASU. Jackbox-style: host runs a session on a projected room screen, students join on their phones with a room code or QR code, no app install and no student accounts.

**Live app:** https://roomvote-2026.web.app

## What it does

The host creates a room and runs a sequence of rounds. Three round types:

- **Submit** -- free-text entry with a timer
- **React** -- items shown one at a time, students react privately with ✓ / ! / ✗, results shown as a bar chart sorted by ✓ count
- **Vote** -- multiple choice, hidden results until the host reveals them

Per-round visibility toggles control whether player names and live results show on the room screen. All data -- names, responses, timestamps -- logs to a Google Sheet once per round regardless of what's visible on screen, so the sheet is always the full record.

Only the host authenticates (Google sign-in via Firebase Auth). Students join anonymously with just a name and room code.

## Author

Built by Laurie Annis for AME 494 Indie Game Studio, ASU Herberger Institute, The GAME School.
