// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {GemHaven} from "../src/GemHaven.sol";
import {ShardToken} from "../src/ShardToken.sol";

/// @title Deploy — wires ShardToken and GemHaven together in one run
/// @dev Usage:
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url base_sepolia --broadcast --verify
///      Reads configuration from the environment (see .env.example).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        uint8 gridSize = uint8(vm.envOr("GRID_SIZE", uint256(36)));
        uint256 minStake = vm.envOr("MIN_STAKE_WEI", uint256(0.001 ether));
        uint256 bankrollSeed = vm.envOr("BANKROLL_SEED_WEI", uint256(0.05 ether));
        uint256 feeReserve = vm.envOr("INCO_FEE_RESERVE_WEI", uint256(0.001 ether));

        vm.startBroadcast(pk);

        ShardToken shard = new ShardToken();

        // `bankrollSeed` is the starting bankroll that pays winning Digs; it is
        // the constructor's `msg.value` and is accounted separately from fees.
        GemHaven gemHaven = new GemHaven{value: bankrollSeed}(address(shard), gridSize, minStake);

        // `feeReserve` prefunds the Inco compute-fee buffer so the very first
        // Dig can draw its Motherlode before any fee top-ups accrue. Plain
        // transfer: `receive()` credits the fee reserve, never the bankroll.
        payable(address(gemHaven)).transfer(feeReserve);

        shard.setMinter(address(gemHaven));

        vm.stopBroadcast();

        console2.log("chain id              ", block.chainid);
        console2.log("deployer              ", deployer);
        console2.log("ShardToken            ", address(shard));
        console2.log("GemHaven              ", address(gemHaven));
        console2.log("gridSize              ", gridSize);
        console2.log("minStake (wei)        ", minStake);
        console2.log("bankroll seed (wei)   ", bankrollSeed);
        console2.log("incoFeeBudget (wei)   ", gemHaven.incoFeeBudget(GemHaven.BetKind.Pick));
        console2.log("");
        console2.log("Set these in frontend/.env.local:");
        console2.log("  NEXT_PUBLIC_GEMHAVEN_ADDRESS=", address(gemHaven));
        console2.log("  NEXT_PUBLIC_SHARD_ADDRESS=   ", address(shard));
    }
}
