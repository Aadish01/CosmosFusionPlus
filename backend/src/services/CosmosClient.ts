import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import logger from '../utils/logger';
import { CosmosConfig } from '../types';

export class CosmosClient {
  private wasm!: SigningCosmWasmClient;
  private address!: string;
  private config: CosmosConfig;

  private constructor(config: CosmosConfig) { this.config = config }

  public static async create(config: CosmosConfig): Promise<CosmosClient> {
    const client = new CosmosClient(config);
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(config.mnemonic, { prefix: config.prefix });
    const [account] = await wallet.getAccounts();
    const gasPrice = GasPrice.fromString(config.gasPrice);
    client.wasm = await SigningCosmWasmClient.connectWithSigner(config.rpcEndpoint, wallet, { gasPrice });
    client.address = account.address;
    logger.info('CosmosClient initialized', { address: client.address, rpc: config.rpcEndpoint });
    return client;
  }

  public getWasm(): SigningCosmWasmClient { return this.wasm }
  public getAddress(): string { return this.address }
}


