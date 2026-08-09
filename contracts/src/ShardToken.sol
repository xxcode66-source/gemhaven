// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title ShardToken — the `$SHARD` reward token for GemHaven
/// @notice Minimal, dependency-free ERC20. Minting is gated to a single
///         address (the `GemHaven` game contract), set once by the deployer.
/// @dev Deliberately not OpenZeppelin: `$SHARD` needs nothing beyond transfer
///      accounting and a one-shot minter, and keeping it dependency-free makes
///      the whole reward path auditable in one screen.
contract ShardToken {
    string public constant name = "GemHaven Shard";
    string public constant symbol = "SHARD";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    /// @notice The only address allowed to mint. Set once via {setMinter}.
    address public minter;
    /// @notice Deployer; may call {setMinter} exactly once, then loses all power.
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterSet(address indexed minter);

    error NotOwner();
    error NotMinter();
    error MinterAlreadySet();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Binds `$SHARD` minting to the GemHaven game contract. One-shot.
    /// @param minter_ The `GemHaven` address.
    function setMinter(address minter_) external {
        require(msg.sender == owner, NotOwner());
        require(minter == address(0), MinterAlreadySet());
        require(minter_ != address(0), ZeroAddress());
        minter = minter_;
        owner = address(0); // no admin surface survives deployment
        emit MinterSet(minter_);
    }

    /// @notice Mints `$SHARD`. Callable only by `GemHaven`, only on a winning claim.
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, NotMinter());
        require(to != address(0), ZeroAddress());
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, InsufficientAllowance());
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), ZeroAddress());
        uint256 balance = balanceOf[from];
        require(balance >= amount, InsufficientBalance());
        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
