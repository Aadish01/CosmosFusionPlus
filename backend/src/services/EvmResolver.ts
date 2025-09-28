import { Interface, Signature, TransactionRequest, id } from 'ethers';
import type { Log } from 'ethers';
import * as Sdk from '@1inch/cross-chain-sdk';
import logger from '../utils/logger';
import { writeDiagnostics } from '../utils/diagnostics';
import { EvmClient } from './EvmClient';
import { ResolverConfig, EvmSwapOrder } from '../types';

export class EvmResolver {
  private evmClient: EvmClient;
  private config: ResolverConfig;
  private readonly resolverContract = new Interface([
    'function deploySrc((bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables,(uint256 salt, uint256 maker, uint256 receiver, uint256 makerAsset, uint256 takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes args) payable',
    'function deployDst(address[] targets, bytes[] callsData, (bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) dstImmutables, uint256 srcCancellationTimestamp) payable',
    'function withdraw(address escrow, bytes32 secret, (bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, address[] targets, bytes[] callsData)'
  ]);
  private readonly escrowFactoryContract = new Interface([
    'event DstEscrowCreated(address escrow)',
    'event SrcEscrowCreated((bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)'
  ]);

  constructor(evmClient: EvmClient, config: ResolverConfig) {
    this.evmClient = evmClient;
    this.config = config;
    logger.info('EvmResolver initialized', { chainId: config.chainId });
  }

  public async deployEscrowSrc(swapOrder: EvmSwapOrder): Promise<[string, string, bigint]> {
    const fillAmount = swapOrder.order.makingAmount;
    const deploySrcTx = this.createDeploySrcTx(
      this.config.chainId,
      swapOrder.order,
      swapOrder.orderHash,
      swapOrder.signature!,
      Sdk.TakerTraits.default()
        .setExtension(swapOrder.order.extension)
        .setAmountMode(Sdk.AmountMode.maker)
        .setAmountThreshold(swapOrder.order.takingAmount),
      fillAmount
    );
    const gasLimitEnv = process.env.FORCE_GAS_LIMIT;
    if (gasLimitEnv) {
      try { (deploySrcTx as any).gasLimit = BigInt(gasLimitEnv); } catch {}
    }
    await writeDiagnostics('tx-deploy-src.json', {
      to: deploySrcTx.to,
      value: (deploySrcTx.value as any)?.toString?.() || null,
      gasLimit: (deploySrcTx as any).gasLimit ? (deploySrcTx as any).gasLimit.toString() : null,
      data: deploySrcTx.data,
    });
    const { txHash, blockTimestamp, blockHash } = await this.evmClient.send(deploySrcTx);
    const escrowAddress = await this.getSrcEscrowAddress(blockHash);
    console.log("escrowAddress:", escrowAddress);
    return [txHash, escrowAddress, blockTimestamp];
  }

  public async deployEscrowDst(immutables: Sdk.Immutables, srcCancellationTimestamp: bigint): Promise<[string, string, bigint]> {
    const deployDstTx = this.createDeployDstTx(immutables, srcCancellationTimestamp);
    const gasLimitEnv = process.env.FORCE_GAS_LIMIT;
    if (gasLimitEnv) {
      try { (deployDstTx as any).gasLimit = BigInt(gasLimitEnv); } catch {}
    }
    await writeDiagnostics('tx-deploy-dst.json', {
      to: deployDstTx.to,
      value: (deployDstTx.value as any)?.toString?.() || null,
      gasLimit: (deployDstTx as any).gasLimit ? (deployDstTx as any).gasLimit.toString() : null,
      data: deployDstTx.data,
      srcCancellationTimestamp: srcCancellationTimestamp.toString(),
    });
    const { txHash, blockTimestamp, blockHash } = await this.evmClient.send(deployDstTx);
    const escrowAddress = await this.getDstEscrowAddress(blockHash);
    return [txHash, escrowAddress, blockTimestamp];
  }

  public async withdrawEscrowSrc(escrowAddress: string, secret: string, immutables: Sdk.Immutables): Promise<string> {
    const withdrawTx = this.createWithdrawTx(escrowAddress, secret, immutables);
    const { txHash } = await this.evmClient.send(withdrawTx);
    return txHash;
  }

  public async withdrawEscrowDst(escrowAddress: string, secret: string, immutables: Sdk.Immutables): Promise<string> {
    const withdrawTx = this.createWithdrawTx(escrowAddress, secret, immutables);
    const { txHash } = await this.evmClient.send(withdrawTx);
    return txHash;
  }

