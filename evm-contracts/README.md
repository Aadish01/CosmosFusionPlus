## EVM contracts Overview

### EscrowSrc

Contract to initially lock funds and then unlock them with verification of the secret presented. Funds are locked in at the time of contract deployment.

| Method | Description | Time Interval |
|--------|-------------|---------------|
| `withdraw(bytes32 secret, Immutables calldata immutables)` | Allows the taker to withdraw funds by providing the correct secret | After SrcWithdrawal timelock and before SrcCancellation timelock |
| `withdrawTo(bytes32 secret, address target, Immutables calldata immutables)` | Allows the taker to withdraw funds to a specified target address | After SrcWithdrawal timelock and before SrcCancellation timelock |
| `publicWithdraw(bytes32 secret, Immutables calldata immutables)` | Allows access token holders to withdraw funds on behalf of the taker | After SrcPublicWithdrawal timelock and before SrcCancellation timelock |
| `cancel(Immutables calldata immutables)` | Allows the taker to cancel the escrow and return funds to the maker | After SrcCancellation timelock |
| `publicCancel(Immutables calldata immutables)` | Allows access token holders to cancel the escrow on behalf of the maker | After SrcPublicCancellation timelock |

### EscrowDst

Contract to initially lock funds and then unlock them with verification of the secret presented. Funds are locked in at the time of contract deployment when the taker calls the `EscrowFactory.createDstEscrow` function.

| Method | Description | Time Interval |
|--------|-------------|---------------|
| `withdraw(bytes32 secret, Immutables calldata immutables)` | Allows the taker to withdraw funds by providing the correct secret | After DstWithdrawal timelock and before DstCancellation timelock |
| `publicWithdraw(bytes32 secret, Immutables calldata immutables)` | Allows access token holders to withdraw funds on behalf of the taker | After DstPublicWithdrawal timelock and before DstCancellation timelock |
| `cancel(Immutables calldata immutables)` | Allows the taker to cancel the escrow and return funds to themselves | After DstCancellation timelock |
