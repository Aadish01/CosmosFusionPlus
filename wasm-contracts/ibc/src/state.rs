use cosmwasm_std::{Addr, Uint128, Timestamp};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::msg::OrderStatus;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub admin: Addr,
    pub htlc_factory: Addr,
    pub ibc_channel: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Order {
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

// Storage - minimal storage
pub const CONFIG: Item<Config> = Item::new("config");
pub const ORDERS: Map<String, Order> = Map::new("orders");
pub const MAKER_ORDERS: Map<Addr, Vec<String>> = Map::new("maker_orders");