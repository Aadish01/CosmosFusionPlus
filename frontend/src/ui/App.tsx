import React, { useMemo, useState } from 'react'

function App() {
  const [apiBase, setApiBase] = useState<string>(
    import.meta.env.VITE_API_BASE || 'http://localhost:3001'
  )
  const [intent, setIntent] = useState({
    srcChainId: 42161,
    dstChainId: 999, // cosmos placeholder
    userAddress: '',
    tokenAmount: '1',
    srcChainAsset: '',
    dstChainAsset: '',
    hashLock: '',
    receiver: ''
  })

  const disabled = useMemo(() => !intent.userAddress || !intent.hashLock, [intent])

  async function build() {
    const res = await fetch(`${apiBase}/api/swap/eth_to_cosmos/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent)
    })
    const data = await res.json()
    alert(JSON.stringify(data, null, 2))
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>CosmosFusionPlus</h1>
      <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
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
          Src Chain Asset
          <input value={intent.srcChainAsset} onChange={e => setIntent({ ...intent, srcChainAsset: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label>
          Dst Chain Asset
          <input value={intent.dstChainAsset} onChange={e => setIntent({ ...intent, dstChainAsset: e.target.value })} style={{ width: '100%' }} />
        </label>
        <label>
          HashLock (0x...)
          <input value={intent.hashLock} onChange={e => setIntent({ ...intent, hashLock: e.target.value })} style={{ width: '100%' }} />
        </label>
        <button onClick={build} disabled={disabled}>Build Order</button>
      </div>
    </div>
  )
}

export default App


