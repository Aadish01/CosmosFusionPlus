// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import {IOrderMixin} from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import {TakerTraits} from "limit-order-protocol/contracts/libraries/TakerTraitsLib.sol";

import {IResolverExample} from "../lib/cross-chain-swap/contracts/interfaces/IResolverExample.sol";
import {RevertReasonForwarder} from "../lib/cross-chain-swap/lib/solidity-utils/contracts/libraries/RevertReasonForwarder.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IBaseEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";
import {TimelocksLib, Timelocks} from "../lib/cross-chain-swap/contracts/libraries/TimelocksLib.sol";
import {Address} from "solidity-utils/contracts/libraries/AddressLib.sol";
import {IEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IEscrow.sol";
import {ImmutablesLib} from "../lib/cross-chain-swap/contracts/libraries/ImmutablesLib.sol";

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @title Resolver contract for cross-chain swap with arbitrary calls support.
 * @dev Extends original Resolver with ability to execute arbitrary calls before/after main operations.
 * This enables integration with DEX aggregators and other protocols.
 */
contract Resolver is Ownable {
    using ImmutablesLib for IBaseEscrow.Immutables;
    using TimelocksLib for Timelocks;
    using SafeERC20 for IERC20;

    error InvalidLength();
    error LengthMismatch();
    error InvalidAmount();
    error TransferFailed();

    IEscrowFactory private immutable _FACTORY;
    IOrderMixin private immutable _LOP;

    constructor(IEscrowFactory factory, IOrderMixin lop, address initialOwner) Ownable(initialOwner) {
        _FACTORY = factory;
        _LOP = lop;
    }

    receive() external payable {} // solhint-disable-line no-empty-blocks

    /**
     * @notice Deploy source escrow (same as original)
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args
    ) external payable onlyOwner {

        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        address computed = _FACTORY.addressOfEscrowSrc(immutablesMem);

        (bool success,) = address(computed).call{value: immutablesMem.safetyDeposit}("");
        if (!success) revert IBaseEscrow.NativeTokenSendingFailure();

        // _ARGS_HAS_TARGET = 1 << 251
        takerTraits = TakerTraits.wrap(TakerTraits.unwrap(takerTraits) | uint256(1 << 251));
        bytes memory argsMem = abi.encodePacked(computed, args);
        _LOP.fillOrderArgs(order, r, vs, amount, takerTraits, argsMem);
    }

    /**
     * @notice Deploy destination escrow with optional arbitrary calls
     * @param targets Array of contract addresses to call
     * @param callsData Array of call data for each target
     * @param dstImmutables Destination escrow immutables
     * @param srcCancellationTimestamp Source cancellation timestamp
     */
    function deployDst(
        address[] calldata targets,
        bytes[] calldata callsData,
        IBaseEscrow.Immutables calldata dstImmutables,
        uint256 srcCancellationTimestamp
    ) external onlyOwner payable {
        // Execute arbitrary calls first (swaps, approvals, etc.)
        if (targets.length > 0) {
            arbitraryCalls(targets, callsData);
        }

        // Then create destination escrow
        _FACTORY.createDstEscrow{value: msg.value}(dstImmutables, srcCancellationTimestamp);
    }

    /**
     * @notice Withdraw from escrow with optional arbitrary calls
     * @param escrow Escrow contract address
     * @param secret Secret for withdrawal
     * @param immutables Escrow immutables
     * @param targets Array of contract addresses to call after withdrawal
     * @param callsData Array of call data for each target
     */
    function withdraw(
        IEscrow escrow,
        bytes32 secret,
        IBaseEscrow.Immutables calldata immutables,
        address[] calldata targets,
        bytes[] calldata callsData
    ) external {
        // Withdraw first
        escrow.withdraw(secret, immutables);

        // Then execute arbitrary calls (swaps, etc.)
        if (targets.length > 0) {
            arbitraryCalls(targets, callsData);
        }
    }

    /**
     * @notice Cancel escrow with optional arbitrary calls
     * @param escrow Escrow contract address
     * @param immutables Escrow immutables
     * @param targets Array of contract addresses to call after cancellation
     * @param callsData Array of call data for each target
     */
    function cancel(
        IEscrow escrow,
        IBaseEscrow.Immutables calldata immutables,
        address[] calldata targets,
        bytes[] calldata callsData
    ) external {
        // Cancel first
        escrow.cancel(immutables);

        // Then execute arbitrary calls (reverse swaps, etc.)
        if (targets.length > 0) {
            arbitraryCalls(targets, callsData);
        }
    }

    /**
     * @notice Execute arbitrary calls to external contracts
     * @param targets Array of contract addresses to call
     * @param callsData Array of call data for each target
     */
    function arbitraryCalls(address[] calldata targets, bytes[] calldata callsData) public onlyOwner {
        uint256 length = targets.length;
        if (targets.length != callsData.length) revert LengthMismatch();
        for (uint256 i = 0; i < length; ++i) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = targets[i].call(callsData[i]);
            if (!success) RevertReasonForwarder.reRevert();
        }
    }

    /**
     * @notice Withdraw tokens or native currency from the contract
     * @param token Token contract address (use address(0) for native tokens)
     * @param to Recipient address
     * @param amount Amount to withdraw (0 = withdraw all)
     */
    function withdrawFunds(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAmount();

        if (token == address(0)) {
            // Withdraw native tokens (ETH/XTZ)
            uint256 contractBalance = address(this).balance;
            uint256 withdrawAmount = amount == 0 ? contractBalance : amount;

            if (withdrawAmount == 0 || withdrawAmount > contractBalance) revert InvalidAmount();

            (bool success,) = payable(to).call{value: withdrawAmount}("");
            if (!success) revert TransferFailed();
        } else {
            // Withdraw ERC20 tokens
            IERC20 tokenContract = IERC20(token);
            uint256 contractBalance = tokenContract.balanceOf(address(this));
            uint256 withdrawAmount = amount == 0 ? contractBalance : amount;

            if (withdrawAmount == 0 || withdrawAmount > contractBalance) revert InvalidAmount();

            tokenContract.safeTransfer(to, withdrawAmount);
        }
    }
}