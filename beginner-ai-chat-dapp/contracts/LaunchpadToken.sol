// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LaunchpadToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint256 totalSupply_, address owner_) {
        require(bytes(name_).length > 0, "Token: name required");
        require(bytes(symbol_).length > 0, "Token: symbol required");
        require(totalSupply_ > 0, "Token: supply required");
        require(owner_ != address(0), "Token: owner required");

        name = name_;
        symbol = symbol_;
        totalSupply = totalSupply_;
        balanceOf[owner_] = totalSupply_;
        emit Transfer(address(0), owner_, totalSupply_);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "Token: insufficient allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "Token: zero address");
        require(balanceOf[from] >= value, "Token: insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
