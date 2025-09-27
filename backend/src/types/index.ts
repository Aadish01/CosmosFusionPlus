import * as Sdk from '@1inch/cross-chain-sdk';

export interface UserIntent {
  srcChainId: number;
  dstChainId: number;
  userAddress: string;
  tokenAmount: string;
  srcChainAsset: string;
  dstChainAsset: string;
  hashLock: string;
  receiver: string;
}

export interface SwapOrder {
  orderHash: string;
  userIntent: UserIntent;
  signature?: string;
  secret?: string;
  escrowSrcTxHash?: string;
  escrowDstTxHash?: string;
  escrowDstWithdrawTxHash?: string;
  escrowSrcWithdrawTxHash?: string;
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
  deployedAt?: number;
  cosmosEscrowAddress?: string;
  evmEscrowAddress?: string;
}

export interface EvmSwapOrder extends SwapOrder {
  typedData: Sdk.EIP712TypedData;
  order: Sdk.EvmCrossChainOrder;
}

export interface BuildSwapOrderRequest { userIntent: UserIntent }
export interface ExecuteSwapOrderRequest { orderHash: string; signature: string }
export interface RevealSecretRequest { orderHash: string; secret: string }

export interface ApiResponse<T = any> { success: boolean; data?: T; error?: string }

export interface ResolverConfig {
  chainId: number;
  resolver: string;
  escrowFactory: string;
  limitOrder: string;
}

export interface CosmosConfig {
  rpcEndpoint: string;
  prefix: string;
  mnemonic: string;
  gasPrice: string;
  escrowFactoryAddress?: string;
  ibcContractAddress?: string;
}

export class SwapError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'SwapError';
  }
}

export class ChainError extends Error {
  constructor(message: string, public chainId?: number) {
    super(message);
    this.name = 'ChainError';
  }
}


