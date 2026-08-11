# GemHaven v2.8 — Full Audit Report

**Confidential instant dig-to-earn on Base · Built for the Inco Summer Game Jam (Hidden Mechanics track)**

- **Report date:** 2026-08-11 (v2.8 update of the v2.7 report; v2.8 replaces the house-bankroll-pays-wins economy with a zero-house-risk escrow economy, making the entire v2.7 solvency machinery obsolete by construction)
- **Scope:** everything — game mechanics, privacy model, complete money flow, fees, smart-contract security, Inco Lightning integration, frontend, deployment operations
- **Live deployment:** Base Sepolia (chain 84532)
- **Demo:** https://frontend-roan-alpha-2ilf62ambt.vercel.app · **Repo:** https://github.com/xxcode66-source/gemhaven

| Contract | Address | BaseScan |
| --- | --- | --- |
| GemHaven | `0x2E63a620BeA515a56153Bf8D34888221c0A26b56` | [source](https://sepolia.basescan.org/address/0x2e63a620bea515a56153bf8d34888221c0a26b56#code) |
| ShardToken ($SHARD) | `0x14F388dE6D96D9594D5c91C9FEABD15664B110D6` | [source](https://sepolia.basescan.org/address/0x14f388de6d96d9594d5c91c9feabd15664b110d6#code) |

---

## 1. Executive summary

GemHaven is an instant, house-settled casino-style game in which **the player's choice never becomes observable by anyone** — not the chain, not the house, not even the contract owner. Each play ("Dig") is a single transaction: the player's pick is FHE-encrypted in the browser, the contract draws an encrypted random index (`randBounded`) **in the same transaction**, compares the two while they are still encrypted, and seals a single encrypted win/loss bit that only the player's wallet can decrypt. The chain ever learns, per play: the stake, the bet kind, and one public 1-bit (whether the draw hit the golden Deposit — the Bonanza trigger). Nothing else.

Beyond the privacy core, the project ships a complete house-economy layer (per-Dig escrow that makes house insolvency impossible, a rolling Bonanza jackpot fed by half of every miss, a protocol fee, house liquidity for future buyback/launch liquidity, fee-reserve management, clean redeploy/retirement lifecycle) and a polished Next.js frontend built on a single thin Inco SDK boundary.

**Verdict:** production-grade for a testnet jam entry. The privacy guarantee is enforced structurally (no code path can leak the pick). v2.8 rebuilds the economics around a single invariant — **a claim never touches more ETH than its own Dig escrowed** — which removes every v2.7-era solvency failure mode (payout caps, reservations, bankroll floors, funding) outright rather than patching them; the historical findings M-1/L-1/L-2 remain resolved (the gridSize guard and the bonanza griefing fix were carried into v2.8). Wins refund the full stake and mint $SHARD, so the house never pays ETH out of pocket. The remaining open item is test coverage (Foundry + Inco cheatcodes).

---

## 2. Project overview

### 2.1 Concept

One wall of 36 crystal **Deposits**. One hidden **Motherlode** per Dig. Players stake ETH ("Dig") on a Deposit (or a parity, or the whole wall); the stake is held in per-Dig escrow and the game settles instantly at claim time — a win refunds it all plus $SHARD, a miss splits it between the Bonanza pot, protocol fees, and house liquidity. No rounds, no waiting, no keeper — the cavern never closes.

### 2.2 Vocabulary (used consistently in contracts, UI, and docs)

| Generic term | GemHaven term |
| --- | --- |
| Grid cell / tile | **Deposit** |
| Stake / bet / play | **Dig** |
| Hidden random draw | **Motherlode** |
| Progressive jackpot | **Bonanza** |
| Reward token | **Shard** (`$SHARD`) |

### 2.3 Why Inco

The game's premise — *unobservable picks on a public chain* — is impossible with classical primitives (commit-reveal leaks via timing/front-running, oracles centralize trust). Inco Lightning FHE provides encrypted inputs, encrypted on-chain computation, encrypted randomness, and covalidated decryption attestations, which is exactly the four primitives the game needs. Integration follows the official games documentation pattern (Incasino/Mines), not the ConfidentialDeck kit, which is designed for card games.

---

## 3. System architecture

```
                    ┌────────────────────────────────────────────────────┐
                    │                     Browser                        │
                    │  Next.js 15 · wagmi/viem · framer-motion           │
                    │  lib/inco.ts  ← the ONLY Inco SDK boundary         │
                    │   • encryptDeposit(pick)      (lightning.encrypt)  │
                    │   • decryptOwnResult(handle)  (attestedDecrypt)    │
                    │   • revealPublicBit(handle)   (attestedReveal)     │
                    └───────┬──────────────────────────────┬─────────────┘
                            │ tx: bet(ct, kind)            │ attestations
                            ▼                              ▼
┌──────────────────────────────────────┐      ┌──────────────────────────┐
│  Base Sepolia (84532)                │◀────▶│  Inco Lightning network  │
│  GemHaven.sol   game + house ledger  │      │  covalidators:           │
│  ShardToken.sol $SHARD (minter-gated)│      │  • FHE compute fees      │
│                                      │      │  • randBounded draws     │
│  Deploy.s.sol / Retire.s.sol /       │      │  • sign reveal/decrypt   │
│  Recover.s.sol                       │      │    attestations          │
└──────────────────────────────────────┘      └──────────────────────────┘
```

### 3.1 Repository layout

```
contracts/
  src/GemHaven.sol        the game: bets, encrypted draws, claims, escrow, bonanza (494 lines)
  src/ShardToken.sol      $SHARD, dependency-free ERC20, mintable only by GemHaven (90 lines)
  src/interfaces/         IShardMintable
  script/                 Deploy.s.sol · Retire.s.sol · Recover.s.sol
  scripts/                compile.mjs + sync-abi.mjs (ABI pipeline without Foundry)
  foundry.toml            solc 0.8.29 · cancun · optimizer 200 runs

frontend/
  lib/inco.ts             the ONLY module that touches @inco/lightning-js (172 lines)
  lib/contracts.ts        addresses, chain config, ABI bindings, multiplier mirrors
  lib/hooks.ts            typed wagmi reads (useGameStats, usePlayerBets, useIncoFeeBudget…)
  lib/format.ts           formatting + custom-error → human message mapping
  components/             Navbar · ConnectMenu · CavernGrid · BetControls · GamePulse ·
                          RecentDigs · ShardBalance · BackgroundFX
  app/                    / hero · /about explainer · /mine the cavern · /history your Digs
```

### 3.2 Key dependencies and pins

| Dependency | Version | Why pinned |
| --- | --- | --- |
| `@inco/lightning-js` | 1.0.2 | Inco SDK |
| `viem` | **exactly 2.39.3** (+ `overrides`) | The SDK declares it as an exact dep; any other version nests a second copy and breaks `WalletClient` type unification at the `attestedDecrypt` call site |
| Next.js | 15.5.23 | — |
| Node (Vercel) | 22.x (`engines`) | Node 25+ breaks wagmi connectors during SSR (per Inco Mines docs) |

`wagmi/connectors` is deliberately never imported (its barrel drags in `@coinbase/cdp-sdk` → unpublished optional peers → broken builds); wallets are discovered via EIP-6963 only.

---

## 4. How the game works

### 4.1 A Dig's lifecycle (end to end)

1. **Choose** a kind — Pick (one Deposit), Even, Odd, or All (the whole wall) — and an amount (presets 0.001 → 1 ETH or custom).
2. **Seal** (browser): the chosen Deposit index is encrypted with `lightning.encrypt`, bound to the player's address **and** the GemHaven contract address. The plaintext never leaves the browser and cannot be replayed by anyone else. Even/Odd/All Digs still submit a sealed placeholder so every Dig looks byte-identical on chain.
3. **Dig** (one transaction): `bet(ciphertext, kind)` with `msg.value = stake + incoFeeBudget` (0.000003 ETH at current fees). Inside the same transaction the contract:
   - escrows the full stake (`escrow += stake` — nothing is cut yet),
   - reconstructs the encrypted pick (`newEuint256`, grants the player persistent decrypt rights, itself transient rights via `allowThis()`),
   - draws the encrypted Motherlode: `randBounded(36)`,
   - computes the encrypted win bit per kind (see 4.2), `allow()`-ed to the player **only**,
   - computes and `reveal()`s the one public bit: `motherlode == BONANZA_INDEX (7)`,
   - stores the Bet (win + bonanza handles; **the pick handle is dropped, never stored**), emits `Dug(betId, player, stake, kind)`.
4. **Decrypt** (browser, one wallet signature): `attestedDecrypt` on the result handle — served only to the address on the handle's ACL.
5. **Claim** (one transaction): `claim(betId, won, signatures)` — the covalidator signatures are verified on chain (`verifyDecryption`); the Dig's stake leaves escrow. A **win** refunds the full stake to the player and mints `stake × multiplier` $SHARD (All mints zero). A **miss** splits the stake 50% → Bonanza pot / 1% → protocol fees / 49% → house liquidity and mints a 0.5× consolation $SHARD. Both outcomes are worth claiming, so the UI offers a claim button for either.
6. **Bonanza check** (no wallet needed): `attestedReveal` on the bonanza handle; if the bit is true, `claimBonanza` (permissionless) releases the **entire pot** to that Dig's player and resets it.
7. Claims **never expire** — any unclaimed Dig can be reopened from `/history` at any time.

Auto mode repeats steps 2–6 with a 1.5 s pause, re-validating everything each iteration and stopping cleanly on any error.

### 4.2 Bet kinds, odds, and edge

| Kind | Wins when | $SHARD minted on win | Fair odds (36 tiles) | Edge |
| --- | --- | --- | --- | --- |
| **Pick** | draw == picked Deposit | 34.92× stake | 1/36 (36×) | ~3% |
| **Even** | drawn tile number is even | 1.94× stake | 18/36 (2×) | ~3% |
| **Odd** | drawn tile number is odd | 1.94× stake | 18/36 (2×) | ~3% |
| **All** | always (exactly one tile hits) | **0** — stake back only | certain | n/a |

Implementation detail: the draw is a 0-based index while the wall numbers tiles 1–36, so `Even` wins on `motherlode % 2 == 1` and `Odd` on `motherlode % 2 == 0` — the mapping is intentional and commented. `All` computes `pick.eq(pick)` (encrypted `true`) so the claim path stays uniform across all kinds.

Multipliers are basis points on chain: `STRAIGHT_MULT_BPS = 3492`, `EVEN_ODD_MULT_BPS = 194`, denominator 100 — but in v2.8 they multiply **$SHARD minted, not ETH paid** (`shardWinOf = stake × mult × SHARD_SCALE / 100`, `SHARD_SCALE = 1000`). `All` always wins, so a proportional SHARD there would be riskless supply farming — it refunds the stake and mints nothing. The frontend mirrors `shardWinOf`/`shardLossOf` locally for previews only; the mint itself always happens on chain.

**Hedge economics still hold:** an Even+Odd hedge on equal stakes `s` always wins one and loses one — it spends `2s` ETH, gets `s` back, and mints `1.94s + 0.5s = 2.44s` SHARD, so farming SHARD costs a fixed `s` ETH per `2.44s` SHARD (~0.41 ETH per stake-scale unit). SHARD is bought with real losses at a known rate; no combination of kinds produces riskless supply.

### 4.3 $SHARD rewards

Every claim mints $SHARD proportionally and increments `totalMined[player]` — a non-transferable lifetime "mining score" that can only grow by playing (designed to weight a future token allocation by real play, not bought balances; no conversion is defined or promised):

| Event | Mint |
| --- | --- |
| Pick win | `stake × 34.92` SHARD |
| Even/Odd win | `stake × 1.94` SHARD |
| All win | 0 (anti-farming) |
| Any miss | `stake × 0.5` SHARD consolation |

With `SHARD_SCALE = 1000`, a 0.001 ETH Pick win mints 34.92 SHARD; the same Dig missed mints 0.5 SHARD. The consolation keeps losing play worth claiming and keeps the score honest (it counts ETH actually risked, both ways).

ShardToken is a dependency-free minimal ERC20: `setMinter` is one-shot and zeroes the deployer's owner slot — after wiring, **no admin surface exists** on the token at all.

---

## 5. The privacy model (the jam entry's core)

### 5.1 What the chain ever learns per Dig

1. The **stake** and the **bet kind** — public, like any wager.
2. **One public bit**: whether the draw hit the golden Deposit (Bonanza trigger) — revealed by design.
3. The **win/loss bit — but only to the wallet that made the Dig** (`won.allow(msg.sender)`; decryption additionally requires that address's live signature via `attestedDecrypt`).

### 5.2 What nobody ever learns: the pick

Enforced structurally, not by convention:

- The pick handle is never `reveal()`-ed and never `allow()`-ed to anyone but the player.
- **The pick is not stored at all.** The `Bet` struct has no field for it; it is used inside `bet()` and dropped. `getBet` returns a `BetView` carrying only the result and bonanza handles — the frontend physically cannot surface a pick because the ABI carries none.
- The `Dug` event carries stake + kind — never the pick.
- Even/Odd/All Digs submit a sealed placeholder pick, so every Dig is shape-identical on chain (no kind is distinguishable by ciphertext absence).
- The frontend SDK boundary (`lib/inco.ts`) intentionally exposes **no function that could decrypt a pick** — only the win bit and the public bonanza bit.

This is stricter than the Inco reference games (Incasino/Mines expose more plaintext state). The privacy story survives owner compromise: there is no admin path to the pick or to other players' win bits.

### 5.3 Honest residual disclosures

- The bonanza bit is public; a winning pick that also triggers the Bonanza associates the pot with that Dig's (public) player address.
- Stakes and kinds are public metadata (unavoidable for any wager).

---

## 6. Money flow — the complete picture

### 6.1 Pools (all tracked as explicit ledgers, not inferred from balance)

| Pool | Variable | Funded by | Paid out via |
| --- | --- | --- | --- |
| **Open escrow** | `escrow` | every Dig's full stake at bet time | the Dig's own claim (refund on win) |
| **Bonanza pot** | `bonanzaPot` | 50% of every **missed** stake | `claimBonanza` on a golden-deposit hit (whole pot, resets to 0) |
| **House liquidity** | `bankroll` | 49% of every missed stake | `withdrawBankroll(to)` (owner) — future $SHARD buyback / launch liquidity |
| **Protocol fees** | `protocolFees` | 1% of every missed stake | `withdrawFees(to)` (owner) |
| **Inco fee reserve** | untracked; part of ETH balance | deploy seed (`INCO_FEE_RESERVE_WEI`), plain transfers (`receive()`), budget surplus | Inco network collects compute fees; surplus via `withdrawSurplus(to)` |

### 6.2 Where a player's ETH goes per Dig

A Dig sends `msg.value = stake + feeBudget`:

```
At bet time:
stake ──── 100% → escrow              (untouched until the Dig is claimed)

At claim time:
  win ──── 100% → back to the player  (+ stake × mult $SHARD minted)
  miss ─┬─ 50%  → bonanzaPot
        ├─ 1%   → protocolFees        (certain house revenue, on misses)
        └─ 49%  → bankroll            (house liquidity for buyback/launch)

feeBudget = inco.getFee() × 3 = 0.000003 ETH (at 0.000001/unit)
       └─── stays in the contract balance; Inco draws its fees from it.
            Only 2 ops are actually charged (newEuint256 + randBounded),
            the 3rd unit is headroom. Surplus accumulates → withdrawSurplus.
```

Staked ETH is never spent on compute, and compute is never paid from stake — the separation is enforced by the `msg.value > incoFeeBudget(kind)` gate in `bet()`.

### 6.3 What players can win

| Outcome | Player receives |
| --- | --- |
| Pick win | full stake back + `stake × 34.92` $SHARD |
| Even/Odd win | full stake back + `stake × 1.94` $SHARD |
| All | full stake back (guaranteed, every Dig) — mints 0 $SHARD |
| Bonanza hit (any kind, 1/36 per Dig) | the **entire** `bonanzaPot`, independent of the win/loss bit |
| Loss | the 0.5× consolation $SHARD; the stake splits 50/1/49 into pot/fees/house liquidity |

### 6.4 Worked examples (current live parameters)

**Pick, 0.001 ETH, win:** sends 0.001003. Claim refunds **0.001 ETH + 34.92 $SHARD**. Net player ETH result: 0 (− gas), plus the SHARD mined. The pick and the win bit stay sealed to everyone else.

**Pick, 0.001 ETH, loss:** claim splits the escrowed 0.001 → 0.0005 pot / 0.00001 fees / 0.00049 house liquidity, and mints **0.5 $SHARD** consolation. The pick stays encrypted on chain forever.

**Even, 0.001 ETH, win:** refunds 0.001 and mints **1.94 $SHARD**.

**All, 0.001 per tile (0.036 total), always wins:** refunds 0.036, mints 0 SHARD — a free private roll on the bonanza bit (1/36 per Dig), which is the intended design: All exists as a privacy-pure play, not a mining route.

**Bonanza:** each miss feeds the pot half its stake; a draw hitting index 7 (p = 1/36) releases the whole pot to that Dig's player. Funded purely by play — no sponsor money.

### 6.5 House revenue, precisely

Two distinct revenue streams, both on chain and both public:

1. **Protocol fee — certain on every miss.** 1% of every missed stake → `withdrawFees(to)`.
2. **House liquidity — statistical.** 49% of every missed stake accrues in `bankroll`, withdrawable via `withdrawBankroll(to)`. Intended use: $SHARD buyback and token-launch liquidity — hence it is labelled "house liquidity" in the UI, not "bankroll".

Wins cost the house **zero ETH** — a win only unlocks the Dig's own escrowed stake and mints $SHARD, whose value story (future launch allocation) is an off-chain commitment. The ~3% edge lives in the SHARD multipliers relative to fair odds; the pot recycles 50% of misses back to players.

### 6.6 Solvency: impossible to violate, by construction (v2.8)

```
bet()   escrow += stake                         (full stake locked per Dig)
claim() escrow −= b.stake                       BEFORE any transfer
        win  → refund exactly b.stake from the released escrow
        miss → split b.stake across pot/fees/bankroll ledgers
```

- The maximum ETH a claim can ever move is the stake its own Dig escrowed. The house cannot owe more than it already holds — there is no cap to tune, no reservation to track, and no stake size that can break this. This makes the entire v2.7 solvency machinery (`maxPayout`, `maxStake`, `reservedPayouts`, `bankrollFloor`, `payoutCapBps`, `skimProfit`, `fundBankroll`) unnecessary, and v2.8 deletes it.
- Consequence for players: **no maximum stake and no revert for lack of funds, ever.** The UI no longer needs to mirror any cap.
- Consequence for the house: revenue is loss-side only (fees + liquidity), and the operator decides when to withdraw it (`withdrawFees`, `withdrawBankroll`).

### 6.7 Funding, retirement, and invariants

- **No bankroll funding needed.** The constructor is non-payable; claims are escrow-funded. Plain transfers hit `receive()` → **fee reserve** — deliberate, so accidental top-ups can never create payout obligations.
- **`surplusETH()` invariant:** `balance − (escrow + bonanzaPot + protocolFees + bankroll + getFee()×64)` — `withdrawSurplus` can only ever take what sits above everything owed to players plus a 64-unit fee floor for in-flight Digs.
- **Retirement:** `shutdownTo(to)` moves the ENTIRE balance (deliberately bypasses protections — it exists so superseded deployments don't strand house funds; it has no sensible use on a live instance). `Retire.s.sol` + `Recover.s.sol` automate the retire→redeploy loop. v2.1 carries 0.052 ETH permanently locked (retired before the shutdown path existed) — an accepted legacy cost.

---

## 7. Inco Lightning integration audit

### 7.1 Primitive coverage (verified against docs.inco.org/games + fees docs)

| Primitive | Where | Fee |
| --- | --- | --- |
| `newEuint256(ct, user)` | sealed pick, ACL: player persistent / dapp transient | **1 unit** |
| `randBounded(36)` | the Motherlode draw, same tx as the Dig | **1 unit** |
| `eq`, `rem` | encrypted comparisons (win bit, parity, bonanza) | free |
| `reveal` | the one public bonanza bit | free |
| `allow` / `allowThis` | ACL management (player-only win bit; persistence for stored handles) | free |
| `verifyDecryption` | on-chain attestation check in `claim`/`claimBonanza` | free |
| `inco.getFee()` | dynamic fee pricing, read live per Dig | — |
| SDK `encrypt` | client-side pick encryption bound to player+contract | — |
| SDK `attestedDecrypt` | signed, player-only win bit retrieval | — |
| SDK `attestedReveal` | unsigned, public bonanza bit retrieval | — |

**Fee budget:** `INCO_FEE_UNITS = 3` (2 fee-bearing ops + 1 headroom), uniform across all bet kinds — rightsized in v2.5 from 5/6, cutting per-Dig Inco cost ~40–50%.

### 7.2 Correctness highlights

- **Same-tx draw:** the Motherlode is drawn inside `bet()` — nobody (including the digger) can observe it and react.
- **Transient-access discipline:** every handle persisted to storage calls `allowThis()` in the same transaction (required by Inco's access model).
- **Two attestation paths, used correctly and kept separate** in the SDK boundary — exactly the Mines pattern.
- **Fee-reserve + floor management** (`receive()` → reserve; `withdrawSurplus` with a 64-unit floor) matches best-practices guidance.
- The ConfidentialDeck kit was assessed and correctly **not** used — it targets card games; this is a casino-style game following the Incasino/Mines pattern.

---

## 8. Smart-contract security audit

**Method:** line-by-line review of `GemHaven.sol` (494 lines) and `ShardToken.sol` (90 lines) at v2.8 (original review at v2.5, re-verified at v2.7 and v2.8), plus state-flow, reentrancy, and economic analysis. No automated tooling (hackathon scope); findings below are manual review results.

### 8.1 Strengths

| # | Item |
| --- | --- |
| S1 | **CEI everywhere** — `claimed`/`bonanzaPaid`/ledgers are updated before every external ETH transfer; no reentrancy path |
| S2 | **Attestation-gated claims** — refunds require `verifyDecryption` with covalidator signatures; win bits cannot be forged, and ACLs make them unobtainable by non-owners |
| S3 | **Escrow-bounded claims** — every claim moves at most its own Dig's escrowed stake; `surplusETH()` can never classify player-owed ETH as withdrawable. House insolvency is unrepresentable |
| S4 | **Ledger-separated house money** — `bankroll`/`protocolFees` only ever grow from miss splits; `withdrawBankroll`/`withdrawFees` can only take their own ledger |
| S5 | **Structural privacy** — the pick is never stored, revealed, or surfaced (see §5.2) |
| S6 | **Token has no admin surface post-wiring** — one-shot minter, owner zeroed |
| S7 | No `selfdestruct`, no `delegatecall`, no proxy, no external oracles besides Inco itself |
| S8 | Custom errors + events for every money movement; full operational transparency on chain |

### 8.2 Findings

| ID | Severity | Title | Status |
| --- | --- | --- | --- |
| M-1 | **Medium** | Concurrent winners can revert claims under a thin bankroll at 100% exposure cap | **obsolete in v2.8** — wins no longer draw from any shared pool; each claim refunds only its own escrow, so the failure mode is structurally impossible |
| L-1 | **Low** | Missing `gridSize > BONANZA_INDEX` constructor guard | **resolved in v2.7**, guard carried into v2.8 |
| L-2 | **Low** | `claimBonanza(false)` burned `bonanzaPaid`, letting a griefer orphan a real pot | **resolved in v2.7**, fix carried into v2.8 — `false` attestations are stateless; only a real hit marks the Dig paid |
| I-1 | Info | No pause/emergency-stop besides `shutdownTo` | accepted (jam scope) |
| I-2 | Info | `_playerBets` unbounded array (view gas at scale) | accepted |
| I-3 | Info | Single-step owner transfer, no timelock/multisig | accepted for testnet |
| N-1 | Note | Pick range (0..35) cannot be validated without breaking privacy — an out-of-range pick only harms its owner | by design |

**M-1 detail (obsolete).** At v2.5–v2.7, wins were paid from a shared bankroll, so concurrent winners could jointly exceed it; v2.7 reserved payouts at bet time. v2.8 removes the shared liability entirely: a winning claim refunds exactly the stake its own Dig escrowed, so claims are funded by construction regardless of any other Dig in flight.

**L-1 detail (resolved).** The v2.5 constructor allowed `gridSize ≥ 2`; a grid ≤ 7 would have made `BONANZA_INDEX` unreachable, accruing the pot forever with no withdrawal path. v2.7 requires `gridSize > BONANZA_INDEX`.

**L-2 detail (resolved).** The bonanza bit is publicly revealed, so anyone can decrypt it. At v2.5, `claimBonanza(false)` still set `bonanzaPaid = true`, so a griefer could front-run the rightful player with a `false` attestation and orphan the pot. In v2.7 a `false` attestation verifies and returns statelessly; only a genuine hit marks the Dig as paid and releases the pot.

### 8.3 Attack-surface summary

- **Steal player funds?** No path: refunds and pot payouts are attestation-gated and escrow-bounded; admin withdrawals are ledger-bounded (`withdrawBankroll`/`withdrawFees` take only their own counter; `withdrawSurplus` stops at everything owed).
- **Forge wins?** No: covalidator signatures are verified on chain.
- **Learn other players' picks?** No path exists in the contract, the SDK boundary, or the ABI.
- **Owner rug?** Only the documented retirement path (`shutdownTo`) — an explicit, event-emitting design decision for redeploy lifecycle, not a hidden backdoor. House revenue withdrawals can never touch escrow, the pot, or accrued fees.

---

## 9. Frontend audit

| Area | Assessment |
| --- | --- |
| **SDK boundary** | Single module (`lib/inco.ts`); components can't touch the SDK directly; no pick-decryption capability exists anywhere in the app ✅ |
| **Economics UX** | No cap to mirror anymore: previews show the exact refund + SHARD mint for a win and the consolation mint for a miss, computed with the same formulas the contract uses (`previewShardWin`/`previewShardLoss`) ✅ |
| **Fee transparency** | Amount hint states the exact fee budget, the win/miss outcomes ("stake back + $SHARD" / "50% pot"), and the minimum ✅ |
| **Error handling** | Contract custom errors mapped to human messages; bonanza check failures never break the Dig flow; failed Lightning handshakes aren't cached ✅ |
| **Type safety** | `tsc --noEmit` strict + `noUncheckedIndexedAccess`, zero errors; ABIs generated as `as const` TS (full wagmi inference, no casts) ✅ |
| **Dependency risk** | viem exact-pin + `overrides` invariant documented and verifiable; no `wagmi/connectors` barrel ✅ |
| **Accessibility** | Wall is a labelled `radiogroup`; state never conveyed by colour alone; `prefers-reduced-motion` zeroes all animation ✅ |
| **Build hygiene** | System font stacks only (offline builds); Node pinned 22.x on Vercel ✅ |
| **Minor** | Public RPC fallback (`sepolia.base.org`) used in production — rate-limit risk under load; optional custom RPC env var supported but unset on Vercel |

---

## 10. Deployment operations

| Layer | State |
| --- | --- |
| **Contracts** | v2.8 live on Base Sepolia; both contracts **verified on BaseScan** (source, constructor args, read/write tabs) |
| **Version lineage** | v1 (round-based) → v2.0 (Megapot route, removed) → v2.1–v2.4 (revenue layer, fundBankroll) → v2.5 (fee rightsizing) → v2.6 → v2.7 (game-logic audit: solvency-by-reservation, gridSize guard, bonanza griefing fix) → **v2.8 (economics rebuild: escrow-until-claim, zero house ETH risk, stake-refund + proportional $SHARD wins, 50/1/49 miss split)**; superseded instances retired via `shutdownTo` except v2.5, which intentionally stays live for its unclaimed Digs — all listed in the README |
| **Frontend hosting** | Vercel production, Node 22, NEXT_PUBLIC contract addresses baked per deploy; browser-verified after each deploy (live chain reads, fee hint, zero console errors) |
| **CI** | GitHub → Vercel auto-deploy on push to `main` (Git integration live) |
| **Repo hygiene** | No secrets committed (`.env`/`.env.local` gitignored, templates provided); MIT LICENSE present; README accurate as of v2.8 |
| **Deployer wallet** | Fresh dedicated key, funded minimally; used only via local Foundry scripts |

---

## 11. Known limitations & deliberate simplifications

- **House take is real and stated** — revenue is loss-side only (1% protocol fee + 49% house liquidity on every miss), and the SHARD multipliers embed ~3% against fair odds. The differentiator is untraceable play, not better odds.
- **Wins are ETH-neutral by design.** A win refunds the stake and mints $SHARD; the player's upside is the SHARD's future token-launch allocation, an off-chain commitment rather than an on-chain redemption.
- **No solvency cap, no max stake** — claims are escrow-funded, so the contract can never owe more than it holds. There is nothing to tune and nothing to break.
- **$SHARD has no utility yet** beyond the mining score; the "future allocation" story is roadmap copy, not a promise.
- **Auto mode is a frontend loop** — re-signs every tx; no session keys.
- **Unaudited hackathon code** — Base Sepolia is the intended arena; mainnet would additionally need `Ownable2Step`/multisig/timelock and a professional audit. (The L-1 constructor guard shipped in v2.7 and carried forward.)
- **No indexer/leaderboard** — all reads come straight from the contract; no global feed of other players' data exists by design.
- **No automated tests yet** — see open items.

---

## 12. Open items & recommendations

| Priority | Item |
| --- | --- |
| 1 | **Foundry test suite** with Inco cheatcodes covering: bet/claim happy paths (all 4 kinds), attestation rejection, escrow/refund/split accounting, consolation mints, bonanza lifecycle |
| 2 | **Play a full Dig end-to-end through the UI** with a funded wallet (live proof for reviewers; flips the README "deployment is fresh" note) |
| 3 | Claim the five unclaimed legacy Digs on the retired-but-live v2.5 deployment (the UI supports a temporary env switch) |
| 4 | Optional: set a custom Base Sepolia RPC on Vercel (`NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`) |
| 5 | ~~Optional: constructor guard `gridSize > BONANZA_INDEX`~~ — shipped in v2.7, carried into v2.8 |
| 6 | Mainnet-only backlog: Ownable2Step + multisig, professional audit (the v2.7 claim-queueing backlog is obsolete — v2.8 escrow makes claims funded by construction) |

---

## 13. Questions for the Inco team

1. Are there uniformity/bias guarantees for `randBounded`, and what fee headroom do you recommend above the fee-bearing ops?
2. What testing setup do you recommend with the Inco cheatcodes for `verifyDecryption` flows — any example repo?
3. Attestation UX: auto-claiming right after each Dig (our approach) vs manual — is there an official best practice?
4. For the Hidden Mechanics track, is a custom integration like this on-target, or are there additional kits/primitives you'd expect to see?
5. Anything in the fee model (2 charged ops + 1 headroom unit per play) you'd flag before judging?

---

## 14. Appendix

### 14.1 Contract constants

| Constant | Value | Meaning |
| --- | --- | --- |
| `STRAIGHT_MULT_BPS` | 3492 | Pick SHARD multiplier ×100 |
| `EVEN_ODD_MULT_BPS` | 194 | Even/Odd SHARD multiplier ×100 |
| `SHARD_SCALE` | 1000 | SHARD per ETH at 1× multiplier (0.001 ETH win → 34.92 SHARD) |
| `CONSOLATION_BPS` | 5000 | 0.5× SHARD consolation on a miss |
| `BONANZA_LOSS_BPS` / `PROTOCOL_FEE_BPS` | 5000 / 100 | 50% pot cut / 1% protocol fee of a missed stake |
| `BONANZA_INDEX` | 7 | golden Deposit (tile 8 in UI) |
| `MAX_GRID_SIZE` | 64 | grid ceiling |
| `INCO_FEE_UNITS` | 3 | fee budget per Dig |
| `INCO_FEE_FLOOR_UNITS` | 64 | fee floor kept by `withdrawSurplus` |
| `gridSize` / `minStake` (immutable) | 36 / 0.001 ETH | live deployment |

### 14.2 Live deployment (v2.8, 2026-08-11)

| Parameter | Value |
| --- | --- |
| GemHaven | `0x2E63a620BeA515a56153Bf8D34888221c0A26b56` (v2.8) |
| ShardToken | `0x14F388dE6D96D9594D5c91C9FEABD15664B110D6` (v2.8) |
| Chain | Base Sepolia, 84532 |
| Genesis counters | escrow / bonanzaPot / bankroll / protocolFees = 0 (no seed — escrow self-funds) |
| Fee reserve seed | 0.0005 ETH |
| Inco fee budget | 3 × `getFee()` = 0.000003 ETH per Dig |
| Demo URL | https://frontend-roan-alpha-2ilf62ambt.vercel.app |
| Repo | https://github.com/xxcode66-source/gemhaven |

### 14.3 Event inventory (operational transparency)

`Dug` · `Claimed` · `BonanzaClaimed` · `FeeReserveFunded` · `BankrollWithdrawn` · `SurplusWithdrawn` · `FeesWithdrawn` · `Shutdown` · `OwnerUpdated` — every movement of value or policy emits; nothing happens silently.

---

*Report updated 2026-08-11 for v2.8 (economics rebuild: escrow-until-claim, zero house ETH risk, stake-refund wins with proportional $SHARD, 50/1/49 miss split — the v2.7 solvency machinery is deleted outright). Original report generated 2026-08-10 from a full review of the v2.5 codebase (`contracts/src`, `contracts/script`, `frontend/lib`, `frontend/components`), live chain reads against the Base Sepolia deployment, and the Inco games documentation. MIT License.*
