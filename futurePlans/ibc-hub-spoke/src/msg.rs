use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Addr;

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: String,
    pub htlc_factory: String,
    pub ibc_channel: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    CreateOrder {
        swap_hash: String,
        maker: String,
        amount: String,
        denom: String,
        hashlock: Vec<u8>,
        timelock: u64,
        target_chain: String,
    },
    SetRoute {
        chain: String,
        channel_id: String,
    },
    SendCreateHTLC {
        swap_hash: String,
        maker: String,
        amount: String,
        denom: String,
        hashlock: Vec<u8>,
        timelock: u64,
        dest_chain: String,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ConfigResponse)]
    GetConfig {},
}

#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
    pub htlc_factory: Addr,
    pub ibc_channel: String,
}


