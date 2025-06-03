// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";

contract TestERC721 is ERC721 {
    constructor(string memory name, string memory sym) ERC721(name, sym) {
        _mint(msg.sender, 0);
        _mint(msg.sender, 1);
        _mint(msg.sender, 2);
        _mint(msg.sender, 3);
        _mint(msg.sender, 4);
        _mint(msg.sender, 5);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return "http://localhost/erc721";
    }

    function mint(address account, uint256 token) public {
        _mint(account, token);
    }
}