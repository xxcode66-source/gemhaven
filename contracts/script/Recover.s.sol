// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/// @dev Minimal surface of the superseded GemHaven deployments (v2.0/v2.1).
interface ILegacyGemHaven {
    function surplusETH() external view returns (uint256);
    function withdrawSurplus(address to) external;
}

/// @title Recover — sweeps withdrawable fee-surplus from superseded deployments
/// @dev One-shot maintenance script. Usage:
///        forge script script/Recover.s.sol:Recover --rpc-url base_sepolia --broadcast
contract Recover is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        ILegacyGemHaven legacy = ILegacyGemHaven(0x15eCDaA0f519F71a9cbc8AdBA80f69cCe8091f84); // v2.1
        ILegacyGemHaven older = ILegacyGemHaven(0xD5218Eb768A0D7Dc5DBbd495dE9437795908d5b4); // v2.0
        ILegacyGemHaven oldest = ILegacyGemHaven(0xc7134F764DdE05f265614EbAD9a7A0c7E71a737d); // v1

        vm.startBroadcast(pk);

        uint256 s1 = legacy.surplusETH();
        if (s1 != 0) legacy.withdrawSurplus(deployer);
        uint256 s2 = older.surplusETH();
        if (s2 != 0) older.withdrawSurplus(deployer);
        uint256 s3 = oldest.surplusETH();
        if (s3 != 0) oldest.withdrawSurplus(deployer);

        vm.stopBroadcast();

        console2.log("recovered from v2.1 (wei)", s1);
        console2.log("recovered from v2.0 (wei)", s2);
        console2.log("recovered from v1   (wei)", s3);
        console2.log("deployer balance (wei)   ", deployer.balance);
    }
}
