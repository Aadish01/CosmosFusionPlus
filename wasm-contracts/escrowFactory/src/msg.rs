use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Timestamp};

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: String,
    pub htlc_code_id: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    // Create new HTLC contract
    CreateHTLC {
        swap_hash: String,
        maker: String,
        amount: Uint128,
        denom: String,
        hashlock: Vec<u8>,
        timelock: u64,
    },
    
    // Admin functions
    UpdateHTLCCodeId {
        code_id: u64,
    },
    
    UpdateAdmin {
        admin: String,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(HTLCInfo)]
    GetHTLC { swap_hash: String },
    
    #[returns(Vec<HTLCInfo>)]
    GetHTLCsByMaker { maker: String },
    
    #[returns(ConfigResponse)]
    GetConfig {},
}

#[cw_serde]
pub struct HTLCInfo {
    pub swap_hash: String,
    pub htlc_address: Addr,
    pub maker: Addr,
    pub amount: Uint128,
    pub denom: String,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
    pub created_at: Timestamp,
}

#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
    pub htlc_code_id: u64,
}
