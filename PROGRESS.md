# Ghillie Ops - PROGRESS

## Resume instructions

1. Read SPEC.md (criteria), ARCHITECTURE.md (modules), this file (status).
2. Continue at the first aspect whose status is not PASS.
3. Loop per aspect: builder subagent, then a fresh harsh critic subagent. On FAIL: a fresh fixer subagent gets the critic report verbatim, then a fresh critic (with the previous report) judges again. At most 6 FAIL rounds per aspect; remaining issues are carried to A12 and logged.
4. Subagents: Agent tool, subagent_type general-purpose, run_in_background false, exactly one at a time. The orchestrator writes no game code.
5. Critic reports are saved by the orchestrator to qa/<aspect>/round<k>/report.md.

## Environment (2026-09-30)

- Blender 5.2 LTS started by the orchestrator, MCP add-on on port 9876 connected.
- ComfyUI not running (start on demand, see SPEC section 7).
- Node v24.19.0, Chrome at C:\Program Files\Google\Chrome\Application\chrome.exe.

## Status

| Stage | Status |
|---|---|
| S1 Foundation (A1) | PASS (fix r1 done; orchestrator check 2026-10-01: selftest 32/32 x3, check OK; critic r2 skipped for budget) |
| S2 World (A4+A5+A6) | PASS r3 (2026-10-05) |
| S3 Player and weapons (A3+A7) | part A built 2026-10-06 (procedural weapons/arms, orchestrator rates ~3/10: blocky toy look, tube fingers) -> S3A-R after S2-R; part B after that |
| S2-R World realism | done 2026-10-07: real grass blades 7 GPU tiers to 3.2 km, scanned trees (Poly Haven CC0 + Objaverse CC-BY birch/bush), hemi-octahedral impostors for every tree, lighter sky; builder self-score 6.5-7 (target 8) |
| S2-R2 Map density, horizon, remaining realism | building (sonnet) |
| S4 Characters and bots (A2+A8) | pending |
| S5 Modes, menus, shop, HUD, save (A9) | pending |
| S6 Audio (A10) | pending |
| S7 Multiplayer (A11) | pending |
| S8 Performance, polish, final (A12) | pending |

Order and critic rules: SPEC section 10 build order and G-08..G-12. Subagents: sonnet, background, one at a time; orchestrator samples transcripts.

## Verdict log

- 2026-10-05 | S2 | round 3 | PASS | ISSUE-3 closed; MINOR 15, 16 carried | qa/S2/round3
- 2026-10-05 | S2 | round 2 | FAIL | only ISSUE-3a far-LOD tree impostors open; minors 12-14 | qa/S2/round2/report.md
- 2026-10-04 | S2 | round 1 | FAIL | blockers ISSUE-1..8 (neon grass, too flat, simple trees, box structures, water, tiling, sparse meadows, GPU p99 14.6 ms forest) | qa/S2/round1/report.md
- 2026-10-01 | A1 | fix round 1 completed (all 25 issues), third fixer interrupted while re-tuning shadows
- 2026-09-30 | A1 | round 1 | FAIL | blockers ISSUE-1..8 (loading progress, bloom sun fringe, 2-cascade shadows, GPU timing clocks, selftest rerun, QWERTZ keys, dead code, gltfpack node names) | qa/A1/round1/report.md

## Carried to S8

- S2 ISSUE-11: draw calls/atlasing (BatchedMesh, far cascade throttling), physical Sky vs HDRI, 2 m nav grid, LOD pop in motion
- S2 ISSUE-12: hill-top grass yellow-lime, forest shade blue-teal, red flag magenta, quarry walls smooth, navy zenith
- S2 ISSUE-15: far spruce impostors column/hat silhouette, LOD1-LOD2 brightness band ~135 m, near spruce backlit specular streaks
- S2 ISSUE-16: re-measure CPU p99 on idle PC (village borderline 9-11 ms)
- S2 gaps: village sparse vs AAA, quarry crusher/container/gravel look, flag cloth normals
