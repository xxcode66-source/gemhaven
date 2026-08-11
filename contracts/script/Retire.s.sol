// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IRetirable {
    function shutdownTo(address to) external;
}

/// @title Retire — drains a superseded deployment via `shutdownTo` (v2.2+)
/// @dev One-shot maintenance script used to recycle the bankroll into the
///      deployer before redeploying. Usage:
///        forge script script/Retire.s.sol:Retire --rpc-url base_sepolia --broadcast
contract Retire is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        IRetirable retiring = IRetirable(0xEa9fe3914F659902E285968253e17dC67138E0F7); // v2.6

        vm.startBroadcast(pk);
        retiring.shutdownTo(deployer);
        vm.stopBroadcast();

        console2.log("deployer balance (wei)", deployer.balance);
    }
}
