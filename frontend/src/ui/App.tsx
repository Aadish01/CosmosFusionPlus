import React, { useMemo, useState } from 'react'

function App() {
  const [apiBase, setApiBase] = useState<string>(
    import.meta.env.VITE_API_BASE || 'http://localhost:3001'
  )
  const [flow, setFlow] = useState<'ETH_TO_OSMO' | 'OSMO_TO_ETH'>('ETH_TO_OSMO')
  const [intent, setIntent] = useState({
    srcChainId: 42161,
    dstChainId: 999,
    userAddress: '',
    tokenAmount: '1',
    srcChainAsset: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    dstChainAsset: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    hashLock: '',
    receiver: ''
  })

  const disabled = useMemo(() => !intent.userAddress || !intent.hashLock, [intent])

  async function build() {
    const path = flow === 'ETH_TO_OSMO' ? 'eth_to_cosmos' : 'cosmos_to_eth'
    const res = await fetch(`${apiBase}/api/swap/${path}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent)
    })
    const out = await res.json()
    alert(JSON.stringify(out, null, 2))
  }

  async function execute() {
    const path = flow === 'ETH_TO_OSMO' ? 'eth_to_cosmos' : 'cosmos_to_eth'
    // Build first (typedData+orderHash for ETH leg; orderHash for Cosmos leg)
    const buildRes = await fetch(`${apiBase}/api/swap/${path}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent)
    })
    const buildOut = await buildRes.json()
    if (!buildOut?.success) { alert('Build failed'); return }
    if (flow === 'ETH_TO_OSMO') {
      const { typedData, orderHash } = buildOut.data
      const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(typedData)]
      })
      const res = await fetch(`${apiBase}/api/swap/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderHash, signature })
      })
      const text = await res.text()
      alert(text)
    } else {
      const { orderHash } = buildOut.data
      // Keplr-signed HTLC on osmo-test-5
      try {
        const chainId = 'osmo-test-5'
        const rpc = import.meta.env.VITE_OSMO_RPC || 'https://rpc.testnet.osmosis.zone'
        const factory = import.meta.env.VITE_OSMO_FACTORY
        const denom = import.meta.env.VITE_OSMO_DENOM || 'uosmo'
        if (!factory) { alert('VITE_OSMO_FACTORY not set'); return }

        // ensure chain is enabled (suggest if needed)
        try { await window.keplr.enable(chainId) } catch {
          await window.keplr.experimentalSuggestChain({
            chainId,
            chainName: 'Osmosis Testnet',
            rpc,
            rest: import.meta.env.VITE_OSMO_REST || 'https://rest.testnet.osmosis.zone',
            bip44: { coinType: 118 },
            bech32Config: {
              bech32PrefixAccAddr: 'osmo', bech32PrefixAccPub: 'osmopub',
              bech32PrefixValAddr: 'osmovaloper', bech32PrefixValPub: 'osmovaloperpub',
              bech32PrefixConsAddr: 'osmovalcons', bech32PrefixConsPub: 'osmovalconspub'
            },
            currencies: [{ coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 }],
            feeCurrencies: [{ coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 }],
            stakeCurrency: { coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 },
            features: ['stargate', 'ibc-transfer']
          })
          await window.keplr.enable(chainId)
        }

        const { SigningCosmWasmClient } = await import('@cosmjs/cosmwasm-stargate')
        const { GasPrice } = await import('@cosmjs/stargate')
        const signer = window.keplr.getOfflineSignerOnlyAmino(chainId)
        const [{ address: from }] = await signer.getAccounts()

        // convert tokenAmount to uosmo (6 decimals)
        const toUosmo = (amtStr: string) => {
          const [i, f = ''] = amtStr.split('.')
          const frac = (f + '000000').slice(0, 6)
          return (BigInt(i || '0') * 1000000n + BigInt(frac)).toString()
        }
        const amount = toUosmo(intent.tokenAmount)
        const timelock = Math.floor(Date.now() / 1000) + 120
        const { fromHex, toBase64 } = await import('@cosmjs/encoding')
        const hashlockB64 = toBase64(fromHex(intent.hashLock.replace(/^0x/, '')))

        const gasPrice = GasPrice.fromString((import.meta.env.VITE_OSMO_GAS_PRICE as string) || '0.025uosmo')
        const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer, { gasPrice })
        const msg = {
          create_h_t_l_c: {
            swap_hash: orderHash,
            maker: from,
            amount,
            denom,
            hashlock: hashlockB64,
            timelock
          }
        }
        const res = await client.execute(from, factory, msg, 'auto')
        alert('HTLC tx sent: ' + res.transactionHash)

        // Notify backend to proceed (will deploy EVM leg when implemented)
        await fetch(`${apiBase}/api/swap/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderHash })
        })
      } catch (e) {
        alert('Keplr flow failed: ' + (e as any).message)
      }
    }
  }

  async function connectMetaMask() {
    if (!window.ethereum) {
      alert('MetaMask not found')
      return
    }
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xA4B1' }] })
    } catch (e) {
      // chain not added, attempt add Arbitrum One
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xA4B1',
            chainName: 'Arbitrum One',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://arbitrum.drpc.org'],
            blockExplorerUrls: ['https://arbiscan.io']
          }]
        })
      } catch {}
    }
    const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
    setIntent({ ...intent, userAddress: accounts[0] })
  }

  async function connectKeplr() {
    const chainId = 'osmo-test-5'
    if (!('keplr' in window)) {
      alert('Keplr not found')
      return
    }
    try {
      await window.keplr.enable(chainId)
    } catch {
      // Try suggest chain if not added
      const rest = import.meta.env.VITE_OSMO_REST || 'https://rest.testnet.osmosis.zone'
      const rpc = import.meta.env.VITE_OSMO_RPC || 'https://rpc.testnet.osmosis.zone'
      await window.keplr.experimentalSuggestChain({
        chainId,
        chainName: 'Osmosis Testnet',
        rpc,
        rest,
        bip44: { coinType: 118 },
        bech32Config: {
          bech32PrefixAccAddr: 'osmo',
          bech32PrefixAccPub: 'osmopub',
          bech32PrefixValAddr: 'osmovaloper',
          bech32PrefixValPub: 'osmovaloperpub',
          bech32PrefixConsAddr: 'osmovalcons',
          bech32PrefixConsPub: 'osmovalconspub'
        },
        currencies: [{ coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 }],
        feeCurrencies: [{ coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 }],
        stakeCurrency: { coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 },
        features: ['stargate', 'ibc-transfer']
      })
      await window.keplr.enable(chainId)
    }
    const key = await window.keplr.getKey(chainId)
    setIntent({ ...intent, receiver: key.bech32Address })
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>CosmosFusionPlus</h1>
      <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={flow} onChange={e => {
            const f = e.target.value as 'ETH_TO_OSMO' | 'OSMO_TO_ETH'
            setFlow(f)
            if (f === 'ETH_TO_OSMO') {
              setIntent({
                ...intent,
                srcChainId: 42161,
                dstChainId: 999,
                srcChainAsset: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
                dstChainAsset: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF'
              })
            } else {
              // OSMO -> ETH: here UI just flips chains; backend will handle flow later
              setIntent({
                ...intent,
                srcChainId: 999,
                dstChainId: 42161,
                // keep same tokenAmount/hashLock/addresses; src/dst assets are informational
                srcChainAsset: 'uosmo',
                dstChainAsset: 'ETH'
              })
            }
          }}>
            <option value="ETH_TO_OSMO">ETH → OSMO</option>
            <option value="OSMO_TO_ETH">OSMO → ETH</option>
          </select>
          <button onClick={connectMetaMask}>Connect MetaMask (Arbitrum)</button>
          <button onClick={connectKeplr}>Connect Keplr (Osmosis)</button>
        </div>
        <label>
          API Base
          <input value={apiBase} onChange={e => setApiBase(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          User Address
          <input value={intent.userAddress} onChange={e => setIntent({ ...intent, userAddress: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label>
          Receiver
          <input value={intent.receiver} onChange={e => setIntent({ ...intent, receiver: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label>
          Token Amount
          <input value={intent.tokenAmount} onChange={e => setIntent({ ...intent, tokenAmount: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label>
          Src Chain Asset (auto)
          <input value={intent.srcChainAsset} readOnly style={{ width: '100%', background: '#f5f5f5' }} />
        </label>
        <label>
          Dst Chain Asset (auto)
          <input value={intent.dstChainAsset} readOnly style={{ width: '100%', background: '#f5f5f5' }} />
        </label>
        <label>
          HashLock (0x...)
          <input value={intent.hashLock} onChange={e => setIntent({ ...intent, hashLock: e.target.value })} style={{ width: '100%' }} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={build} disabled={disabled}>Build Order</button>
          <button onClick={execute}>Execute</button>
        </div>
      </div>
    </div>
  )
}

export default App


