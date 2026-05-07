// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20, RitualFactory, RitualRouter, WrappedRitual} from "../contracts/RitualSwap.sol";
import {RitualBTC, RitualETH, RitualUSDC, RitualUSDT} from "../contracts/RitualTokens.sol";

contract DeployRitualSwap is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        WrappedRitual wrappedRitual = new WrappedRitual();
        MockERC20 rBTC = MockERC20(address(new RitualBTC()));
        MockERC20 rETH = MockERC20(address(new RitualETH()));
        MockERC20 rUSDC = MockERC20(address(new RitualUSDC()));
        MockERC20 rUSDT = MockERC20(address(new RitualUSDT()));
        RitualFactory factory = new RitualFactory();
        RitualRouter router = new RitualRouter(address(factory), address(wrappedRitual));

        rBTC.mint(deployer, 1_000_000 ether);
        rETH.mint(deployer, 1_000_000 ether);
        rUSDC.mint(deployer, 1_000_000 * 1e6);
        rUSDT.mint(deployer, 1_000_000 * 1e6);

        vm.stopBroadcast();

        console.log("NEXT_PUBLIC_WRITUAL=%s", address(wrappedRitual));
        console.log("NEXT_PUBLIC_RBTC=%s", address(rBTC));
        console.log("NEXT_PUBLIC_RETH=%s", address(rETH));
        console.log("NEXT_PUBLIC_RUSDC=%s", address(rUSDC));
        console.log("NEXT_PUBLIC_RUSDT=%s", address(rUSDT));
        console.log("NEXT_PUBLIC_DEX_FACTORY=%s", address(factory));
        console.log("NEXT_PUBLIC_DEX_ROUTER=%s", address(router));
    }
}
