// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {MockERC20, RitualRouter, WrappedRitual} from "../contracts/RitualSwap.sol";

contract SeedLiquidity is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address router = vm.envAddress("NEXT_PUBLIC_DEX_ROUTER");
        address wrappedRitual = vm.envAddress("NEXT_PUBLIC_WRITUAL");
        address rBTC = vm.envAddress("NEXT_PUBLIC_RBTC");
        address rETH = vm.envAddress("NEXT_PUBLIC_RETH");
        address rUSDC = vm.envAddress("NEXT_PUBLIC_RUSDC");
        address rUSDT = vm.envAddress("NEXT_PUBLIC_RUSDT");

        vm.startBroadcast(deployerPrivateKey);

        WrappedRitual(payable(wrappedRitual)).deposit{value: 0.04 ether}();

        MockERC20(wrappedRitual).approve(router, type(uint256).max);
        MockERC20(rBTC).approve(router, type(uint256).max);
        MockERC20(rETH).approve(router, type(uint256).max);
        MockERC20(rUSDC).approve(router, type(uint256).max);
        MockERC20(rUSDT).approve(router, type(uint256).max);

        RitualRouter(router).addLiquidity(wrappedRitual, rBTC, 0.01 ether, 100 ether, deployer);
        RitualRouter(router).addLiquidity(wrappedRitual, rETH, 0.01 ether, 100 ether, deployer);
        RitualRouter(router).addLiquidity(wrappedRitual, rUSDC, 0.01 ether, 100 * 1e6, deployer);
        RitualRouter(router).addLiquidity(wrappedRitual, rUSDT, 0.01 ether, 100 * 1e6, deployer);

        vm.stopBroadcast();
    }
}
