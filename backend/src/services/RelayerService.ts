import { ethers, parseEther, parseUnits } from 'ethers';
import * as Sdk from '@1inch/cross-chain-sdk';
import logger from '../utils/logger';
import { ChainError, EvmSwapOrder, ResolverConfig, SwapError, SwapOrder, UserIntent, CosmosConfig } from '../types';
import { EvmClient } from './EvmClient';
import { EvmResolver } from './EvmResolver';
import { CosmosClient } from './CosmosClient';
import { CosmosResolver } from './CosmosResolver';
import { SwapOrderService } from './SwapOrderService';

export default class RelayerService {
  private resolvers: Map<number, EvmResolver> = new Map();
  private cosmosResolver!: CosmosResolver;
  private swapOrderService: SwapOrderService;

  constructor(swapOrderService: SwapOrderService) { this.swapOrderService = swapOrderService }

  public static async create(): Promise<RelayerService> {
    const swapOrderService = new SwapOrderService();
    const relayer = new RelayerService(swapOrderService);

    const evmConfig: ResolverConfig = {
      chainId: Number(process.env.ETH_CHAIN_ID || 42161),
      resolver: process.env.ETH_RESOLVER || '',
      escrowFactory: process.env.ETH_ESCROW_FACTORY || '',
      limitOrder: process.env.ETH_LIMIT_ORDER || '',
    };
    const evmClient = new EvmClient(process.env.ETH_RPC_URL || '', process.env.ETH_PRIVATE_KEY || '', evmConfig.chainId);
    const evmResolver = new EvmResolver(evmClient, evmConfig);
    relayer.addResolver(evmConfig.chainId, evmResolver);

    const cosmosConfig: CosmosConfig = {
      rpcEndpoint: process.env.COSMOS_RPC_ENDPOINT || 'https://rpc.osmosis.zone:443',
      prefix: process.env.COSMOS_PREFIX || 'osmo',
      mnemonic: process.env.COSMOS_MNEMONIC || '',
      gasPrice: process.env.COSMOS_GAS_PRICE || '0.025uosmo',
      escrowFactoryAddress: process.env.COSMOS_ESCROW_FACTORY_ADDRESS,
      ibcContractAddress: process.env.COSMOS_IBC_CONTRACT_ADDRESS,
    };
    const cosmosClient = await CosmosClient.create(cosmosConfig);
    relayer.cosmosResolver = new CosmosResolver(cosmosClient, cosmosConfig);

    logger.info('RelayerService created');
    return relayer;
  }

  public addResolver(chainId: number, resolver: EvmResolver): void {
    this.resolvers.set(chainId, resolver);
  }

  public getSupportedChains(): number[] { return Array.from(this.resolvers.keys()) }

  public buildEvmSwapOrder(userIntent: UserIntent): Sdk.EIP712TypedData | undefined {
    try {
      const resolver = this.getResolver(userIntent.srcChainId);
      const order = this.createEvmCrossChainOrder(userIntent, resolver);
      const typedData = this.generateOrderTypedData(userIntent.srcChainId, order, resolver.getLimitOrder());
      const orderHash = this.orderHash(typedData);
      const swapOrder: EvmSwapOrder = { orderHash, userIntent, createdAt: new Date(), updatedAt: new Date(), typedData, order };
      this.swapOrderService.createEvmSwapOrder(swapOrder);
      return typedData;
    } catch (error) {
      logger.error('Failed to build swap order via relayer', { error, userIntent });
      throw new SwapError('Failed to build swap order', 'RELAYER_BUILD_FAILED', { userIntent });
    }
  }

