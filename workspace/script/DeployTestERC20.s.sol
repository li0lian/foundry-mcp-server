// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC20} from "../src/TestERC20.sol";

/**
 * @title DeployTestERC20Script
 * @notice Script to deploy TestERC20 token with customizable parameters via environment variables
 * @dev Environment variables:
 *      - TOKEN_NAME: Name of the token (default: "Test ERC20 Token")
 *      - TOKEN_SYMBOL: Symbol of the token (default: "T20ST")
 *      - TOKEN_SUPPLY: Initial supply in base units before decimals (default: 1000000)
 *
 * @dev Run with:
 *      forge_script scriptPath="script/DeployTestERC20.s.sol" rpcUrl="http://localhost:8545" broadcast=true
 *      
 *      Or with custom values:
 *      TOKEN_NAME="My Token" TOKEN_SYMBOL="MTK" TOKEN_SUPPLY="5000000" \
 *      forge_script scriptPath="script/DeployTestERC20.s.sol" rpcUrl="http://localhost:8545" broadcast=true
 */
contract DeployTestERC20Script is Script {
    function run() public returns (TestERC20) {
        // Read environment variables with fallback values
        string memory name = vm.envOr("TOKEN_NAME", string("Test ERC20 Token"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("T20ST"));
        uint256 initialSupply = vm.envOr("TOKEN_SUPPLY", uint256(1_000_000));
        
        // Log deployment parameters
        console.log("Deploying ERC20 token with parameters:");
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Initial Supply:", initialSupply);
        
        // Start broadcasting transactions
        vm.startBroadcast();
        
        // Deploy TestERC20 with parameters
        // Note: The token has 6 decimals, so we multiply by 10^6
        TestERC20 token = new TestERC20(name, symbol, initialSupply * 10**6);
        
        // Stop broadcasting transactions
        vm.stopBroadcast();
        
        // Log information about deployed contract
        console.log("TestERC20 deployed at:", address(token));
        console.log("Name:", token.name());
        console.log("Symbol:", token.symbol());
        console.log("Decimals:", token.decimals());
        console.log("Total Supply:", token.totalSupply());
        console.log("Deployer balance:", token.balanceOf(msg.sender));
        
        return token;
    }
}
