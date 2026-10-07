# Ghillie Ops

First-person shooter in three.js: a 2 km hilly green map, 100 bots, ghillie suits, modes Normal, Team and Conquer, multiplayer over PeerJS.

## Start

Requires Node 24 and Chrome on Windows.

1. Double-click `Start.bat`.
2. Chrome opens http://localhost:8790.

`server.js` has no dependencies. It serves the game, and serves models from `../Models/GhillieOps` if that folder exists, otherwise from `models/`.

## Project files

- `SPEC.md`: binding specification, quality bar and criteria.
- `ARCHITECTURE.md`: modules, contracts and QA workflow.
- `PROGRESS.md`: build status per stage.
- `CREDITS.txt`: external assets and their licenses.
- `tools/qa.mjs`: headless QA runner.
- `tools/blender/`: Blender scripts used to build the models.

## Status

Work in progress. The current stage is in `PROGRESS.md`.
