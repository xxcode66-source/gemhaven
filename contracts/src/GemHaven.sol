// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {euint256, ebool, e, inco} from "@inco/lightning/src/Lib.sol";
import {IShardMintable} from "./interfaces/IShardMintable.sol";

/// @title GemHaven — a confidential instant dig-to-farm game on Base
/// @notice Players **Dig** on a wall of `gridSize` crystal **Deposits**. Every Dig
///         is resolved instantly: the contract draws an encrypted **Motherlode**
///         index in the same transaction, compares it with the player's encrypted
///         pick (or its parity, or nothing at all for `All`), and seals a single
///         encrypted win/loss bit for the player to decrypt. Play is continuous —
///         there are no rounds.
///
/// @dev **Bet kinds.** `Pick` wins when the Motherlode equals the picked deposit.
///      `Even`/`Odd` win on the Motherlode's parity. `All` covers every deposit at
///      once (stake = amount * gridSize) and therefore always wins.
///
/// @dev **Money flow (v2.8 — the house never risks its own capital).** The full
///      stake is held as per-Dig escrow until the Dig is claimed:
///        - WIN: the escrowed stake is refunded to the player ("duit balik") and
///          $SHARD is minted at the kind's multiplier (`SHARD = stake x mult x
///          SHARD_SCALE`). Riskier coverage mints more: Pick 34.92x, parity 1.94x.
///          `All` always wins, so it mints zero $SHARD — a riskless kind must not
///          be a farm, it exists as a practice/demo dig.
///        - LOSS: the stake is split 50% to {bonanzaPot}, 49% to {bankroll}
///          (house liquidity, withdrawable for buyback/liquidity), 1% to
///          {protocolFees}; the player also mints a small consolation of $SHARD
///          (0.5x stake-scale) so every Dig farms something.
///      The house's maximum ETH outflow on any Dig is the stake refund it already
///      holds in escrow, so there is no bankroll solvency machinery at all: no
///      exposure cap, no reservation ledger, no floor. $SHARD is the product —
///      a mining score (`totalMined`) that a future token allocation can weight.
///      The Bonanza pot is released to the player of any Dig whose draw hit
///      {BONANZA_INDEX} — a rolling jackpot funded purely by losing Digs.
///
/// @dev **The privacy guarantee, precisely.** What the chain ever learns per Dig:
///      the stake, the bet kind, and one public 1-bit — whether the draw hit
///      {BONANZA_INDEX} (the Bonanza trigger, revealed by design). What it never
///      learns: which deposit a `Pick` entry chose. The win/loss bit is `allow()`-ed
///      to the player alone; there is no admin path to it. If you extend this
///      contract, do not add a path that reveals the pick — it would break the
///      entire premise.
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
///      through {shutdownTo} so house funds are not stranded on redeploy.
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

    /// @notice $SHARD multipliers on a winning claim, expressed as multiplier
    ///         x 100 (3492 = 34.92x of stake-scale). Riskier coverage mints more.
    uint16 public constant STRAIGHT_MULT_BPS = 3_492;
    uint16 public constant EVEN_ODD_MULT_BPS = 194;
    uint16 public constant MULT_DENOMINATOR = 100;

    /// @notice Wei of $SHARD per wei of stake at a 1.00x multiplier. 1000 makes
    ///         numbers read well: a 0.001 ETH Pick win mints 34.92 $SHARD.
    uint256 public constant SHARD_SCALE = 1_000;

    /// @notice Consolation $SHARD on a losing claim, in bps of stake-scale
    ///         (5000 = 0.5x): a 0.001 ETH loss mints 0.5 $SHARD. Every Dig farms
    ///         something, but losing still costs real ETH, so $SHARD cannot be
    ///         printed for free.
    uint16 public constant CONSOLATION_BPS = 5_000;

    /// @notice Basis-points denominator for the loss split and consolation.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Share of a LOSING stake that feeds the Bonanza pot, in bps.
    ///         Half of every miss rolls into the jackpot.
    uint16 public constant BONANZA_LOSS_BPS = 5_000; // 50%

    /// @notice Protocol fee taken from a LOSING stake, in bps. Certain house
    ///         revenue, collected into {protocolFees}.
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

    /// @notice Stakes of Digs not yet claimed, held for the win refund. The
    ///         house's maximum outflow on any Dig is exactly what it holds here
    ///         for that Dig — solvency by construction, no bankroll needed.
    uint256 public escrow;

    /// @notice Rolling Bonanza pot, fed by 50% of every losing stake.
    uint256 public bonanzaPot;

    /// @notice House liquidity: 49% of every losing stake. Owed to nobody —
    ///         withdrawable via {withdrawBankroll} for buyback/liquidity.
    uint256 public bankroll;

    /// @notice Accrued protocol fees (1% of losing stakes), withdrawable via
    ///         {withdrawFees}.
    uint256 public protocolFees;

    /// @notice Lifetime $SHARD minted to each player (wins + consolation).
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
    event BankrollWithdrawn(address indexed to, uint256 amount);
    event SurplusWithdrawn(address indexed to, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event Shutdown(address indexed to, uint256 amount);
    event OwnerUpdated(address indexed owner);

    // --------------------------------------------------------------- errors --

    error NotOwner();
    error ZeroAddress();
    error InvalidGridSize();
    error StakeBelowMinimum();
    error UnknownBet();
    error NotYourBet();
    error AlreadyClaimed();
    error BonanzaAlreadyPaid();
    error BadAttestation();
    error NothingToWithdraw();
    error TransferFailed();

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    // ---------------------------------------------------------- constructor --

    constructor(address shard_, uint8 gridSize_, uint256 minStake_) {
        require(shard_ != address(0), ZeroAddress());
        // `> BONANZA_INDEX` (not `>= 2`): a grid too small to contain the
        // golden deposit would still take the pot cut on every loss but
        // could never trigger a Bonanza, locking the pot forever.
        require(gridSize_ > BONANZA_INDEX && gridSize_ <= MAX_GRID_SIZE, InvalidGridSize());
        require(minStake_ != 0, StakeBelowMinimum());

        shard = IShardMintable(shard_);
        gridSize = gridSize_;
        minStake = minStake_;
        owner = msg.sender;
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
    ///      is the per-tile amount times `gridSize`. The whole stake stays in
    ///      escrow until claimed: a win refunds it, a loss splits it.
    /// @return betId Id of the new Dig.
    function bet(bytes calldata encryptedPick, BetKind kind) external payable returns (uint256 betId) {
        uint256 budget = incoFeeBudget(kind);
        require(msg.value > budget, StakeBelowMinimum());
        uint256 stake = msg.value - budget;
        require(stake >= minStake * coverageOf(kind), StakeBelowMinimum());
        escrow += stake;

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
    ///         win bit, attested by the Inco covalidators.
    /// @dev Win: the escrowed stake is refunded and $SHARD mints at the kind's
    ///      multiplier (`All` mints zero — a riskless kind must not farm).
    ///      Loss: the stake splits 50% pot / 49% house / 1% fee and the player
    ///      mints consolation $SHARD.
    function claim(uint256 betId, bool won, bytes[] calldata signatures) external {
        Bet storage b = _betAt(betId);
        require(msg.sender == b.player, NotYourBet());
        require(!b.claimed, AlreadyClaimed());
        require(e.verifyDecryption(b.encWon, won, signatures), BadAttestation());

        b.claimed = true;
        escrow -= b.stake;

        uint256 shardMinted;
        if (won) {
            shardMinted = shardWinOf(b.stake, b.kind);
        } else {
            uint256 potCut = (b.stake * uint256(BONANZA_LOSS_BPS)) / uint256(BPS_DENOMINATOR);
            uint256 feeCut = (b.stake * uint256(PROTOCOL_FEE_BPS)) / uint256(BPS_DENOMINATOR);
            bonanzaPot += potCut;
            protocolFees += feeCut;
            bankroll += b.stake - potCut - feeCut;
            shardMinted = shardLossOf(b.stake);
        }

        if (shardMinted != 0) {
            shard.mint(msg.sender, shardMinted);
            // Lifetime mining score. Deliberately the cumulative minted amount,
            // not the transferable $SHARD balance, so it only grows by playing.
            totalMined[msg.sender] += shardMinted;
        }

        if (won) {
            (bool ok,) = msg.sender.call{value: b.stake}("");
            require(ok, TransferFailed());
        }

        emit Claimed(betId, msg.sender, won, won ? b.stake : 0, shardMinted);
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

    /// @notice $SHARD minted for a winning claim: stake x multiplier x
    ///         {SHARD_SCALE}. `All` always wins, so it mints zero — otherwise a
    ///         riskless kind would print $SHARD for free.
    function shardWinOf(uint256 stake, BetKind kind) public pure returns (uint256) {
        if (kind == BetKind.All) return 0;
        uint256 mult = kind == BetKind.Pick ? uint256(STRAIGHT_MULT_BPS) : uint256(EVEN_ODD_MULT_BPS);
        return (stake * mult * SHARD_SCALE) / uint256(MULT_DENOMINATOR);
    }

    /// @notice Consolation $SHARD minted on a losing claim:
    ///         stake-scale x {CONSOLATION_BPS}.
    function shardLossOf(uint256 stake) public pure returns (uint256) {
        return ((stake * SHARD_SCALE) * uint256(CONSOLATION_BPS)) / uint256(BPS_DENOMINATOR);
    }

    /// @notice ETH to add on top of the stake in {bet} to cover Inco compute
    ///         fees. Two fee-bearing ops per Dig plus one unit of headroom.
    function incoFeeBudget(BetKind) public pure returns (uint256) {
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

    /// @notice ETH in this contract not owed to players, the pot, fees or the
    ///         house ledger — the accumulated Inco fee buffer, minus the floor
    ///         kept for in-flight Digs.
    function surplusETH() public view returns (uint256) {
        uint256 owed = escrow + bonanzaPot + protocolFees + bankroll + inco.getFee() * INCO_FEE_FLOOR_UNITS;
        uint256 balance = address(this).balance;
        return balance > owed ? balance - owed : 0;
    }

    // ---------------------------------------------------------------- admin --

    /// @notice Withdraws the entire house liquidity ledger ({bankroll}) —
    ///         losing stakes accumulated for buyback/liquidity. Owed to nobody,
    ///         so the full amount is safe to take at any time.
    function withdrawBankroll(address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        uint256 amount = bankroll;
        require(amount != 0, NothingToWithdraw());
        bankroll = 0;
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit BankrollWithdrawn(to, amount);
    }

    /// @notice Tops up the Inco fee reserve. Not counted as player-owed ETH.
    receive() external payable {
        emit FeeReserveFunded(msg.sender, msg.value);
    }

    /// @notice Withdraws only {surplusETH} — the fee buffer excess. Cannot touch
    ///         escrow, the Bonanza pot, fees or the house ledger.
    function withdrawSurplus(address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        uint256 amount = surplusETH();
        require(amount != 0, NothingToWithdraw());
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit SurplusWithdrawn(to, amount);
    }

    /// @notice Withdraws the accrued protocol fees. Certain house revenue:
    ///         unlike the loss split it accrues on every losing Dig and never
    ///         touches escrow, the Bonanza pot, or player-owed ETH.
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), ZeroAddress());
        uint256 amount = protocolFees;
        require(amount != 0, NothingToWithdraw());
        protocolFees = 0;
        (bool ok,) = to.call{value: amount}("");
        require(ok, TransferFailed());
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Retires this instance and sends its ENTIRE balance — escrow,
    ///         pot, fees, house ledger and fee reserve — to `to`. Deliberately
    ///         bypasses the accounting ledgers, which exist to shield live
    ///         players: they would otherwise strand house funds forever on a
    ///         superseded deployment. Has no sensible use on a live instance
    ///         with unclaimed Digs.
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
