/*
  Usage:
    cd CosmosFusionPlus/backend
    # Optional overrides (falls back to ../evm/deployment.json)
    # export RESOLVER_ADDRESS=0x...
    # export EXPECTED_OWNER=0x...
    # export ETH_RPC_URL=https://sepolia.base.org
    node scripts/check-resolver.js
*/

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { ethers, Interface } = require('ethers');

async function main() {
  // Resolve inputs
  const deploymentPath = path.resolve(__dirname, '../../evm/deployment.json');
  let deployedTo, deployer;
  try {
    const raw = fs.readFileSync(deploymentPath, 'utf8');
    const parsed = JSON.parse(raw);
    deployedTo = parsed['Deployed to'];
    deployer = parsed['Deployer'];
  } catch (_) {}

  const resolverAddress = process.env.RESOLVER_ADDRESS || deployedTo;
  const expectedOwner = process.env.EXPECTED_OWNER || deployer;
  const rpcUrl = process.env.ETH_RPC_URL || 'https://sepolia.base.org';

  if (!resolverAddress) throw new Error('Missing RESOLVER_ADDRESS (and no deployment.json found)');
  if (!expectedOwner) throw new Error('Missing EXPECTED_OWNER (and no deployment.json found)');

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Minimal ABI like backend interaction style
  const resolverIface = new Interface([
    'function owner() view returns (address)',
    'function transferOwnership(address newOwner)'
  ]);

  // 1) Code exists
  const code = await provider.getCode(resolverAddress);
  if (!code || code === '0x') throw new Error(`No bytecode at ${resolverAddress}`);

  // 2) Owner check
  const dataOwner = resolverIface.encodeFunctionData('owner', []);
  const ownerHex = await provider.call({ to: resolverAddress, data: dataOwner });
  const [owner] = resolverIface.decodeFunctionResult('owner', ownerHex);
  if (owner.toLowerCase() !== expectedOwner.toLowerCase()) {
    throw new Error(`Owner mismatch: onchain=${owner} expected=${expectedOwner}`);
  }

  // 3) onlyOwner restriction (simulate call from non-owner via eth_call)
  const randomAddr = ethers.Wallet.createRandom().address;
  const dataXfer = resolverIface.encodeFunctionData('transferOwnership', [randomAddr]);
  let onlyOwnerOk = false;
  try {
    await provider.call({ to: resolverAddress, data: dataXfer, from: randomAddr });
    // If no revert, it's a problem
    onlyOwnerOk = false;
  } catch (err) {
    // Revert is expected
    onlyOwnerOk = true;
  }
  if (!onlyOwnerOk) throw new Error('transferOwnership did not revert for non-owner');

  console.log('Resolver checks passed:', {
    resolverAddress,
    owner: owner,
    network: rpcUrl,
  });
}

main().catch((e) => {
  console.error('Resolver check failed:', e);
  process.exit(1);
});


