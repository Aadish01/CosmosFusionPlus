use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Timestamp};

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: String,
    pub maker: String,
    pub amount: Uint128,
    pub denom: String,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    // Lock funds (resolver deposits)
    LockFunds {
        amount: Uint128,
        denom: String,
    },
    
    // Reveal secret to complete swap
    RevealSecret {
        secret: Vec<u8>,
    },
    
    // Cancel swap (after timelock expires)
    CancelSwap {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(SwapInfo)]
    GetSwapInfo {},
}

#[cw_serde]
pub struct SwapInfo {
    pub maker: Addr,
    pub resolver: Option<Addr>,
    pub amount: Uint128,
    pub denom: String,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
    pub status: SwapStatus,
    pub created_at: Timestamp,
    pub funded_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
}

#[cw_serde]
pub enum SwapStatus {
    Pending,
    Funded,
    Completed,
    Cancelled,
}