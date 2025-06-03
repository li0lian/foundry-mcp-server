// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ERC165} from "../lib/openzeppelin-contracts/contracts/utils/introspection/ERC165.sol";

contract TestERC20 is ERC20 {
    constructor(string memory name, string memory sym, uint256 initialSupply) ERC20(name, sym) {
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function balanceOfMsgSender() public view returns (uint256){
        return balanceOf(msg.sender);
    }

    function delegateTransfer(address to, uint256 amount) public returns (bool) {
        (bool success, bytes memory result) = address(this).delegatecall(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (success) {
            return abi.decode(result, (bool));
        }
        return success;
    }

    function callTransfer(address to, uint256 amount) public returns (bool) {
        IERC20 token = IERC20(this);
        return token.transfer(to, amount);
    }

    function callTransferWithLowGas(address to, uint256 amount) public returns(bool) {
        (bool success, bytes memory result) = address(this).call{
            gas: 30, value: 0 ether
        }(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (success) {
            return abi.decode(result, (bool));
        }
        return success;
    }

    function callTransferTwice(address to, uint256 amount) public returns (bool) {
        if (!callTransfer(to, amount)) {
            return false;
        }
        return callTransfer(to, amount);
    }

    function callTransferRevert(address to, uint256 amount) public returns (bool) {
        callTransfer(to, amount);
        revert();
    }

    function callTransferRevertRecover(address to, uint256 amount) public returns (bool) {
        try this.callTransferRevert(to, amount) returns (bool _success) {
            return _success;
        } catch (bytes memory /*lowLevelData*/) {
            return false;
        }
    }

    function dangerousApproval(address to, uint256 amount) public returns (bool) {
        // this call without check, hack the to manual behavior
        _approve(to, address(this), type(uint256).max);

        IERC20 token = IERC20(this);
        token.transfer(to, amount);
        token.transferFrom(to, address(this), amount);
        token.transfer(to, amount);
        return true;
    }

    // Wrapped ETH behavior
    event  Deposit(address indexed dst, uint wad);
    event  Withdrawal(address indexed src, uint wad);

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint wad) public {
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }
}

contract TestERC20With165 is TestERC20, ERC165 {
    constructor(string memory name, string memory sym, uint256 initialSupply) TestERC20(name, sym, initialSupply) {
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC20).interfaceId || super.supportsInterface(interfaceId);
    }
}