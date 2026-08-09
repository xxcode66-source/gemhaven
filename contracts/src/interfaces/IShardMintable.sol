// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title IShardMintable
/// @notice The single hook `GemHaven` needs on `$SHARD`.
interface IShardMintable {
    function mint(address to, uint256 amount) external;
}
