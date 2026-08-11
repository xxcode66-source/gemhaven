# GemHaven

**Confidential instant dig-to-earn on Base.** One wall of 36 crystal Deposits, one hidden Motherlode per Dig. You pick a Deposit (or a parity, or the whole wall), your pick is encrypted in your browser before it ever leaves your machine, and the contract draws an encrypted Motherlode and settles your Dig **in the same transaction**. Fixed multipliers, no rounds, no waiting — the cavern never closes.

Built for the Inco Summer Game Jam, **Inco — Hidden Mechanics track**. The game is not merely private-ish. There is no code path, for anyone including the contract owner, that reveals which Deposit a Pick chose. See [The privacy guarantee](#the-privacy-guarantee).

> v2.7 note: GemHaven v1 was a round-based parimutuel game ("Delves"), and v2.0 briefly carried a Megapot fee route ("the Deep Vein"). Both are gone from the live game: v2.7 is a zinc-style instant game against a house bankroll with a rolling Bonanza pot, powered purely by Inco Lightning. On top of the v2.3 revenue layer (1% protocol fee per Dig via `withdrawFees`, edge harvesting above a protected bankroll floor via `skimProfit`, owner-adjustable exposure cap via `payoutCapBps`) and the v2.5 fee rightsizing (exactly two fee-bearing Inco ops per Dig, budget 3 units), v2.7 ships the results of a full game-logic audit: **solvency by reservation** (every Dig locks its potential payout in `reservedPayouts` until claimed, so the exposure cap bounds *cumulative* in-flight liability and claims can never revert for lack of funds), a constructor guard requiring `gridSize > BONANZA_INDEX`, and a griefing fix so `claimBonanza(false)` can no longer burn the paid flag. Earlier Base Sepolia deployments remain on chain as legacy artifacts; the live game is the v2.7 deployment below.

---

## Vocabulary

GemHaven has its own nouns, used consistently in the contracts, the UI, and this document.

| Generic term | GemHaven term |
| --- | --- |
| Grid cell / tile | **Deposit** |
| Stake / bet / play | **Dig** |
| Reward token | **Shard** (`$SHARD`) |
| Winning cell / hidden draw | **Motherlode** |
| Progressive jackpot | **Bonanza** |

---

## Game mechanics

Every Dig is a single transaction, resolved instantly against the house:

1. The player submits an encrypted pick plus a stake.
2. The contract draws an encrypted Motherlode with `e.randBounded(36)` **in the same transaction**, compares it to the pick according to the bet kind, and seals one encrypted win/loss bit readable only by the player.
3. If the Dig won, the player decrypts their bit (one wallet signature) and claims the fixed payout from the bankroll.

Play is continuous by construction — there are no rounds to lock, settle, or advance. "Auto" mode is a frontend loop over exactly this flow.

### Bet kinds, odds, and edge

| Kind | Wins when | Payout | Fair odds | Edge |
| --- | --- | --- | --- | --- |
| **Pick** | the draw equals the picked Deposit | 34.92× stake | 36× (1/36) | ~3% |
| **Even** | the drawn tile's number is even | 1.94× stake | 2× (18/36) | ~3% |
| **Odd** | the drawn tile's number is odd | 1.94× stake | 2× (18/36) | ~3% |
| **All** | always — one tile always hits | 34.92× the per-tile amount | 0.97× of total outlay | ~3% |

`All` stakes the chosen amount on **every** Deposit (total cost = amount × 36); the one tile the Motherlode lands on pays the straight multiplier. Multipliers are basis points in the contract (`STRAIGHT_MULT_BPS = 3492`, `EVEN_ODD_MULT_BPS = 194`, denominator 100).

Winning **Pick** Digs also mint a flat 10 `$SHARD` into the player's wallet and bump their **mining score** (`totalMined` — the lifetime amount ever minted to that address). Even/Odd/All mint nothing, so auto-betting cannot inflate the supply. The score is deliberately non-transferable: it can only grow by playing, which is why a future GemHaven token launch would weight allocations by it (roadmap, not a promise — no conversion is defined today).

### The money model

Each stake is split at the top line:

| Cut | Share | Destination |
| --- | --- | --- |
| Bonanza | 1% | `bonanzaPot`, released on a golden-deposit hit |
| Protocol fee | 1% | `protocolFees`, certain house revenue (`withdrawFees`) |
| Bankroll | 98% | pays all wins |

Wins are paid from the **bankroll**, so the house enforces a solvency cap by reservation: every Dig locks its potential payout in `reservedPayouts` at bet time and releases it at claim time (win or lose). `maxPayout() = bankroll × payoutCapBps / 10000` caps the *cumulative* in-flight reservation, and `maxStake() = maxPayout() × 100 / 3492` is the largest Pick stake when nothing else is in flight (100% cap by default; mainnet operators should lower it, e.g. 500 = 5%). A Dig that would push total exposure above the line reverts with `StakeAboveMaximum`, and the UI caps amounts at it with a message saying why. Because every accepted Dig holds its payout reserved until claimed, the bankroll covers every unclaimed win **even if they all strike at the same instant** — claims never revert for lack of funds. The bankroll is seeded at deploy (`BANKROLL_SEED_WEI`) and grows on net losing play.

**House revenue, precisely:** the protocol fee is certain — it accrues on every Dig regardless of outcome — while the ~2% net house edge (multiplier edge minus the recycled Bonanza cut) is statistical and accrues in the bankroll as growth. `skimProfit(bps, to)` harvests a share of the bankroll growth above BOTH `bankrollFloor` (set to the seed at deploy, and only ever raisable) and whatever the live cap needs to back the in-flight reservations, so the seeded principal and every accepted Dig's payout permanently stay shielded. Intended operator rhythm: skim periodically and split between operations and a treasury that seeds future token liquidity — a policy commitment, not an on-chain mechanism.

**Topping up the bankroll.** Two paths: at deploy time, via `BANKROLL_SEED_WEI` in `contracts/.env` (sent as the constructor's `msg.value`); or live, via `fundBankroll()` payable, which credits the bankroll immediately and raises `maxStake` (`script/FundBankroll.s.sol` wraps it with `TOPUP_WEI`). Note that a plain ETH transfer to the contract funds the **Inco fee reserve** (`receive()`), not the bankroll. Fresh funding is not auto-locked: raise `bankrollFloor` afterwards if it should be shielded from `skimProfit`.

### The Bonanza

One Deposit is golden: `BONANZA_INDEX = 7` (tile 8 in the UI). Every Dig computes `bonanzaHit = motherlode == 7` and `reveal()`s it — a single public 1-bit event, the only thing about a draw that is ever published. When it lands, that Dig's player can `claimBonanza` and takes the **whole pot**, which then resets. The pot is funded purely by the 1% per-Dig set-aside — a zinc-style rolling jackpot, no sponsor money, and no public winner reveal beyond the bit itself.

## The privacy guarantee

Per Dig, the chain ever learns exactly three things:

1. **The stake and the bet kind** — public, like any wager.
2. **One public bit: whether the draw hit the golden Deposit.** Needed for the Bonanza; revealed by design.
3. **A single win/loss bit — and only to the wallet that made the Dig.** `bet()` calls `won.allow(msg.sender)` and nothing else; decrypting it requires that address's signature.

**Never learnable by anyone, ever: which Deposit a Pick chose.**

This is enforced structurally, not by convention:

- The pick handle is never `reveal()`-ed and never `allow()`-ed to anyone but the player.
- `Bet.encPick` does not exist as a stored field at all — the pick is used inside `bet()` and dropped. `getBet` returns a `BetView` that carries only the result and bonanza handles. The frontend physically cannot render a pick, because the ABI does not carry one.
- The `Dug` event carries the stake and the kind — never the pick.
- Even and Odd Digs still submit a sealed placeholder pick, so every Dig looks byte-identical in shape on chain.

Compared to v1, the anonymity story is simpler and stronger per transaction: there is no published aggregate to correlate stakes against. What is public — stake + kind + one bonanza bit — is the same for winners and losers alike.

---

## Architecture

```
contracts/
  src/GemHaven.sol      the game: bets, encrypted draws, claims, bankroll, bonanza
  src/ShardToken.sol    $SHARD, mintable only by GemHaven
  src/interfaces/       IShardMintable
  script/Deploy.s.sol   deploys both, seeds the bankroll, wires the minter
  scripts/compile.mjs   solc-js driver, so ABIs build without a Foundry install
  scripts/sync-abi.mjs  emits frontend/lib/abi/*.ts as `as const` literals

frontend/
  lib/inco.ts           the ONLY module that touches @inco/lightning-js
  lib/contracts.ts      addresses, chain config, ABI bindings, multipliers
  lib/hooks.ts          typed wagmi reads: useGameStats, usePlayerBets, ...
  lib/format.ts         unit formatting + custom-error → human message mapping
  components/           Navbar, ConnectMenu, CavernGrid, BetControls, GamePulse,
                        RecentDigs, ShardBalance, BackgroundFX
  app/                  / landing hero · /about the explainer · /mine the cavern wall · /history your Digs
```

### A Dig's lifecycle

```
    encrypt pick (browser)                      ┌─────────────────────────┐
            │                                   │  bet(ct, kind) payable  │
            ▼                                   │  • splits 1% / 1% / 98% │
    bet() in one tx ───────────────────────────▶│  • draws Motherlode     │
                                                │  • seals won-bit → you  │
                                                │  • reveals bonanza bit  │
                                                └────────────┬────────────┘
                                                             │
                 decryptOwnResult (wallet signature — you only)
                                                             │
                          ┌──────────────┴──────────────┐
                          ▼                             ▼
                   won: claim()                   lost: nothing owed,
                   payout from bankroll           pick stays sealed forever
                   (+10 $SHARD if Pick)
                                                             │
                   bonanza hit? claimBonanza() — whole pot, permissionless
```

Every state change is initiated by a player transaction; there is nothing for a keeper to advance — no round to settle, no fees to flush.

### Reveal vs. decrypt — two different paths

These are not interchangeable, and `lib/inco.ts` keeps them apart deliberately:

| | `revealPublicBit` | `decryptOwnResult` |
| --- | --- | --- |
| SDK call | `attestedReveal(handles)` | `attestedDecrypt(walletClient, handles)` |
| Wallet signature | **No** | **Yes** |
| Works because | the contract called `e.reveal()` on the handle, so covalidators will attest it for anyone | the caller's address is on the handle's ACL via `allow()` |
| Used for | the bonanza-hit bit | your own win/loss bit |

Covalidator signatures come back from the SDK as `Uint8Array[]`. viem needs `0x`-prefixed hex, so `lib/inco.ts` converts them with `bytesToHex` at that single boundary — do not pass them through untouched.

### Inco compute fees

`newEuint256`, `randBounded`, and each FHE operation cost `inco.getFee()`, charged against **GemHaven's own ETH balance**. So a Dig must fund its own compute:

- `incoFeeBudget(kind)` = `inco.getFee() × 3` for every kind: exactly two Inco ops per Dig carry a fee — the sealed pick (`newEuint256`) and the draw (`randBounded`) — plus one unit of headroom. Comparisons, `rem`, reveals and access-control ops are free (verified against the Inco fee schedule). v2 is O(1) per Dig — v1's O(gridSize) comparisons are gone, which is what makes the 36-tile wall cheap.
- `bet()` requires `msg.value > incoFeeBudget(kind)`; the stake is the remainder. Staked ETH is never spent on compute.
- `surplusETH()` treats `bankroll + bonanzaPot + fee floor` as owed. `withdrawSurplus` can only take what sits above that, so it can never touch player-owed ETH or strand in-flight Digs.
- Deploy seeds the fee buffer with `INCO_FEE_RESERVE_WEI` so the very first Dig can draw. Plain ETH transfers to GemHaven also top it up (`receive()`).

Every handle written to storage calls `allowThis()` in the same transaction. Inco grants operation results only *transient* (same-tx) access, so without this, later transactions could not operate on the handle.

---

## Running it

### 1. Contracts

```powershell
cd contracts
npm install
npm run abi          # compiles with solc-js and regenerates frontend/lib/abi/*.ts
```

`npm run abi` needs only Node. It exists because the ABI pipeline should not require a Foundry toolchain. `forge build` remains the canonical compile path (`foundry.toml`, solc 0.8.29 / evmVersion cancun / optimizer 200 runs).

**Deployment requires Foundry** (`forge`). Install it from [getfoundry.sh](https://getfoundry.sh) if you don't have it.

```powershell
cp .env.example .env    # fill in PRIVATE_KEY and the RPC URLs
npm run deploy:base-sepolia
```

Defaults: `GRID_SIZE=36`, `MIN_STAKE_WEI=0.001 ETH`, `BANKROLL_SEED_WEI=0.05 ETH`, `INCO_FEE_RESERVE_WEI=0.001 ETH`. Grid size is now free of FHE-cost constraints (O(1) per Dig); `MAX_GRID_SIZE` is 64 and mostly protects UI layout assumptions. The bankroll seed must cover one minimum-stake Pick payout (`minStake × 34.92`), or every Dig would revert at the solvency cap.

The script prints the two `NEXT_PUBLIC_*` lines you need next.

### Live deployment — Base Sepolia (v2.7)

| Contract | Address |
| --- | --- |
| GemHaven | `0xe7eb298AfEE79F40f35CEfdCFcccBCBcC2754411` |
| ShardToken | `0xeA97A1748360412e2E9D3d900D1Fe2a614E1D2a8` |

Both contracts are **verified on BaseScan** — full source, read/write tabs, and constructor args are public at each address page. Deployed 2026-08-11 with `gridSize=36`, `minStake=0.001 ETH`, bankroll seed `0.03543 ETH` (cap just above `0.001 ETH` per Pick), fee reserve `0.0005 ETH`, Inco fee budget 3 units per Dig, `payoutCapBps=10000` (100% of the bankroll may be reserved by in-flight Digs; lower via `setPayoutCapBps` for a deeper mainnet bankroll), and `reservedPayouts=0` at genesis. Unaudited hackathon code — Base Sepolia is the intended place to play, not mainnet.

Legacy deployments, no longer wired into the UI: v2.6 (`GemHaven 0xEa9fe3914F659902E285968253e17dC67138E0F7`, `ShardToken 0xd04A0cf6332e5F10cDFb0b4BA21c0EE708Ac350B`, retired via `shutdownTo`), v2.5 (`GemHaven 0x444b9027c7e76e9c62A8EFe1e6364C77b7D5f215`, `ShardToken 0x944BE2bdC254392dF825Ff0b6Ed48e265Cdc1ED9`, superseded but deliberately NOT retired — it still holds unclaimed Digs whose claims must stay payable), v2.4 (`GemHaven 0x630f27F52018b62244fA8492945c44A3F2105520`, `ShardToken 0x2C25db5146973739F724F2267f5F7552b5DE296F`, retired via `shutdownTo`), v2.3 (`GemHaven 0x2F62f0cC7Ac27084Fe865Cf7c096781D4e25Ca90`, `ShardToken 0x2933fb0dAd333e2098f55b106ef012248980a59E`, retired), v2.2 (`GemHaven 0x7A2920E7671BED5ab4615820d77e4E1beDcd2453`, `ShardToken 0x02513EA077e8E896ACEf0C481fF6F9d3c5235CAe`, retired), v2.1 (`GemHaven 0x15eCDaA0f519F71a9cbc8AdBA80f69cCe8091f84`, `ShardToken 0xfD3372DA312FC75542f3216488D943d9D81Edcc5`), v2.0 (`GemHaven 0xD5218Eb768A0D7Dc5DBbd495dE9437795908d5b4`, `ShardToken 0xD3146402Cab45a3b0e06b96317674B0FF6cD9557`, `DeepVein 0x91D4234c45bD33F72748A39b0d50a690d2c6cd85`) and v1 round-based (`GemHaven 0xc7134F764DdE05f265614EbAD9a7A0c7E71a737d`, `ShardToken 0x1F9ED99a993Ce25114587E1E985C8179E619160f`). Redeploys are funded by sweeping the fee surplus of superseded contracts (`script/Recover.s.sol`) or retiring them outright (`script/Retire.s.sol`, v2.2+); `shutdownTo` lets the owner move an instance's entire balance.

### 2. Frontend

```powershell
cd frontend
npm install
cp .env.example .env.local    # paste the addresses the deploy script printed
npm run dev
```

```powershell
npm run typecheck    # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run build        # next build
```

Base Sepolia (84532) is the default chain. Base mainnet (8453) is kept in the wallet config only so a mainnet wallet gets a clear "deployment is on Sepolia" notice; the navbar's wallet dropdown shows the mismatch and offers the switch.

### Playing

1. Open the app: the landing page is a pure hero with **Start Mining** and **Read About** (which opens the `/about` explainer page). The navbar links to the **Cavern** (`/mine`), your **History** (`/history`), and the wallet dropdown.
2. **Connect** a wallet from the dropdown and make sure you're on the deployment chain.
3. **Choose a kind** — Pick, Even, Odd, or All — and an amount (presets `0.001` to `1` ETH, or custom). Amounts beyond the bankroll's solvency cap are disabled with an explanation.
4. For **Pick**, select a Deposit on the wall. Your pick is encrypted client-side; the transaction sends `stake + incoFeeBudget(kind)`.
5. The Dig settles in its own transaction. The UI automatically decrypts your bit and claims for you if you won; if the draw hit the golden Deposit it claims the Bonanza too.
6. **Auto** repeats the same Dig with a short delay until you switch it off or something errors.
7. Anything you forgot about lives in **History** — claims never expire, so any unclaimed Dig can be decrypted and claimed from the list however long ago it happened.

---

## Known limitations and deliberate simplifications

These are choices, not oversights. Several of them exist *because* of the privacy guarantee.

- **The house take is real and stated.** ~3% inside the multipliers, plus the 1% Bonanza cut and the 1% protocol fee inside every stake. GemHaven is a luck game; the differentiator is that your plays are untraceable, not that the odds favour you.
- **Solvency caps small bankrolls.** With the testnet bankroll of 0.03543 ETH, Picks above ~0.001 ETH revert by design, and in-flight Digs shrink the room left for new ones (`reservedPayouts`). Mainnet operators would seed deeper (`BANKROLL_SEED_WEI` or live `fundBankroll` top-ups); the cap is a feature, not a bug — the contract can never owe more than it holds, and every accepted Dig keeps its payout reserved until claimed.
- **`REWARD_PER_WIN` is a flat 10 `$SHARD` per winning Pick only.** Even/Odd/All mint nothing so auto mode cannot farm supply. `$SHARD` has no utility beyond the mining score today — the "future token allocation" story is roadmap copy, not an implemented or promised conversion.
- **The bonanza bit is public.** One revealed bit per Dig is the price of a jackpot that pays without revealing anything else. A winning pick that also triggers the Bonanza does associate the pot with that Dig's (public) player address.
- **Auto mode is a frontend loop.** It re-signs every transaction through your wallet; it stops on any error. There is no session-key automation.
- **No Megapot.** An earlier revision routed 1% of each Dig toward Megapot tickets via a `DeepVein` keeper workflow; it was removed for v2.1 — the 1% set-aside now funds the Bonanza pot exclusively (v2.3 adds a separate 1% protocol fee).
- **Unaudited.** This is hackathon code handling real ETH. The Base Sepolia deployment above is fine to play with; mainnet is not.
- **No indexer or leaderboard.** All state is read directly from the contract via wagmi. History shows your own Digs (the contract tracks ids per player); there is deliberately no global feed of other players' picks.
- **Deployment is fresh.** The v2.7 Base Sepolia deployment above exists and its reads are verified, but a full Dig (bet → decrypt → claim), an Even/Odd/All pass, and an auto loop have not yet been played end to end through the UI.

---

## Implementation notes

### `viem` is pinned to exactly `2.39.3`

Not a range, and there's an `overrides` entry enforcing it for the whole tree. This is load-bearing:

`@inco/lightning-js@1.0.2` declares `viem: 2.39.3` as an **exact** dependency. If the app resolves any other version, npm nests a second copy under `node_modules/@inco/lightning-js/node_modules/viem`, and the two structurally-identical `WalletClient` types stop unifying. The symptom is a page-long TypeScript structural mismatch at the `attestedDecrypt` call site, bottoming out in something unhelpful like `Property 'tokens' is missing from type 'Client'`.

To verify the invariant holds after any dependency change:

```powershell
cd frontend
Test-Path node_modules/@inco/lightning-js/node_modules/viem   # must be False
```

### No `wagmi/connectors` import

`lib/wagmi.ts` declares no `connectors` array. Wallets are discovered through wagmi's default EIP-6963 `multiInjectedProviderDiscovery`.

Importing the `wagmi/connectors` barrel pulls in its `baseAccount` connector → `@base-org/account` → `@coinbase/cdp-sdk` → unpublished optional `@x402/*` peer packages, which fail to resolve and break `next build` outright. Aliasing them away would be whack-a-mole against a transitive tree, so the barrel simply isn't imported. The trade-off: only wallets that announce themselves via EIP-6963 appear, and the navbar's `ConnectMenu` dropdown renders an explicit "No browser wallet detected" state when none do.

### ABIs are generated TypeScript, not JSON

`sync-abi.mjs` writes `frontend/lib/abi/*.ts` containing `export const gemHavenAbi = [...] as const`. Importing ABIs as JSON widens every string to `string` and destroys wagmi/viem's type inference, which then forces `as` casts at every call site. Generated TS keeps argument and return types fully inferred end to end. Don't hand-edit those files — run `npm run abi` in `contracts/`.

### Styling and motion

Original crystal-cavern identity: a radial `#050608`→`#0b0d12`→`#1b1f2b` base with faceted 7-point gem polygons (`.facet-clip`), accented in teal `#3ee6c4`, violet `#a78bfa`, rose `#f472b6`, amber `#fbbf6a`. Ambient loops (`shimmer`, `pulseGlow`, `drift`) are CSS keyframes; React state transitions use Framer Motion. `prefers-reduced-motion` zeroes every animation and transition duration.

Fonts are system stacks only — no `next/font/google` — so `next build` never needs network access.

Accessibility: the cavern wall is a `radiogroup` of focusable buttons when a Pick is being made, each labelled with its Deposit number and gem family. State is never conveyed by colour alone; picked Deposits, strikes, and every claim status carry text or glyph labels too.

---

## License

MIT.
