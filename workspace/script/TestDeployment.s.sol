// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC20} from "./TestERC20.sol";

contract TestDeploymentScript is Script {
    function run() public returns (TestERC20) {
        // Start broadcasting transactions
        vm.startBroadcast();
        
        // Deploy TestERC20 with initial parameters
        // Name: "Test Token", Symbol: "TST", Initial Supply: 1,000,000 tokens (with 6 decimals)
        TestERC20 token = new TestERC20("Test Token", "TST", 1_000_000 * 10**6);
        
        // Stop broadcasting transactions
        vm.stopBroadcast();
        
        // Log information about deployed contract
        console.log("TestERC20 deployed at:", address(token));
        console.log("Name:", token.name());
        console.log("Symbol:", token.symbol());
        console.log("Decimals:", token.decimals());
        console.log("Total Supply:", token.totalSupply());
        
        return token;
    }
} 