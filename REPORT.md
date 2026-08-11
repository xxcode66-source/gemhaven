# GemHaven v2.7 — Full Audit Report

**Confidential instant dig-to-earn on Base · Built for the Inco Summer Game Jam (Hidden Mechanics track)**

- **Report date:** 2026-08-11 (v2.7 update of the 2026-08-10 v2.5 report; the game-logic audit section was re-run against v2.7 and its findings M-1/L-1/L-2 below are all resolved)
- **Scope:** everything — game mechanics, privacy model, complete money flow, fees, smart-contract security, Inco Lightning integration, frontend, deployment operations
- **Live deployment:** Base Sepolia (chain 84532)
- **Demo:** https://frontend-xxcode.vercel.app · **Repo:** https://github.com/xxcode66-source/gemhaven

| Contract | Address | BaseScan |
| --- | --- | --- |
| GemHaven | `0xe7eb298AfEE79F40f35CEfdCFcccBCBcC2754411` | [source](https://sepolia.basescan.org/address/0xe7eb298afee79f40f35cefdcfcccbcbcc2754411#code) |
| ShardToken ($SHARD) | `0xeA97A1748360412e2E9D3d900D1Fe2a614E1D2a8` | [source](https://sepolia.basescan.org/address/0xea97a1748360412e2e9d3d900d1fe2a614e1d2a8#code) |

---

## 1. Executive summary

GemHaven is an instant, house-settled casino-style game in which **the player's choice never becomes observable by anyone** — not the chain, not the house, not even the contract owner. Each play ("Dig") is a single transaction: the player's pick is FHE-encrypted in the browser, the contract draws an encrypted random index (`randBounded`) **in the same transaction**, compares the two while they are still encrypted, and seals a single encrypted win/loss bit that only the player's wallet can decrypt. The chain ever learns, per play: the stake, the bet kind, and one public 1-bit (whether the draw hit the golden Deposit — the Bonanza trigger). Nothing else.

Beyond the privacy core, the project ships a complete house-economy layer (bankroll solvency machinery, rolling jackpot, protocol fee, profit skimming with a protected capital floor, fee-reserve management, clean redeploy/retirement lifecycle) and a polished Next.js frontend built on a single thin Inco SDK boundary.

**Verdict:** production-grade for a testnet jam entry. The privacy guarantee is enforced structurally (no code path can leak the pick). The v2.7 game-logic audit re-verified the economics (uniform ~3% edge across all kinds, hedge-proof by construction — no combination of Pick/Even/Odd/All can raise expected return) and shipped fixes for all money findings: M-1 (concurrent-winner claim reverts) is resolved by **solvency-by-reservation** in `reservedPayouts`; L-1 (gridSize guard) and L-2 (bonanza flag griefing) are fixed. The remaining open item is test coverage (Foundry + Inco cheatcodes); lowering `payoutCapBps` is an optional mainnet-hardening decision.

---

## 2. Project overview

### 2.1 Concept

One wall of 36 crystal **Deposits**. One hidden **Motherlode** per Dig. Players stake ETH ("Dig") on a Deposit (or a parity, or the whole wall); the game settles instantly against a house bankroll. No rounds, no waiting, no keeper — the cavern never closes.

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
│  FundBankroll.s.sol / Recover.s.sol  │      │    attestations          │
└──────────────────────────────────────┘      └──────────────────────────┘
```

### 3.1 Repository layout

```
contracts/
  src/GemHaven.sol        the game: bets, encrypted draws, claims, bankroll, bonanza (517 lines)
  src/ShardToken.sol      $SHARD, dependency-free ERC20, mintable only by GemHaven (90 lines)
  src/interfaces/         IShardMintable
  script/                 Deploy.s.sol · Retire.s.sol · FundBankroll.s.sol · Recover.s.sol
  scripts/                compile.mjs + sync-abi.mjs (ABI pipeline without Foundry)
  foundry.toml            solc 0.8.29 · cancun · optimizer 200 runs

frontend/
  lib/inco.ts             the ONLY module that touches @inco/lightning-js (173 lines)
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
   - splits the stake (1% Bonanza / 1% protocol fee / 98% bankroll),
   - reconstructs the encrypted pick (`newEuint256`, grants the player persistent decrypt rights, itself transient rights via `allowThis()`),
   - draws the encrypted Motherlode: `randBounded(36)`,
   - computes the encrypted win bit per kind (see 4.2), `allow()`-ed to the player **only**,
   - computes and `reveal()`s the one public bit: `motherlode == BONANZA_INDEX (7)`,
   - stores the Bet (win + bonanza handles; **the pick handle is dropped, never stored**), emits `Dug(betId, player, stake, kind)`.
4. **Decrypt** (browser, one wallet signature): `attestedDecrypt` on the result handle — served only to the address on the handle's ACL.
5. **Claim** (one transaction if won): `claim(betId, won, signatures)` — the covalidator signatures are verified on chain (`verifyDecryption`); a win pays `payoutOf(stake, kind)` from the bankroll and, for Pick, mints 10 `$SHARD`. Losing claims just mark the Dig settled (optional — the UI offers "Mark settled").
6. **Bonanza check** (no wallet needed): `attestedReveal` on the bonanza handle; if the bit is true, `claimBonanza` (permissionless) releases the **entire pot** to that Dig's player and resets it.
7. Claims **never expire** — any unclaimed Dig can be reopened from `/history` at any time.

Auto mode repeats steps 2–6 with a 1.5 s pause, re-validating everything each iteration and stopping cleanly on any error.

### 4.2 Bet kinds, odds, and edge

| Kind | Wins when | Multiplier | Fair odds (36 tiles) | Edge |
| --- | --- | --- | --- | --- |
| **Pick** | draw == picked Deposit | 34.92× | 1/36 (36×) | ~3% |
| **Even** | drawn tile number is even | 1.94× | 18/36 (2×) | ~3% |
| **Odd** | drawn tile number is odd | 1.94× | 18/36 (2×) | ~3% |
| **All** | always (exactly one tile hits) | 34.92× the per-tile amount ≈ 0.97× of total outlay | certain | ~3% |

Implementation detail: the draw is a 0-based index while the wall numbers tiles 1–36, so `Even` wins on `motherlode % 2 == 1` and `Odd` on `motherlode % 2 == 0` — the mapping is intentional and commented. `All` computes `pick.eq(pick)` (encrypted `true`) so the claim path stays uniform across all kinds.

Multipliers are basis points on chain: `STRAIGHT_MULT_BPS = 3492`, `EVEN_ODD_MULT_BPS = 194`, denominator 100. The frontend mirrors `payoutOf` locally for previews only; the split itself always happens on chain.

### 4.3 $SHARD rewards

Winning **Pick** claims mint a flat `REWARD_PER_WIN = 10 $SHARD` to the player and increment `totalMined[player]` — a non-transferable lifetime "mining score" that can only grow by playing (designed to weight a future token allocation by real play, not bought balances; no conversion is defined or promised). Even/Odd/All mint nothing, so auto-mode grinding cannot inflate the supply.

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
| **Bankroll** | `bankroll` | deploy seed, `fundBankroll()`, 98% of every stake, net losing play | winning claims |
| **Bonanza pot** | `bonanzaPot` | 1% of every stake | `claimBonanza` on a golden-deposit hit (whole pot, resets to 0) |
| **Protocol fees** | `protocolFees` | 1% of every stake | `withdrawFees(to)` (owner) |
| **Inco fee reserve** | untracked; part of ETH balance | deploy seed (`INCO_FEE_RESERVE_WEI`), plain transfers (`receive()`), budget surplus | Inco network collects compute fees; surplus via `withdrawSurplus(to)` |

### 6.2 Where a player's ETH goes per Dig

A Dig sends `msg.value = stake + feeBudget`:

```
stake ─┬─ 1%  → bonanzaPot
       ├─ 1%  → protocolFees        (certain house revenue)
       └─ 98% → bankroll            (pays all wins)

feeBudget = inco.getFee() × 3 = 0.000003 ETH (at 0.000001/unit)
       └─── stays in the contract balance; Inco draws its fees from it.
            Only 2 ops are actually charged (newEuint256 + randBounded),
            the 3rd unit is headroom. Surplus accumulates → withdrawSurplus.
```

Staked ETH is never spent on compute, and compute is never paid from stake — the separation is enforced by the split in `bet()`.

### 6.3 What players can win

| Outcome | Player receives |
| --- | --- |
| Pick win | `stake × 34.92` from bankroll + 10 $SHARD |
| Even/Odd win | `stake × 1.94` from bankroll |
| All | `perTileAmount × 34.92` ≈ 0.97× of total outlay (guaranteed, every Dig) |
| Bonanza hit (any kind, 1/36 per Dig) | the **entire** `bonanzaPot`, independent of the win/loss bit |
| Loss | nothing; the 98% bankroll share of the stake funds other players' wins |

### 6.4 Worked examples (current live parameters)

**Pick, 0.001 ETH, win:** sends 0.001003. Split: 0.00001 pot / 0.00001 fees / 0.00098 bankroll. Claim pays **0.03492 ETH + 10 $SHARD**. Net player result: +0.033917 ETH (− gas).

**Pick, 0.001 ETH, loss:** −0.001003 total. The pick stays encrypted on chain forever — nothing about it was ever published.

**Even, 0.001 ETH, win:** pays **0.00194 ETH** (−0.001003 cost → +0.000937).

**All, 0.001 per tile (0.036 total), always wins:** pays `0.036 × 3492 / 3600 = 0.03492` → a guaranteed ~0.97× grind; the ~3% bleed is the house edge, and the 1%+1% top-line cuts apply as usual.

**Bonanza:** each Dig seeds the pot with 1% of stake; a draw hitting index 7 (p = 1/36) releases the whole pot to that Dig's player. Funded purely by play — no sponsor money.

### 6.5 House revenue, precisely

Two distinct revenue streams, both on chain and both public:

1. **Protocol fee — certain.** 1% of every stake regardless of outcome → `withdrawFees(to)`.
2. **Statistical edge — accrues in the bankroll.** Multipliers pay ~3% below fair odds on the 98% share; the Bonanza cut recycles ~1% back to players over time, so the net statistical edge is ≈ 2% of staked volume, accumulating as bankroll growth above the seed.

Long-run player return ≈ 98% × 97% + 1% (pot recycled) ≈ **96%**, i.e. a total house take of ≈ **4%** (1% certain + ~3% statistical net of the recycled pot).

**Harvesting:** `skimProfit(bps, to)` takes `bps` of the bankroll **above BOTH `bankrollFloor` and the reservation backing requirement** (the bankroll the live cap needs to keep `reservedPayouts` fully covered). The floor is set to the deploy seed and can **only ever be raised** (`setBankrollFloor`), so seeded principal permanently stays behind player payouts. `maxStake()` simply adjusts down after a skim — solvency holds because every new Dig re-checks its reservation against the live bankroll.

### 6.6 Solvency machinery (v2.7: solvency by reservation)

```
maxPayout() = bankroll × payoutCapBps / 10000      (cumulative in-flight exposure cap)
maxStake()  = maxPayout() × 100 / 3492             (largest Pick with nothing else in flight)
bet()  requires reservedPayouts + payoutOf(stake, kind) ≤ maxPayout(),
       then reservedPayouts += payoutOf(stake, kind)
claim() releases the reservation (reservedPayouts −= payoutOf(b.stake, b.kind))
        regardless of outcome, before paying
```

- Every accepted Dig keeps its potential payout reserved until claimed, so the invariant `reservedPayouts ≤ bankroll × cap` holds through every state transition — even if every unclaimed Dig wins at the same instant, the bankroll covers them all and **no claim can revert for lack of funds** (this resolves finding M-1).
- `skimProfit` shields the same reservation requirement, so operator withdrawals can never undercut in-flight liability.
- `payoutCapBps` defaults to 10000 (100% — testnet setting); mainnet operators should lower it (e.g. 500 = 5%) so in-flight exposure stays a small slice of the house. Adjustable both ways (`setPayoutCapBps`).
- The UI mirrors the exact same check (derives `maxPayout` from the live `maxStake` read) and disables oversized amounts with an explanation instead of letting users burn gas on reverts; with other Digs in flight the real ceiling is lower and `bet()` reverts with `StakeAboveMaximum`.
- Live numbers at v2.7 genesis: bankroll = **0.03543 ETH**, reserved = 0 → maxStake ≈ **0.0010146 ETH**.

### 6.7 Funding, retirement, and invariants

- **Funding the bankroll:** deploy seed (`BANKROLL_SEED_WEI` as constructor `msg.value`) or live `fundBankroll()` (permissionless, raises `maxStake` immediately). Note: plain transfers hit `receive()` → **fee reserve, not bankroll** — deliberate, so accidental top-ups can never create payout obligations. Fresh funding is not auto-locked; raise the floor afterwards if it should be shielded from `skimProfit`.
- **`surplusETH()` invariant:** `balance − (bankroll + bonanzaPot + protocolFees + getFee()×64)` — `withdrawSurplus` can only ever take what sits above everything owed to players plus a 64-unit fee floor for in-flight Digs.
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

**Method:** line-by-line review of `GemHaven.sol` (559 lines) and `ShardToken.sol` (90 lines) at v2.7 (original review at v2.5, re-verified at v2.7), plus state-flow, reentrancy, and economic analysis. No automated tooling (hackathon scope); findings below are manual review results.

### 8.1 Strengths

| # | Item |
| --- | --- |
| S1 | **CEI everywhere** — `claimed`/`bonanzaPaid`/ledgers are updated before every external ETH transfer; no reentrancy path |
| S2 | **Attestation-gated claims** — payouts require `verifyDecryption` with covalidator signatures; win bits cannot be forged, and ACLs make them unobtainable by non-owners |
| S3 | **Ledger-based solvency** — pools are explicit storage variables; `surplusETH()` can never classify player-owed ETH as withdrawable |
| S4 | **One-way floor** — `bankrollFloor` only rises; seeded principal is permanently protected from `skimProfit` |
| S5 | **Structural privacy** — the pick is never stored, revealed, or surfaced (see §5.2) |
| S6 | **Token has no admin surface post-wiring** — one-shot minter, owner zeroed |
| S7 | No `selfdestruct`, no `delegatecall`, no proxy, no external oracles besides Inco itself |
| S8 | Custom errors + events for every money movement; full operational transparency on chain |

### 8.2 Findings

| ID | Severity | Title | Status |
| --- | --- | --- | --- |
| M-1 | **Medium** | Concurrent winners can revert claims under a thin bankroll at 100% exposure cap | **resolved in v2.7** — solvency by reservation (`reservedPayouts`) |
| L-1 | **Low** | Missing `gridSize > BONANZA_INDEX` constructor guard | **resolved in v2.7** — guard shipped |
| L-2 | **Low** | `claimBonanza(false)` burned `bonanzaPaid`, letting a griefer orphan a real pot | **resolved in v2.7** — `false` attestations are stateless; only a real hit marks the Dig paid |
| I-1 | Info | No pause/emergency-stop besides `shutdownTo` | accepted (jam scope) |
| I-2 | Info | `_playerBets` unbounded array (view gas at scale) | accepted |
| I-3 | Info | Single-step owner transfer, no timelock/multisig | accepted for testnet |
| N-1 | Note | Pick range (0..35) cannot be validated without breaking privacy — an out-of-range pick only harms its owner | by design |

**M-1 detail (resolved).** At v2.5, `bet()` checked `payout ≤ maxPayout()` at entry while `claim()` paid from the *live* bankroll, so two accepted Pick wins could jointly exceed it and the second claim reverted until `fundBankroll()`. v2.7 reserves each Dig's potential payout in `reservedPayouts` at bet time (bounded by `maxPayout()`) and releases it at claim time regardless of outcome; the bankroll can therefore never owe more than it holds and every accepted claim is funded by construction.

**L-1 detail (resolved).** The v2.5 constructor allowed `gridSize ≥ 2`; a grid ≤ 7 would have made `BONANZA_INDEX` unreachable, accruing the pot forever with no withdrawal path. v2.7 requires `gridSize > BONANZA_INDEX`.

**L-2 detail (resolved).** The bonanza bit is publicly revealed, so anyone can decrypt it. At v2.5, `claimBonanza(false)` still set `bonanzaPaid = true`, so a griefer could front-run the rightful player with a `false` attestation and orphan the pot. In v2.7 a `false` attestation verifies and returns statelessly; only a genuine hit marks the Dig as paid and releases the pot.

### 8.3 Attack-surface summary

- **Steal player funds?** No path: payouts are attestation-gated and ledger-bounded; admin withdrawals are floor/cap/accounting-bounded.
- **Forge wins?** No: covalidator signatures are verified on chain.
- **Learn other players' picks?** No path exists in the contract, the SDK boundary, or the ABI.
- **Owner rug?** Only the documented retirement path (`shutdownTo`) — an explicit, event-emitting design decision for redeploy lifecycle, not a hidden backdoor; `skimProfit` can never touch the floor.

---

## 9. Frontend audit

| Area | Assessment |
| --- | --- |
| **SDK boundary** | Single module (`lib/inco.ts`); components can't touch the SDK directly; no pick-decryption capability exists anywhere in the app ✅ |
| **Solvency UX** | UI cap check mirrors the contract formula exactly (`maxPayout = maxStake × 3492 / 100`), correct for any `payoutCapBps` ✅ |
| **Fee transparency** | Amount hint states the exact fee budget ("0.000003 ETH for Inco compute fees — total"), the 1%/1% cuts, and the minimum ✅ |
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
| **Contracts** | v2.7 live on Base Sepolia; both contracts **verified on BaseScan** (source, constructor args, read/write tabs) |
| **Version lineage** | v1 (round-based) → v2.0 (Megapot route, removed) → v2.1–v2.4 (revenue layer, fundBankroll) → v2.5 (fee rightsizing) → v2.6 → **v2.7 (game-logic audit: solvency-by-reservation, gridSize guard, bonanza griefing fix)**; superseded instances retired via `shutdownTo` except v2.5, which intentionally stays live for its unclaimed Digs — all listed in the README |
| **Frontend hosting** | Vercel production, Node 22, NEXT_PUBLIC contract addresses baked per deploy; browser-verified after each deploy (live chain reads, fee hint, zero console errors) |
| **CI** | GitHub → Vercel auto-deploy on push to `main` (Git integration live) |
| **Repo hygiene** | No secrets committed (`.env`/`.env.local` gitignored, templates provided); MIT LICENSE present; README accurate as of v2.7 |
| **Deployer wallet** | Fresh dedicated key, funded minimally; used only via local Foundry scripts |

---

## 11. Known limitations & deliberate simplifications

- **House take is real and stated** (~4% total: 1% protocol fee + ~3% edge net of the recycled pot). The differentiator is untraceable play, not better odds.
- **Solvency caps small bankrolls** — with 0.035 ETH bankroll, Picks above ~0.001 ETH revert by design, and in-flight Digs reserve their payouts (`reservedPayouts`), shrinking room for new ones. The cap is the feature: the contract can never owe more than it holds.
- **$SHARD has no utility yet** beyond the mining score; the "future allocation" story is roadmap copy, not a promise.
- **Auto mode is a frontend loop** — re-signs every tx; no session keys.
- **Unaudited hackathon code** — Base Sepolia is the intended arena; mainnet would additionally need: lower `payoutCapBps`, deeper bankroll, `Ownable2Step`/multisig/timelock, and a professional audit. (The L-1 constructor guard shipped in v2.7.)
- **No indexer/leaderboard** — all reads come straight from the contract; no global feed of other players' data exists by design.
- **No automated tests yet** — see open items.

---

## 12. Open items & recommendations

| Priority | Item |
| --- | --- |
| 1 | **Foundry test suite** with Inco cheatcodes covering: bet/claim happy paths (all 4 kinds), attestation rejection, solvency caps, skim/floor/surplus accounting, bonanza lifecycle |
| 2 | **Play a full Dig end-to-end through the UI** with a funded wallet (live proof for reviewers; flips the README "deployment is fresh" note) |
| 3 | Decide on `payoutCapBps` for the demo narrative (100% is fine for testnet, but the choice should be stated) |
| 4 | Optional: set a custom Base Sepolia RPC on Vercel (`NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`) |
| 5 | ~~Optional: constructor guard `gridSize > BONANZA_INDEX`~~ — shipped in v2.7 |
| 6 | Mainnet-only backlog: Ownable2Step + multisig, professional audit (claim queueing is obsolete — v2.7 reservation makes claims funded by construction) |

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
| `STRAIGHT_MULT_BPS` | 3492 | Pick/All multiplier ×100 |
| `EVEN_ODD_MULT_BPS` | 194 | Even/Odd multiplier ×100 |
| `BONANZA_BPS` / `PROTOCOL_FEE_BPS` | 100 / 100 | 1% pot cut / 1% protocol fee |
| `BONANZA_INDEX` | 7 | golden Deposit (tile 8 in UI) |
| `REWARD_PER_WIN` | 10e18 | $SHARD per winning Pick |
| `MAX_GRID_SIZE` | 64 | grid ceiling |
| `INCO_FEE_UNITS` | 3 | fee budget per Dig |
| `INCO_FEE_FLOOR_UNITS` | 64 | fee floor kept by `withdrawSurplus` |
| `gridSize` / `minStake` (immutable) | 36 / 0.001 ETH | live deployment |
| `payoutCapBps` | 10000 | live default (adjustable) |

### 14.2 Live deployment (v2.7, 2026-08-11)

| Parameter | Value |
| --- | --- |
| GemHaven | `0xe7eb298AfEE79F40f35CEfdCFcccBCBcC2754411` (v2.7) |
| ShardToken | `0xeA97A1748360412e2E9D3d900D1Fe2a614E1D2a8` (v2.7) |
| Chain | Base Sepolia, 84532 |
| Bankroll seed / floor | 0.03543 ETH (reservedPayouts = 0 at genesis) |
| Fee reserve seed | 0.0005 ETH |
| Inco fee budget | 3 × `getFee()` = 0.000003 ETH per Dig |
| Demo URL | https://frontend-xxcode.vercel.app |
| Repo | https://github.com/xxcode66-source/gemhaven |

### 14.3 Event inventory (operational transparency)

`Dug` · `Claimed` · `BonanzaClaimed` · `FeeReserveFunded` · `BankrollFunded` · `SurplusWithdrawn` · `FeesWithdrawn` · `ProfitSkimmed` · `BankrollFloorRaised` · `PayoutCapUpdated` · `Shutdown` · `OwnerUpdated` — every movement of value or policy emits; nothing happens silently.

---

*Report updated 2026-08-11 for v2.7 (game-logic audit re-run: uniform-edge hedge-proofing verified on-chain, M-1/L-1/L-2 fixed and deployed). Original report generated 2026-08-10 from a full review of the v2.5 codebase (`contracts/src`, `contracts/script`, `frontend/lib`, `frontend/components`), live chain reads against the Base Sepolia deployment, and the Inco games documentation. MIT License.*
