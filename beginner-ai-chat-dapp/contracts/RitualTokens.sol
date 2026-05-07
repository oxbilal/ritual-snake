// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./RitualSwap.sol";

contract RitualBTC is MockERC20 {
    constructor() MockERC20("Ritual BTC", "rBTC", 18) {}
}

contract RitualETH is MockERC20 {
    constructor() MockERC20("Ritual ETH", "rETH", 18) {}
}

contract RitualUSDC is MockERC20 {
    constructor() MockERC20("Ritual USDC", "rUSDC", 6) {}
}

contract RitualUSDT is MockERC20 {
    constructor() MockERC20("Ritual USDT", "rUSDT", 6) {}
}
