// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC1155} from "../src/TestERC1155.sol";

/**
 * @title DeployERC1155Script
 * @notice Script to deploy TestERC1155 token with customizable parameters via environment variables
 * 
 * @dev Environment variables:
 *      - ERC1155_NAME: Name of the ERC1155 collection (currently not used but included for future updates)
 *      - ERC1155_SYMBOL: Symbol of the ERC1155 collection (currently not used but included for future updates)
 *      - ERC1155_TOKEN_IDS: Comma-separated list of token IDs to mint (default: "0,1,2")
 *      - ERC1155_QUANTITIES: Comma-separated list of quantities for each token ID (default: "10,5,1")
 *      - ERC1155_BASE_URI: Base URI for token metadata (currently hardcoded in contract)
 *
 * @dev Run with:
 *      forge_script scriptPath="script/DeployERC1155.s.sol" rpcUrl="http://localhost:8545" broadcast=true
 *      
 *      Or with custom values:
 *      ERC1155_NAME="My Multi Token" ERC1155_SYMBOL="MMT" ERC1155_TOKEN_IDS="100,200,300" ERC1155_QUANTITIES="50,25,10" ERC1155_BASE_URI="https://my-api.com/tokens/" \
 *      forge_script scriptPath="script/DeployERC1155.s.sol" rpcUrl="http://localhost:8545" broadcast=true
 */
contract DeployERC1155Script is Script {
    function run() public returns (TestERC1155) {
        // Read environment variables with fallback values
        string memory name = vm.envOr("ERC1155_NAME", string("Test ERC1155 Collection"));
        string memory symbol = vm.envOr("ERC1155_SYMBOL", string("T1155"));
        string memory baseUri = vm.envOr("ERC1155_BASE_URI", string("http://localhost/erc1155/{id}.json"));
        
        // Parse token IDs and quantities
        string memory tokenIdStr = vm.envOr("ERC1155_TOKEN_IDS", string("0,1,2"));
        string memory quantityStr = vm.envOr("ERC1155_QUANTITIES", string("10,5,1"));
        
        // Parse token IDs from comma-separated string
        string[] memory tokenIdParts = splitString(tokenIdStr, ",");
        uint256[] memory tokenIds = new uint256[](tokenIdParts.length);
        for (uint i = 0; i < tokenIdParts.length; i++) {
            tokenIds[i] = stringToUint(tokenIdParts[i]);
        }
        
        // Parse quantities from comma-separated string
        string[] memory quantityParts = splitString(quantityStr, ",");
        uint256[] memory quantities = new uint256[](quantityParts.length);
        for (uint i = 0; i < quantityParts.length && i < tokenIds.length; i++) {
            quantities[i] = stringToUint(quantityParts[i]);
        }
        
        // Log deployment parameters
        console.log("Deploying ERC1155 token collection:");
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Default Base URI (in contract):", baseUri);
        
        console.log("Token IDs to mint:");
        for (uint i = 0; i < tokenIds.length; i++) {
            if (i < quantities.length) {
                console.log("  ID:", tokenIds[i], "Quantity:", quantities[i]);
            } else {
                console.log("  ID:", tokenIds[i], "Quantity: <missing>");
            }
        }
        
        // Start broadcasting transactions
        vm.startBroadcast();
        
        // Deploy TestERC1155
        TestERC1155 token = new TestERC1155();
        
        // Mint custom token IDs
        for (uint i = 0; i < tokenIds.length; i++) {
            // Skip token IDs that are already minted in the constructor (0, 1, 2)
            if (tokenIds[i] != 0 && tokenIds[i] != 1 && tokenIds[i] != 2) {
                uint256 quantity = i < quantities.length ? quantities[i] : 1;
                token.mint(msg.sender, tokenIds[i], quantity);
            }
        }
        
        // Stop broadcasting transactions
        vm.stopBroadcast();
        
        // Log information about deployed contract
        console.log("TestERC1155 deployed at:", address(token));
        
        // Log URI and balances
        for (uint i = 0; i < tokenIds.length; i++) {
            console.log("Token URI for ID", tokenIds[i], ":", token.uri(tokenIds[i]));
            console.log("Balance of deployer for token ID", tokenIds[i], ":", token.balanceOf(msg.sender, tokenIds[i]));
        }
        
        // Log roles
        bytes32 minterRole = token.MINTER_ROLE();
        bytes32 pauserRole = token.PAUSER_ROLE();
        console.log("Deployer has MINTER_ROLE:", token.hasRole(minterRole, msg.sender));
        console.log("Deployer has PAUSER_ROLE:", token.hasRole(pauserRole, msg.sender));
        
        return token;
    }
    
    // Helper function to split a string by delimiter
    function splitString(string memory str, string memory delimiter) internal pure returns (string[] memory) {
        // Count occurrences of delimiter to determine array size
        uint count = 1;
        for (uint i = 0; i < bytes(str).length; i++) {
            if (bytes(str)[i] == bytes(delimiter)[0]) {
                count++;
            }
        }
        
        string[] memory parts = new string[](count);
        uint partIndex = 0;
        uint lastIndex = 0;
        
        for (uint i = 0; i < bytes(str).length; i++) {
            if (bytes(str)[i] == bytes(delimiter)[0]) {
                parts[partIndex] = substring(str, lastIndex, i);
                lastIndex = i + 1;
                partIndex++;
            }
        }
        
        // Add the last part
        if (lastIndex < bytes(str).length) {
            parts[partIndex] = substring(str, lastIndex, bytes(str).length);
        }
        
        return parts;
    }
    
    // Helper function to extract substring
    function substring(string memory str, uint startIndex, uint endIndex) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }
    
    // Helper function to convert string to uint
    function stringToUint(string memory s) internal pure returns (uint) {
        bytes memory b = bytes(s);
        uint result = 0;
        for (uint i = 0; i < b.length; i++) {
            if (b[i] >= 0x30 && b[i] <= 0x39) {
                result = result * 10 + (uint(uint8(b[i])) - 48);
            }
        }
        return result;
    }
} 