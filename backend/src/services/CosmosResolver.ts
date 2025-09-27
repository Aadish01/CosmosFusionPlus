import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { Coin } from '@cosmjs/stargate';
import logger from '../utils/logger';
import { CosmosClient } from './CosmosClient';
import { CosmosConfig } from '../types';

export class CosmosResolver {
  private cosmos: CosmosClient;
  private config: CosmosConfig;

  constructor(cosmos: CosmosClient, config: CosmosConfig) {
    this.cosmos = cosmos;
    this.config = config;
  }

  public getAddress(): string { return this.cosmos.getAddress() }

  public async queryEscrowFactoryConfig(): Promise<any> {
    const query = { GetConfig: {} };
    return await this.cosmos.getWasm().queryContractSmart(this.config.escrowFactoryAddress!, query);
  }

  public async createHTLC(params: {
    swap_hash: string;
    maker: string;
    amount: string;
    denom: string;
    hashlock: string; // hex string
    timelock: number;
  }): Promise<string> {
    const exec = {
      CreateHTLC: {
        swap_hash: params.swap_hash,
        maker: params.maker,
        amount: params.amount,
        denom: params.denom,
        hashlock: Buffer.from(params.hashlock.replace('0x', ''), 'hex'),
        timelock: params.timelock,
      },
    };
    const fee: Coin[] = [];
    const res = await this.cosmos.getWasm().execute(this.cosmos.getAddress(), this.config.escrowFactoryAddress!, exec, 'auto', undefined, fee);
    logger.info('Cosmos createHTLC executed', { tx: res.transactionHash });
    return res.transactionHash;
  }

  public async getHTLCBySwapHash(swap_hash: string): Promise<any> {
    const query = { GetHTLC: { swap_hash } } as any;
    return await this.cosmos.getWasm().queryContractSmart(this.config.escrowFactoryAddress!, query);
  }
}


