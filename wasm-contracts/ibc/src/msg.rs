use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Timestamp};

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: String,
    pub htlc_factory: String,
    pub ibc_channel: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    // Create order and HTLC
    CreateOrder {
        swap_hash: String,
        maker: String,
        amount: Uint128,
        denom: String,
        hashlock: Vec<u8>,
        timelock: u64,
        target_chain: String,
    },
    
    // Update order status (called by HTLC contracts)
    UpdateOrderStatus {
        swap_hash: String,
        status: OrderStatus,
    },
    
    // IBC packet handling
    ProcessIBCPacket {
        channel_id: String,
        packet_data: Vec<u8>,
    },
    
    // Admin functions
    UpdateHTLCFactory {
        htlc_factory: String,
    },
    
    UpdateIBCChannel {
        channel_id: String,
    },
    
    UpdateAdmin {
        admin: String,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(OrderInfo)]
    GetOrder { swap_hash: String },
    
    #[returns(Vec<OrderInfo>)]
    GetOrdersByMaker { maker: String },
    
    #[returns(ConfigResponse)]
    GetConfig {},
}

#[cw_serde]
pub struct OrderInfo {
    pub swap_hash: String,
    pub maker: Addr,
    pub amount: Uint128,
    pub denom: String,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
    pub target_chain: String,
    pub htlc_address: Option<Addr>,
    pub status: OrderStatus,
    pub created_at: Timestamp,
}

#[cw_serde]
pub enum OrderStatus {
    Pending,
    Created,
    Funded,
    Completed,
    Cancelled,
    Expired,
}

#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
    pub htlc_factory: Addr,
    pub ibc_channel: String,
}