// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestERC721} from "../src/TestERC721.sol";

/**
 * @title DeployERC721Script
 * @notice Script to deploy TestERC721 token (NFT) with customizable parameters via environment variables
 * @dev Environment variables:
 *      - NFT_NAME: Name of the NFT collection (default: "Test NFT Collection")
 *      - NFT_SYMBOL: Symbol of the NFT collection (default: "TNFT")
 *      - NFT_TOKEN_ID: Custom token ID to mint (default: 1)
 *
 * @dev Run with:
 *      forge_script scriptPath="script/DeployERC721.s.sol" rpcUrl="http://localhost:8545" broadcast=true
 *      
 *      Or with custom values:
 *      NFT_NAME="My NFT Collection" NFT_SYMBOL="MNFT" NFT_TOKEN_ID="42" \
 *      forge_script scriptPath="script/DeployERC721.s.sol" rpcUrl="http://localhost:8545" broadcast=true
 */
contract DeployERC721Script is Script {
    function run() public returns (TestERC721) {
        // Read environment variables with fallback values
        string memory name = vm.envOr("NFT_NAME", string("Test NFT Collection"));
        string memory symbol = vm.envOr("NFT_SYMBOL", string("T721NFT"));
        uint256 tokenId = vm.envOr("NFT_TOKEN_ID", uint256(1));
        
        // Log deployment parameters
        console.log("Deploying ERC721 NFT collection with parameters:");
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Custom Token ID:", tokenId);
        
        // Start broadcasting transactions
        vm.startBroadcast();
        
        // Deploy TestERC721 with parameters
        TestERC721 nft = new TestERC721(name, symbol);
        
        // Mint the custom token ID if it's not already minted
        // Note: The constructor already mints token IDs 0-5
        if (tokenId > 5) {
            nft.mint(msg.sender, tokenId);
        }
        
        // Stop broadcasting transactions
        vm.stopBroadcast();
        
        // Log information about deployed contract
        console.log("TestERC721 deployed at:", address(nft));
        console.log("Name:", nft.name());
        console.log("Symbol:", nft.symbol());
        console.log("TokenURI for ID", tokenId, ":", nft.tokenURI(tokenId));
        console.log("Owner of token ID", tokenId, ":", nft.ownerOf(tokenId));
        console.log("Balance of deployer:", nft.balanceOf(msg.sender));
        
        return nft;
    }
} 