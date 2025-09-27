import { keccak256, toUtf8Bytes } from 'ethers';
import { EvmSwapOrder, SwapOrder } from '../types';
import logger from '../utils/logger';

export class SwapOrderService {
  private orders: Map<string, SwapOrder> = new Map();
  private userOrders: Map<string, string[]> = new Map();
  private evmSwapOrders: Map<string, EvmSwapOrder> = new Map();

  public createEvmSwapOrder(orderData: Omit<EvmSwapOrder, 'createdAt' | 'updatedAt'>): EvmSwapOrder {
    const order: EvmSwapOrder = { ...orderData, createdAt: new Date(), updatedAt: new Date() };
    this.evmSwapOrders.set(order.orderHash, order);
    this.orders.set(order.orderHash, order);
    const userAddress = order.userIntent.userAddress.toLowerCase();
    if (!this.userOrders.has(userAddress)) this.userOrders.set(userAddress, []);
    this.userOrders.get(userAddress)!.push(order.orderHash);
    logger.info('Swap order created', { orderHash: order.orderHash });
    return order;
  }

  public createSwapOrder(orderData: Omit<SwapOrder, 'createdAt' | 'updatedAt' | 'orderHash'>): SwapOrder {
    const nonceWrapped = { ...orderData, nonce: Math.random().toString() };
    const hash = keccak256(toUtf8Bytes(JSON.stringify(nonceWrapped)));
    const order: SwapOrder = { ...orderData, orderHash: hash, createdAt: new Date(), updatedAt: new Date() };
    this.orders.set(order.orderHash, order);
    const userAddress = order.userIntent.userAddress.toLowerCase();
    if (!this.userOrders.has(userAddress)) this.userOrders.set(userAddress, []);
    this.userOrders.get(userAddress)!.push(order.orderHash);
    logger.info('Swap order created', { orderHash: order.orderHash });
    return order;
  }

  public getOrderByHash(orderHash: string): SwapOrder | undefined { return this.orders.get(orderHash) }
  public getEvmOrderByHash(orderHash: string): EvmSwapOrder | undefined { return this.evmSwapOrders.get(orderHash) }
  public getOrdersByUser(userAddress: string): SwapOrder[] {
    const normalizedAddress = userAddress.toLowerCase();
    const orderHashes = this.userOrders.get(normalizedAddress) || [];
    return orderHashes.map((h) => this.orders.get(h)).filter((o): o is SwapOrder => o !== undefined).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public updateOrderStatus(orderHash: string): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    return order;
  }

  public addEvmSignature(orderHash: string, signature: string): EvmSwapOrder | undefined {
    const order = this.evmSwapOrders.get(orderHash);
    if (!order) return undefined;
    const updated: EvmSwapOrder = { ...order, signature, updatedAt: new Date() };
    this.evmSwapOrders.set(orderHash, updated);
    return updated;
  }

  public addEscrowSrcTxHash(orderHash: string, txHash: string): SwapOrder | undefined { return this.update(orderHash, { escrowSrcTxHash: txHash }) }
  public addEscrowDstTxHash(orderHash: string, txHash: string): SwapOrder | undefined { return this.update(orderHash, { escrowDstTxHash: txHash }) }
  public addEscrowSrcWithdrawTxHash(orderHash: string, txHash: string): SwapOrder | undefined { return this.update(orderHash, { escrowSrcWithdrawTxHash: txHash }) }
  public addEscrowDstWithdrawTxHash(orderHash: string, txHash: string): SwapOrder | undefined { return this.update(orderHash, { escrowDstWithdrawTxHash: txHash }) }
  public addDeployedAt(orderHash: string, deployedAt: number): SwapOrder | undefined { return this.update(orderHash, { deployedAt }) }
  public addEvmEscrowAddress(orderHash: string, evmEscrowAddress: string): SwapOrder | undefined { return this.update(orderHash, { evmEscrowAddress }) }

  private update(orderHash: string, changes: Partial<SwapOrder>): SwapOrder | undefined {
    const order = this.orders.get(orderHash);
    if (!order) return undefined;
    const updated: SwapOrder = { ...order, ...changes, updatedAt: new Date() };
    this.orders.set(orderHash, updated);
    if (this.evmSwapOrders.has(orderHash)) this.evmSwapOrders.set(orderHash, updated as EvmSwapOrder);
    return updated;
  }
}