  public async executeEvmSwapOrder(orderHash: string, signature: string): Promise<void> {
    try {
      const order = this.swapOrderService.getEvmOrderByHash(orderHash);
      if (!order) throw new SwapError('Order not found', 'ORDER_NOT_FOUND', { orderHash });
      if (!order.signature) this.swapOrderService.addEvmSignature(orderHash, signature);

      const srcResolver = this.getResolver(order.userIntent.srcChainId);
      order.signature = signature;
      const [escrowSrcTxHash, escrowAddress, deployedAt] = await srcResolver.deployEscrowSrc(order);
      this.swapOrderService.addEvmEscrowAddress(orderHash, escrowAddress);
      this.swapOrderService.addDeployedAt(orderHash, Number(deployedAt));
      this.swapOrderService.addEscrowSrcTxHash(orderHash, escrowSrcTxHash);
    } catch (error) {
      logger.error('Failed to execute swap order via relayer', { error, orderHash });
      this.swapOrderService.updateOrderStatus(orderHash);
      throw new SwapError('Failed to execute swap order', 'RELAYER_EXECUTE_FAILED', { orderHash });
    }
  }

  public getOrderByHash(orderHash: string): SwapOrder | undefined { return this.swapOrderService.getOrderByHash(orderHash) }
  public getOrdersByUser(userAddress: string): SwapOrder[] { return this.swapOrderService.getOrdersByUser(userAddress) }

  private getResolver(chainId: number): EvmResolver {
    const resolver = this.resolvers.get(chainId);
    if (!resolver) throw new SwapError(`No resolver for chain ${chainId}`, 'UNSUPPORTED_CHAIN', { chainId });
    return resolver;
  }

  private generateOrderTypedData(srcChainId: number, order: Sdk.EvmCrossChainOrder, verifyingContract: string): Sdk.EIP712TypedData {
    const typedData = order.getTypedData(srcChainId);
    typedData.domain = { name: '1inch Limit Order Protocol', version: '4', chainId: srcChainId, verifyingContract };
    return typedData;
  }

  private orderHash(typedData: Sdk.EIP712TypedData): string {
    return ethers.TypedDataEncoder.hash(typedData.domain, { Order: typedData.types[typedData.primaryType] }, typedData.message);
  }

  private createEvmCrossChainOrder(userIntent: UserIntent, resolver: EvmResolver): Sdk.EvmCrossChainOrder {
    const escrowFactory = Sdk.EvmAddress.fromString(resolver.getEscrowFactory());
    const hashLock = Sdk.HashLock.fromString(userIntent.hashLock);
    const orderInfo = {
      salt: Sdk.randBigInt(1000n),
      maker: Sdk.EvmAddress.fromString(userIntent.userAddress),
      makingAmount: parseUnits(userIntent.tokenAmount.toString(), 6),
      takingAmount: parseUnits(userIntent.tokenAmount, 6),
      makerAsset: Sdk.EvmAddress.fromString(userIntent.srcChainAsset),
      takerAsset: Sdk.EvmAddress.fromString(userIntent.dstChainAsset),
      receiver: Sdk.EvmAddress.fromString(userIntent.receiver),
    };
    const escrowParams = {
      hashLock,
      timeLocks: Sdk.TimeLocks.new({ srcWithdrawal: 5n, srcPublicWithdrawal: 120n, srcCancellation: 121n, srcPublicCancellation: 122n, dstWithdrawal: 10n, dstPublicWithdrawal: 100n, dstCancellation: 101n }),
      srcChainId: userIntent.srcChainId as Sdk.EvmChain,
      dstChainId: userIntent.dstChainId as Sdk.SupportedChain,
      srcSafetyDeposit: parseEther('0.000001'),
      dstSafetyDeposit: parseUnits('0.000001', 6),
    };
    const resolverAddress = Sdk.EvmAddress.fromString(resolver.getResolverAddress());
    const details = { auction: new Sdk.AuctionDetails({ initialRateBump: 0, points: [], duration: 120n, startTime: BigInt(Math.floor(Date.now() / 1000)) }), whitelist: [{ address: resolverAddress, allowFrom: 0n }], resolvingStartTime: 0n };
    const extra = { nonce: Sdk.randBigInt(2n ** 40n - 1n), allowPartialFills: false, allowMultipleFills: false };
    return Sdk.EvmCrossChainOrder.new(escrowFactory, orderInfo, escrowParams, details, extra);
  }
}


