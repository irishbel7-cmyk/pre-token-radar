# Pre-Token Radar (make.fun token-radar-01)

A token launch radar for [make.fun's token-radar-01 bounty](https://make.fun). It reads a sealed
DefiLlama snapshot of the protocol universe, ranks every pre-token protocol by an implied value, and
writes a static dashboard that shows each protocol's model inputs and its farm plan.

## The model (`lib/model.ts`, radar-2)

    implied = clamp( round( tvl_usd x peer_multiple x growth_mult x age_mult ), 1, 1e12 )

- **peer_multiple** — the median market-cap-to-TVL ratio of the snapshot's own live-token protocols
  in the same category (at least 3 of them); a category with too few falls back to the snapshot-wide
  median. The market's own pricing of comparable protocols sets the base, not a constant and not a
  list of names.
- **growth_mult** — `1 + clamp(change_7d, -60, +120) / 100 x 0.5`, from the snapshot.
- **age_mult** — `0.75 + min(age_days, 1095) / 1095 x 0.5`: the longer a protocol has run with no
  token, the stronger the signal that one is still to come.

The board covers every protocol on the snapshot's watchlist (the floor, never a ceiling) and adds
160 pre-token protocols below the watchlist floor, by TVL — the early rows the radar exists to find.
Live-token protocols are kept apart and shown at the market's own values. Farm plans are derived
from each protocol's category, chains, TVL and age: seven steps with what they cost and how long
they take. No protocol name is special-cased anywhere.

## Run

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

Node 22, standard library only. Writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`.

## Check

    SNAPSHOT=<snapshot.json> node check-gate.mjs out

A local, non-official reading of the seven published gate rows; the kit ships no program/v1 scorer.

## Screenshots

Captured with Playwright Chromium (real Chromium 1254 with `--use-angle=swiftshader
--enable-unsafe-swiftshader`, i.e. software GL rendering on a headless GPU-less server, disclosed
per the bounty's rules). 1440x900 PNG, each under 256 KiB.