  private createDeploySrcTx(
    chainId: number,
    order: Sdk.EvmCrossChainOrder,
    orderHash: string,
    signature: string,
    takerTraits: Sdk.TakerTraits,
    amount: bigint,
    hashLock = order.escrowExtension.hashLockInfo
  ): TransactionRequest {
    const { r, yParityAndS: vs } = Signature.from(signature);
    const { args, trait } = takerTraits.encode();
    const immutables = order.toSrcImmutables(chainId, Sdk.EvmAddress.fromString(this.config.resolver), amount, hashLock);
    console.log(`order`, order)
    console.log(`immutables`, immutables)
    console.log(`order.build()`, order.build())
    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('deploySrc', [
        { ...immutables.build(), orderHash },
        order.build(),
        r,
        vs,
        amount,
        trait,
        args,
      ]),
      value: order.escrowExtension.srcSafetyDeposit,
    };
  }

  private createDeployDstTx(immutables: Sdk.Immutables, srcCancellationTimestamp: bigint): TransactionRequest {
    const emptyTargets: string[] = [];
    const emptyCalls: string[] = [];
    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('deployDst', [
        emptyTargets,
        emptyCalls,
        immutables.build(),
        immutables.timeLocks.toSrcTimeLocks().privateCancellation,
      ]),
      value: immutables.safetyDeposit,
    };
  }

  private createWithdrawTx(escrow: string, secret: string, immutables: Sdk.Immutables): TransactionRequest {
    return {
      to: this.config.resolver,
      data: this.resolverContract.encodeFunctionData('withdraw', [
        escrow,
        '0x' + secret,
        immutables.build(),
        [],
        [],
      ]),
    };
  }

  private async getDstEscrowAddress(blockHash: string): Promise<string> {
    const event = this.escrowFactoryContract.getEvent('DstEscrowCreated')!;
    const logs: Log[] = await this.evmClient.getProvider().getLogs({
      blockHash,
      address: this.config.escrowFactory,
      topics: [event.topicHash],
    });
    const [data] = logs.map((l: Log) => this.escrowFactoryContract.decodeEventLog(event, l.data));
    const escrow = data.at(0);
    return escrow;
  }

  private async getSrcEscrowAddress(blockHash: string): Promise<string> {
    const [immutables] = await this.getSrcDeployEvent(blockHash);
    const impl = await this.getSourceImpl();
    const srcEscrowAddress = new Sdk.EvmEscrowFactory(Sdk.EvmAddress.fromString(this.config.escrowFactory)).getSrcEscrowAddress(
      immutables,
      impl
    );
    return srcEscrowAddress.toString();
  }

  private async getSrcDeployEvent(blockHash: string): Promise<[Sdk.Immutables<Sdk.EvmAddress>]> {
    const event = this.escrowFactoryContract.getEvent('SrcEscrowCreated')!;
    const logs: Log[] = await this.evmClient.getProvider().getLogs({
      blockHash,
      address: this.config.escrowFactory,
      topics: [event.topicHash],
    });
    const [data] = logs.map((l: Log) => this.escrowFactoryContract.decodeEventLog(event, l.data));
    const immutables = data.at(0);
    return [
      Sdk.Immutables.new({
        orderHash: immutables[0],
        hashLock: Sdk.HashLock.fromString(immutables[1]),
        maker: Sdk.EvmAddress.fromBigInt(immutables[2]),
        taker: Sdk.EvmAddress.fromBigInt(immutables[3]),
        token: Sdk.EvmAddress.fromBigInt(immutables[4]),
        amount: immutables[5],
        safetyDeposit: immutables[6],
        timeLocks: Sdk.TimeLocks.fromBigInt(immutables[7]),
      }),
    ];
  }

  public async getSourceImpl(): Promise<Sdk.EvmAddress> {
    return Sdk.EvmAddress.fromBigInt(
      BigInt(
        await this.evmClient.getProvider().call({
          to: this.config.escrowFactory,
          data: id('ESCROW_SRC_IMPLEMENTATION()').slice(0, 10),
        })
      )
    );
  }

  public getResolverAddress(): string { return this.config.resolver }
  public getEscrowFactory(): string { return this.config.escrowFactory }
  public getLimitOrder(): string { return this.config.limitOrder }
}


