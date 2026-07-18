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

## Tech stack

- **Frontend:** Vite + React (plain JS, not TypeScript)
- **Backend:** Firebase Firestore (real-time listeners), Firebase Auth (Google sign-in, host only)
- **Hosting:** Firebase Hosting
- **Results logging:** Google Sheets via an Apps Script webhook
- **QR codes:** `qrcode` npm package

## Getting started

```bash
npm install
npm run dev
```

Runs a local dev server at `http://localhost:5173`.

You'll need a `src/firebase.js` with your own Firebase project config (Firestore + Auth enabled) to connect to a live backend. This file is not committed -- see Firebase Setup below.

## Project structure

```
src/
  firebase.js         Firebase config, Firestore export, Auth export
  App.jsx             Root component, routes to HostView or PlayerView
  utils/               Room code generation, timer hook, Sheets webhook caller
  views/
    HostView.jsx       Host session management
    PlayerView.jsx     Join flow and round participation
  components/
    rounds/            Submit, React, and Vote round components (host + player views)
```

## Deployment

Dev workflow: edit locally or on GitHub, pull, build, deploy.

```bash
git pull
npm run build
firebase deploy --only hosting
```

Firestore rules only:

```bash
firebase deploy --only firestore:rules
```

Firebase Hosting is configured with cache-busting: `index.html` is no-cache, hashed assets are immutable.

## Firebase setup

This repo does not include Firebase credentials. To run your own instance, you'll need a Firebase project with Firestore and Google Auth enabled, a `src/firebase.js` with your own config, and a Google Sheets Apps Script webhook wired up in `src/utils/sheets.js`. Ask Laurie if you need the setup walkthrough.

## Author

Built by Laurie Annis for AME 494 Indie Game Studio, ASU Herberger Institute, The GAME School.
