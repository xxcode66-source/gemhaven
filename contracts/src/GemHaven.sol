// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {euint256, ebool, e, inco} from "@inco/lightning/src/Lib.sol";
import {IShardMintable} from "./interfaces/IShardMintable.sol";

/// @title GemHaven — a confidential instant dig-to-earn game on Base
/// @notice Players **Dig** on a wall of `gridSize` crystal **Deposits**. Every Dig
///         is resolved instantly against the house: the contract draws an encrypted
///         **Motherlode** index in the same transaction, compares it with the
///         player's encrypted pick (or its parity, or nothing at all for `All`),
///         and seals a single encrypted win/loss bit for the player to decrypt.
///         Fixed multipliers per bet kind; play is continuous — there are no rounds.
///
/// @dev **Bet kinds.** `Pick` wins when the Motherlode equals the picked deposit
///      (pays `STRAIGHT_MULT`). `Even`/`Odd` win on the Motherlode's parity (pays
///      `EVEN_ODD_MULT`). `All` stakes the amount on every deposit at once: the
///      stake is `amount * gridSize`, exactly one tile wins, and the payout is
///      `amount * STRAIGHT_MULT` — a guaranteed ~0.97x grind.
///
/// @dev **The privacy guarantee, precisely.** What the chain ever learns per Dig:
///      the stake, the bet kind, and one public 1-bit — whether the draw hit
///      {BONANZA_INDEX} (the Bonanza trigger, revealed by design). What it never
///      learns: which deposit a `Pick` entry chose. The win/loss bit is `allow()`-ed
///      to the player alone; there is no admin path to it. If you extend this
///      contract, do not add a path that reveals the pick — it would break the
///      entire premise.
///
/// @dev **Money flow.** Each stake is split three ways inside the stake: 1% to
///      {bonanzaPot}, 1% protocol fee to {protocolFees}, and the rest to
///      {bankroll}. Wins pay from the bankroll at the fixed multiplier; every
///      Dig reserves its potential payout in {reservedPayouts} until claimed,
///      and the cumulative reservation is bounded by the exposure cap
///      {payoutCapBps}, so the house stays solvent even if every unclaimed Dig
///      wins at once. House-edge profit accrues in the bankroll and is
///      harvestable above {bankrollFloor} via {skimProfit}; protocol fees are
///      certain revenue, withdrawable via {withdrawFees}.
///      The Bonanza pot is released to the player of any Dig whose draw hit
///      {BONANZA_INDEX} — a zinc-style rolling pot funded purely by the per-Dig
///      cut.
///
/// @dev **Inco access-control note (verified against inco/lightning v1.0.2).**
///      Results of encrypted operations are granted only *transient* (same-tx)
///      access to the calling contract, and `newEuint256(ct, user)` grants
///      persistent access to `user` but only transient access to the dapp.
///      Every handle this contract persists to storage therefore calls
///      `allowThis()` in the same transaction.
///
/// @dev **Inco fees.** Exactly two Inco operations per Dig carry a fee of
///      `inco.getFee()` each: `newEuint256` (the sealed pick) and `randBounded`
///      (the draw) — comparisons, reveals and access-control ops are free.
///      Both are drawn from this contract's ETH balance. {bet} collects
///      {incoFeeBudget} (two units plus one of headroom) on top of the stake
///      to fund that, so staked ETH is never spent on compute. Surplus
///      accumulates and is withdrawable via {withdrawSurplus}, which can never
///      touch player-owed ETH. A superseded deployment can be fully drained
///      through {shutdownTo} so the bankroll is not stranded on redeploy.
contract GemHaven {
    using e for *;

    // ---------------------------------------------------------------- types --

    enum BetKind {
        Pick,
        Even,
        Odd,
        All
    }

    struct Bet {
        address player;
        uint256 stake;
        BetKind kind;
        /// @dev Encrypted win/loss bit, readable only by `player`.
        ebool encWon;
        /// @dev Encrypted "draw hit BONANZA_INDEX" bit, publicly revealed.
        ebool encBonanza;
        bool claimed;
        bool bonanzaPaid;
    }

    /// @notice Flattened, frontend-friendly view of a Dig.
    /// @dev Deliberately omits `encDeposit`-style handles for the pick: the app
    ///      must have no way to surface a pick, not even an opaque handle. Only
    ///      the result and bonanza handles are exposed.
    struct BetView {
        address player;
        uint256 stake;
        BetKind kind;
        bool claimed;
        bool bonanzaPaid;
        bytes32 resultHandle;
        bytes32 bonanzaHandle;
    }

    // ------------------------------------------------------------ constants --

    /// @notice `$SHARD` minted per winning claim, by kind. Riskier coverage mints
    ///         more: a straight Pick mints the most, while the always-winning
    ///         `All` grind mints the least so auto-betting earns only traces.
    uint256 public constant REWARD_PER_WIN = 10e18;
    uint256 public constant REWARD_PER_PARITY_WIN = 2e18;
    uint256 public constant REWARD_PER_ALL_WIN = 1e18;

    /// @notice Multipliers, expressed as multiplier x 100 (3492 = 34.92x).
    /// @dev ~3% house edge against fair odds of 36x and 2x on a 36-deposit wall.
    uint16 public constant STRAIGHT_MULT_BPS = 3_492;
    uint16 public constant EVEN_ODD_MULT_BPS = 194;
    uint16 public constant MULT_DENOMINATOR = 100;

    /// @notice Top-line cut per Dig, in basis points of the stake.
    uint16 public constant BONANZA_BPS = 100; // 1%
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Protocol fee per Dig, in basis points of the stake. Certain
    ///         revenue — unlike the statistical house edge it accrues on every
    ///         Dig regardless of outcome — collected into {protocolFees}.
    uint16 public constant PROTOCOL_FEE_BPS = 100; // 1%

    /// @notice The "golden deposit". A draw hitting this index releases the
    ///         Bonanza pot to that Dig's player. Public by design (one revealed
    ///         bit per Dig).
    uint8 public constant BONANZA_INDEX = 7;

    /// @notice Hard ceiling on `gridSize`.
    uint8 public constant MAX_GRID_SIZE = 64;

    /// @notice Fee units {withdrawSurplus} always leaves behind so in-flight Digs
    ///         can still afford their draws.
    uint256 public constant INCO_FEE_FLOOR_UNITS = 64;

    /// @notice Fee units each Dig budgets on top of the stake: one for the
    ///         encrypted pick (`newEuint256`), one for the draw (`randBounded`),
    ///         plus one unit of headroom in case the fee rises. Every other Inco
    ///         op in a Dig — comparisons, reveals, access control — is free.
    uint256 public constant INCO_FEE_UNITS = 3;

    // -------------------------------------------------------------- storage --

    IShardMintable public immutable shard;
    /// @notice Number of Deposits on the cavern wall.
    uint8 public immutable gridSize;
    /// @notice Smallest accepted Dig amount (per tile for `All`), excluding fees.
    uint256 public immutable minStake;

    address public owner;

    /// @notice ETH available to pay wins. Seeded at deploy, fed by losing stakes.
    uint256 public bankroll;
    /// @notice Rolling Bonanza pot, funded by 1% of every stake.
    uint256 public bonanzaPot;
    /// @notice Accrued protocol fees, withdrawable via {withdrawFees}.
    uint256 public protocolFees;

    /// @notice The seeded bankroll that {skimProfit} can never dip below.
    ///         Raising it locks more ETH behind player payouts permanently.
    uint256 public bankrollFloor;

    /// @notice Per-Dig exposure cap: the largest TOTAL payout exposure the
    ///         contract may carry at once, in bps of the bankroll. Every Dig
    ///         reserves its potential payout in {reservedPayouts} until it is
    ///         claimed (win or lose), so even if every unclaimed Dig wins at
    ///         the same instant the bankroll covers them all — claims never
    ///         revert for lack of funds. Defaults to 100% (fine for a seeded
    ///         testnet); mainnet operators may lower it (e.g. 500 = 5%) so
    ///         in-flight exposure stays a small slice of the house.
    uint16 public payoutCapBps;

    /// @notice Sum of potential payouts of all unclaimed Digs. Reserved at bet
    ///         time, released at claim time regardless of outcome, so the cap
    ///         is enforced on cumulative exposure — not per Dig in isolation.
    uint256 public reservedPayouts;

    /// @notice Lifetime $SHARD minted to each player from winning Pick claims.
    ///         A non-transferable mining score: it only grows by playing, so a
    ///         future token allocation can weight real play, not bought balances.
    mapping(address => uint256) public totalMined;

    uint256 public nextBetId = 1;

    mapping(uint256 => Bet) private _bets;
    mapping(address => uint256[]) private _playerBets;

    // --------------------------------------------------------------- events --

    /// @dev Carries the stake (public) and the kind, never the pick.
    event Dug(uint256 indexed betId, address indexed player, uint256 stake, BetKind kind);
    event Claimed(uint256 indexed betId, address indexed player, bool won, uint256 payout, uint256 shardMinted);
    event BonanzaClaimed(uint256 indexed betId, address indexed player, uint256 amount);
    event FeeReserveFunded(address indexed from, uint256 amount);
    event BankrollFunded(address indexed from, uint256 amount);
    event SurplusWithdrawn(address indexed to, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event ProfitSkimmed(address indexed to, uint256 amount);
    event BankrollFloorRaised(uint256 newFloor);
    event PayoutCapUpdated(uint16 newCapBps);
    event Shutdown(address indexed to, uint256 amount);
    event OwnerUpdated(address indexed owner);

    // --------------------------------------------------------------- errors --

    error NotOwner();
    error ZeroAddress();
    error InvalidGridSize();
    error StakeBelowMinimum();
    error StakeAboveMaximum();
    error UnknownBet();
    error NotYourBet();
    error AlreadyClaimed();
    error BonanzaAlreadyPaid();
    error BadAttestation();
    error NothingToWithdraw();
    error NothingToFund();
    error InvalidBps();
    error FloorCanOnlyRise();
    error TransferFailed();

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    // ---------------------------------------------------------- constructor --

    /// @dev Send the starting bankroll as the constructor's `msg.value`.
    constructor(address shard_, uint8 gridSize_, uint256 minStake_) payable {
        require(shard_ != address(0), ZeroAddress());
        // `> BONANZA_INDEX` (not `>= 2`): a grid too small to contain the
        // golden deposit would still take the 1% pot cut on every Dig but
        // could never trigger a Bonanza, locking the pot forever.
        require(gridSize_ > BONANZA_INDEX && gridSize_ <= MAX_GRID_SIZE, InvalidGridSize());
        require(minStake_ != 0, StakeBelowMinimum());

        shard = IShardMintable(shard_);
        gridSize = gridSize_;
        minStake = minStake_;
        owner = msg.sender;
        bankroll = msg.value;
        bankrollFloor = msg.value;
        payoutCapBps = uint16(BPS_DENOMINATOR);
    }

    // ------------------------------------------------------------- the game --

    /// @notice Dig: stake on a pick (or a parity, or the whole wall), resolved
    ///         instantly against an encrypted Motherlode drawn in this same tx.
    /// @param encryptedPick Ciphertext of a deposit index, produced client-side
    ///        by the inco/lightning-js SDK and bound to `msg.sender` and this
    ///        contract. For `Even`/`Odd` the value is irrelevant but a valid
    ///        ciphertext is still required; for `All` it is compared to itself.
    /// @param kind The bet kind.
    /// @dev Send `stake + incoFeeBudget(kind)` as `msg.value`. For `All` the stake
    ///      is the per-tile amount times `gridSize`.
    /// @return betId Id of the new Dig.
    function bet(bytes calldata encryptedPick, BetKind kind) external payable returns (uint256 betId) {
        uint256 budget = incoFeeBudget(kind);
        require(msg.value > budget, StakeBelowMinimum());
        uint256 stake = msg.value - budget;
        require(stake >= minStake * coverageOf(kind), StakeBelowMinimum());
        // Solvency by reservation: every Dig locks its potential payout until
        // it is claimed, so the cap applies to ALL in-flight Digs at once.
        // Two max-size parity Digs can no longer both win against one bankroll.
        uint256 potential = payoutOf(stake, kind);
        require(reservedPayouts + potential <= maxPayout(), StakeAboveMaximum());
        reservedPayouts += potential;

        // Top-line cuts, both taken inside the stake: 1% accrues to the
        // Bonanza pot, 1% is the protocol fee, the rest feeds the bankroll
        // that pays wins.
        uint256 bonanzaCut = (stake * BONANZA_BPS) / BPS_DENOMINATOR;
        uint256 protocolCut = (stake * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        bonanzaPot += bonanzaCut;
        protocolFees += protocolCut;
        bankroll += stake - bonanzaCut - protocolCut;

        // Inco grants the *player* persistent decrypt rights over their own pick
        // and this contract only transient rights, so allowThis() is required to
        // keep operating on the handle in later transactions.
        euint256 pick = e.newEuint256(encryptedPick, msg.sender);
        pick.allowThis();

        // Drawn in the same tx as the Dig, so nobody — including the digger —
        // can react to it.
        euint256 motherlode = e.randBounded(uint256(gridSize));
        motherlode.allowThis();

        ebool won;
        if (kind == BetKind.Pick) {
            won = motherlode.eq(pick);
        } else if (kind == BetKind.Even) {
            // The draw is a 0-based index but the wall numbers tiles 1..gridSize,
            // so a tile that *reads* even has an odd index.
            won = motherlode.rem(2).eq(1);
        } else if (kind == BetKind.Odd) {
            won = motherlode.rem(2).eq(0);
        } else {
            // `All` always wins on exactly one tile; comparing the pick to
            // itself yields an encrypted `true` and keeps the claim path uniform.
            won = pick.eq(pick);
        }
        won.allowThis();
        won.allow(msg.sender);

        // The one public bit per Dig: did the draw hit the golden deposit?
        ebool bonanza = motherlode.eq(uint256(BONANZA_INDEX));
        bonanza.allowThis();
        bonanza.reveal();

        betId = nextBetId++;
        _bets[betId] = Bet({
            player: msg.sender,
            stake: stake,
            kind: kind,
            encWon: won,
            encBonanza: bonanza,
            claimed: false,
            bonanzaPaid: false
        });
        _playerBets[msg.sender].push(betId);

        emit Dug(betId, msg.sender, stake, kind);
    }

    /// @notice Claims a resolved Dig. `won` must be the player's own decrypted
    ///         win bit, attested by the Inco covalidators; a losing Dig simply
    ///         marks itself claimed and pays nothing.
    function claim(uint256 betId, bool won, bytes[] calldata signatures) external {
        Bet storage b = _betAt(betId);
        require(msg.sender == b.player, NotYourBet());
        require(!b.claimed, AlreadyClaimed());
        require(e.verifyDecryption(b.encWon, won, signatures), BadAttestation());

        b.claimed = true;
        // Release this Dig's reservation whatever the outcome — losing claims
        // free capacity just like winning ones.
        uint256 payout = payoutOf(b.stake, b.kind);
        reservedPayouts -= payout;
        if (!won) {
            emit Claimed(betId, msg.sender, false, 0, 0);
            return;
        }

        bankroll -= payout;

        uint256 shardMinted = shardReward(b.kind);
        if (shardMinted != 0) {
            shard.mint(msg.sender, shardMinted);
            // Lifetime mining score. Deliberately the cumulative minted amount,
            // not the transferable $SHARD balance, so it only grows by playing.
            totalMined[msg.sender] += shardMinted;
        }

        if (payout != 0) {
            (bool ok,) = msg.sender.call{value: payout}("");
            require(ok, TransferFailed());
        }

        emit Claimed(betId, msg.sender, true, payout, shardMinted);
    }

    /// @notice Releases the whole Bonanza pot to the player of a Dig whose draw
    ///         hit {BONANZA_INDEX}. Permissionless: the attestation on the
    ///         publicly-revealed bonanza bit is what makes it trustless, and the
    ///         pot always goes to that Dig's player regardless of the caller.
    function claimBonanza(uint256 betId, bool hit, bytes[] calldata signatures) external {
        Bet storage b = _betAt(betId);
        require(!b.bonanzaPaid, BonanzaAlreadyPaid());
        require(e.verifyDecryption(b.encBonanza, hit, signatures), BadAttestation());

        // A `false` attestation is deliberately stateless: anyone can decrypt
        // the publicly-revealed bit, so letting a `false` claim burn the flag
        // would let a griefer front-run the player and orphan their pot.
        // Only a real hit marks the Dig as paid.
        if (!hit) return;
        b.bonanzaPaid = true;

        uint256 pot = bonanzaPot;
        bonanzaPot = 0;
        (bool ok,) = b.player.call{value: pot}("");
        require(ok, TransferFailed());

        emit BonanzaClaimed(betId, b.player, pot);
    }

    // ---------------------------------------------------------------- views --

    /// @notice Deposits covered by each kind: Pick 1, parity half the wall, All
    ///         the whole wall. Stakes are expressed per covered deposit, so an
    ///         Odd Dig at 0.001 stakes 0.001 x 18 in total.
    function coverageOf(BetKind kind) public view returns (uint256) {
        if (kind == BetKind.All) return uint256(gridSize);
        if (kind == BetKind.Pick) return 1;
        return uint256(gridSize) / 2;
    }

    /// @notice `$SHARD` minted for a winning claim of `kind`.
    function shardReward(BetKind kind) public pure returns (uint256) {
        if (kind == BetKind.Pick) return REWARD_PER_WIN;
        if (kind == BetKind.All) return REWARD_PER_ALL_WIN;
        return REWARD_PER_PARITY_WIN;
    }

    /// @notice Payout for a winning Dig of `kind` with `stake` (total stake for
    ///         `All`, i.e. per-tile amount times `gridSize`).
    function payoutOf(uint256 stake, BetKind kind) public view returns (uint256) {
        if (kind == BetKind.All) {
            return (stake * STRAIGHT_MULT_BPS) / (MULT_DENOMINATOR * uint256(gridSize));
        }
        uint256 mult = kind == BetKind.Pick ? uint256(STRAIGHT_MULT_BPS) : uint256(EVEN_ODD_MULT_BPS);
        return (stake * mult) / MULT_DENOMINATOR;
    }

    /// @notice Largest total payout exposure the contract may currently carry —
    ///         the bankroll scaled by {payoutCapBps}. At the 100% default the
    ///         in-flight reservations of ALL unclaimed Digs may equal the whole
    ///         bankroll, and every claim is funded by construction.
    function maxPayout() public view returns (uint256) {
        return (bankroll * uint256(payoutCapBps)) / BPS_DENOMINATOR;
    }

    /// @notice Largest `Pick` stake the bankroll can currently cover IF no
    ///         other Dig is in flight; in-flight reservations shrink the room
    ///         left for new Digs (`bet` re-checks and reverts with
    ///         StakeAboveMaximum when full). The UI caps presets at this.
    ///         (`All` may stake `gridSize` times this total.)
    function maxStake() public view returns (uint256) {
        return (maxPayout() * MULT_DENOMINATOR) / uint256(STRAIGHT_MULT_BPS);
    }

    /// @notice ETH to add on top of the stake in {bet} to cover Inco compute
    ///         fees. Two fee-bearing ops per Dig plus one unit of headroom.
    function incoFeeBudget(BetKind) public view returns (uint256) {
        return inco.getFee() * INCO_FEE_UNITS;
    }

    function getBet(uint256 betId) external view returns (BetView memory) {
        Bet storage b = _betAt(betId);
        return BetView({
            player: b.player,
            stake: b.stake,
            kind: b.kind,
            claimed: b.claimed,
            bonanzaPaid: b.bonanzaPaid,
            resultHandle: ebool.unwrap(b.encWon),
            bonanzaHandle: ebool.unwrap(b.encBonanza)
        });
    }

    /// @notice Ids of `player`'s Digs, oldest first.
    function getPlayerBets(address player) external view returns (uint256[] memory) {
        return _playerBets[player];
    }

    /// @notice ETH in this contract not owed to players or the pot — the
    ///         accumulated Inco fee buffer, minus the floor kept for in-flight Digs.
    function surplusETH() public view returns (uint256) {
        uint256 owed = bankroll + bonanzaPot + protocolFees + inco.getFee() * INCO_FEE_FLOOR_UNITS;
        uint256 balance = address(this).balance;
        return balance > owed ? balance - owed : 0;
    }

    // ---------------------------------------------------------------- admin --

    /// @notice Tops up the bankroll with fresh house capital mid-flight.
    ///         Unlike a plain transfer — which {receive} credits to the Inco
    ///         fee reserve — this counts toward payouts and raises {maxStake}
    ///         immediately. It is NOT automatically locked: call
    ///         {setBankrollFloor} afterwards if it should be shielded from
    ///         {skimProfit}.
    function fundBankroll() external payable {
        require(msg.value != 0, NothingToFund());
        bankroll += msg.value;
        emit BankrollFunded(msg.sender, msg.value);
    }

    /// @notice Tops up the Inco fee reserve. Not counted as player-owed ETH.
    receive() external payable {
        emit FeeReserveFunded(msg.sender, msg.value);
    }

    /// @notice Withdraws only {surplusETH}. Cannot touch the bankroll or the
    ///         Bonanza pot.
    function withdrawSurplus(address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        uint256 amount = surplusETH();
        require(amount != 0, NothingToWithdraw());
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit SurplusWithdrawn(to, amount);
    }

    /// @notice Withdraws the accrued protocol fees. Certain house revenue:
    ///         unlike the edge it never touches the bankroll, the Bonanza pot,
    ///         or player-owed ETH.
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        uint256 amount = protocolFees;
        require(amount != 0, NothingToWithdraw());
        protocolFees = 0;
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Harvests house-edge profit: `bps` of the bankroll growth above
    ///         BOTH {bankrollFloor} and {reservedPayouts}. The seeded floor is
    ///         never touched and in-flight Dig exposure is never undercut, and
    ///         {maxStake} simply adjusts down afterwards — solvency holds by
    ///         construction because every bet re-checks its reservation against
    ///         the live bankroll.
    function skimProfit(uint16 bps, address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        require(bps != 0 && bps <= BPS_DENOMINATOR, InvalidBps());
        // Shield both the seeded floor and whatever bankroll the live cap
        // needs to back the in-flight reservations (reserved <= cap x bankroll).
        uint256 needForCap =
            (reservedPayouts * BPS_DENOMINATOR + uint256(payoutCapBps) - 1) / uint256(payoutCapBps);
        uint256 shielded = bankrollFloor > needForCap ? bankrollFloor : needForCap;
        uint256 excess = bankroll > shielded ? bankroll - shielded : 0;
        uint256 amount = (excess * uint256(bps)) / BPS_DENOMINATOR;
        require(amount != 0, NothingToWithdraw());
        bankroll -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit ProfitSkimmed(to, amount);
    }

    /// @notice Raises the protected bankroll floor. Deliberately one-way: the
    ///         floor can only ever grow, locking more ETH behind payouts.
    function setBankrollFloor(uint256 floor_) external onlyOwner {
        require(floor_ > bankrollFloor, FloorCanOnlyRise());
        bankrollFloor = floor_;
        emit BankrollFloorRaised(floor_);
    }

    /// @notice Sets the per-Dig exposure cap (bps of the bankroll). Lowering it
    ///         trades max-bet size for variance safety; raising it back is
    ///         allowed so a misconfiguration is recoverable.
    function setPayoutCapBps(uint16 bps) external onlyOwner {
        require(bps != 0 && bps <= BPS_DENOMINATOR, InvalidBps());
        payoutCapBps = bps;
        emit PayoutCapUpdated(bps);
    }

    /// @notice Retires this instance and sends its ENTIRE balance — bankroll,
    ///         Bonanza pot and fee reserve — to `to`. Deliberately bypasses the
    ///         solvency protections, which exist to shield live players: they
    ///         would otherwise strand house funds forever on a superseded
    ///         deployment. Has no sensible use on a live instance with players.
    function shutdownTo(address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        uint256 amount = address(this).balance;
        require(amount != 0, NothingToWithdraw());
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit Shutdown(to, amount);
    }

    function setOwner(address owner_) external onlyOwner {
        require(owner_ != address(0), ZeroAddress());
        owner = owner_;
        emit OwnerUpdated(owner_);
    }

    // -------------------------------------------------------------- private --

    function _betAt(uint256 betId) private view returns (Bet storage) {
        require(betId != 0 && betId < nextBetId, UnknownBet());
        return _bets[betId];
    }
}
