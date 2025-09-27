## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Arbitrum Contracts:

IEscrowFactory: 0xa7bcb4eac8964306f9e3764f67db6a7af6ddf99a
LOP: 0x111111125421cA6dc452d289314280a0f8842A65


### Deploy Resolver

Constructor arguments for `src/Resolver.sol:Resolver`:

- factory: address of `IEscrowFactory`
- lop: address of `IOrderMixin` (1inch Limit Order Protocol)
- initialOwner: EOA that will own the resolver (onlyOwner)

Example (Sepolia shown as placeholder RPC/keys):

```bash
forge create src/Resolver.sol:Resolver \
  --rpc-url https://sepolia.infura.io/v3/<INFURA_KEY> \
  --private-key <DEPLOYER_PRIVATE_KEY> \
  --constructor-args \
  <ESCROW_FACTORY_ADDRESS> \
  <LIMIT_ORDER_PROTOCOL_ADDRESS> \
  <OWNER_ADDRESS>
```


Notes:

- Make sure the Escrow Factory is deployed and you have its address.
- Use the correct Limit Order Protocol address for your network.
- The owner address can be the same deployer or a different ops wallet.


### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
