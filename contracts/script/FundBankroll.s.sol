// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IFundable {
    function fundBankroll() external payable;
    function bankroll() external view returns (uint256);
    function maxStake() external view returns (uint256);
}

/// @title FundBankroll — tops up the live bankroll from the deployer
/// @dev Set TOPUP_WEI in contracts/.env (defaults to 0.0005 ether). Usage:
///        forge script script/FundBankroll.s.sol:FundBankroll --rpc-url base_sepolia --broadcast
contract FundBankroll is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 topup = vm.envOr("TOPUP_WEI", uint256(0.0005 ether));
        IFundable haven = IFundable(0xe7eb298AfEE79F40f35CEfdCFcccBCBcC2754411); // v2.7

        vm.startBroadcast(pk);
        haven.fundBankroll{value: topup}();
        vm.stopBroadcast();

        console2.log("topup (wei)        ", topup);
        console2.log("bankroll now (wei) ", haven.bankroll());
        console2.log("maxStake now (wei) ", haven.maxStake());
    }
}
