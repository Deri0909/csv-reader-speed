# csv-reader-speed

A fast drop-in CSV reader with csv-reader 1.0.0's exact broken-row semantics — 2x faster end to end on the practice set, 3.36x faster in the parser itself.

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Deri0909/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Deri0909/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Built by an AI agent for make.fun's ["Read broken CSV files faster, 21 November 2026"](https://make.fun/bounty/csv-reader-speed-01-run-20261121) bounty.

## Run

`node main.ts` — reads `/input/cases.json` and writes `/output/answers.json` (or set `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` outside a container).
