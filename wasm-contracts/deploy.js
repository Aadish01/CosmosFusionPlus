const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { GasPrice } = require('@cosmjs/stargate');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://rpc.osmosis.zone:443';
const MNEMONIC = process.env.MNEMONIC;
const PREFIX = 'osmo';

async function deployContracts() {
    if (!MNEMONIC) {
        throw new Error('Please set MNEMONIC in .env file');
    }

    // Create wallet
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: PREFIX });
    const [account] = await wallet.getAccounts();
    
    console.log('Deploying from address:', account.address);

    // Create client
    const client = await SigningCosmWasmClient.connectWithSigner(
        RPC_ENDPOINT,
        wallet,
        {
            gasPrice: GasPrice.fromString('0.025uosmo'),
        }
    );

    // Read contract wasm files (optimized by Docker)
    const escrowWasm = fs.readFileSync(
        path.join(__dirname, 'escrow', 'artifacts', 'escrow.wasm')
    );
    const escrowFactoryWasm = fs.readFileSync(
        path.join(__dirname, 'escrowFactory', 'artifacts', 'escrow_factory.wasm')
    );
    const ibcWasm = fs.readFileSync(
        path.join(__dirname, 'ibc', 'artifacts', 'ibc.wasm')
    );

    // 1. Upload Escrow contract (individual contract)
    console.log('Uploading Escrow contract...');
    const escrowUploadResult = await client.upload(account.address, escrowWasm, 'auto');
    console.log('Escrow contract uploaded:', escrowUploadResult);

    // 2. Upload Escrow Factory contract
    console.log('Uploading Escrow Factory contract...');
    const escrowFactoryUploadResult = await client.upload(account.address, escrowFactoryWasm, 'auto');
    console.log('Escrow Factory contract uploaded:', escrowFactoryUploadResult);

    // Wait a bit for the upload to be processed
    console.log('Waiting 5 seconds for upload to be processed...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Upload IBC contract
    console.log('Uploading IBC contract...');
    const ibcUploadResult = await client.upload(account.address, ibcWasm, 'auto');
    console.log('IBC contract uploaded:', ibcUploadResult);

    // 4. Instantiate Escrow Factory
    console.log('Instantiating Escrow Factory...');
    const escrowFactoryInitMsg = {
        admin: account.address,
        htlc_code_id: escrowUploadResult.codeId,
    };

    const escrowFactoryInstantiateResult = await client.instantiate(
        account.address,
        escrowFactoryUploadResult.codeId,
        escrowFactoryInitMsg,
        'osmosis-escrow-factory-v1',
        'auto',
        { admin: account.address }
    );
    console.log('Escrow Factory instantiated:', escrowFactoryInstantiateResult);

    // 5. Instantiate IBC contract
    console.log('Instantiating IBC contract...');
    const ibcInitMsg = {
        admin: account.address,
        htlc_factory: escrowFactoryInstantiateResult.contractAddress,
        ibc_channel: process.env.IBC_CHANNEL || 'channel-0',
    };

    const ibcInstantiateResult = await client.instantiate(
        account.address,
        ibcUploadResult.codeId,
        ibcInitMsg,
        'osmosis-ibc-v1',
        'auto',
        { admin: account.address }
    );
    console.log('IBC contract instantiated:', ibcInstantiateResult);

    // Save deployment info
    const deploymentInfo = {
        network: 'osmosis',
        escrow: {
            codeId: escrowUploadResult.codeId,
        },
        escrow_factory: {
            codeId: escrowFactoryUploadResult.codeId,
            address: escrowFactoryInstantiateResult.contractAddress,
        },
        ibc: {
            codeId: ibcUploadResult.codeId,
            address: ibcInstantiateResult.contractAddress,
        },
        deployer: account.address,
        timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
        path.join(__dirname, 'deployment.json'),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log('\n=== DEPLOYMENT COMPLETE ===');
    console.log('Escrow Contract Code ID:', escrowUploadResult.codeId);
    console.log('Escrow Factory:', escrowFactoryInstantiateResult.contractAddress);
    console.log('IBC Contract:', ibcInstantiateResult.contractAddress);
    console.log('Deployment info saved to deployment.json');
}

deployContracts().catch(console.error);