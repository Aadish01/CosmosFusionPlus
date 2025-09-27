import { JsonRpcProvider, Wallet, TransactionRequest, TransactionResponse, Block } from 'ethers';

export class EvmClient {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private chainId: number;

  constructor(rpcUrl: string, privateKey: string, chainId: number) {
    this.provider = new JsonRpcProvider(rpcUrl, chainId);
    this.wallet = new Wallet(privateKey, this.provider);
    this.chainId = chainId;
  }

  public getProvider(): JsonRpcProvider {
    return this.provider;
  }

  public async send(tx: TransactionRequest): Promise<{ txHash: string; blockTimestamp: bigint; blockHash: string }> {
    // Ensure chainId and from are set when broadcasting
    const populated: TransactionRequest = {
      chainId: this.chainId,
      from: this.wallet.address,
      ...tx,
    };

    const response: TransactionResponse = await this.wallet.sendTransaction(populated);
    const receipt = await response.wait();
    if (!receipt || !receipt.blockHash) throw new Error('No receipt or blockHash');

    const block: Block | null = await this.provider.getBlock(receipt.blockHash);
    if (!block || block.timestamp === undefined) throw new Error('Failed to fetch block for timestamp');

    return {
      txHash: response.hash,
      blockTimestamp: BigInt(block.timestamp),
      blockHash: receipt.blockHash,
    };
  }
}


