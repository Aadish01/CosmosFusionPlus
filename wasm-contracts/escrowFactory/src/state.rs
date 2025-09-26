use cosmwasm_std::{Addr, Uint128, Timestamp};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub admin: Addr,
    pub htlc_code_id: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct EscrowInfo {
    pub swap_hash: String,
    pub htlc_address: Addr,
    pub maker: Addr,
    pub amount: Uint128,
    pub denom: String,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
    pub created_at: Timestamp,
}

// Storage
pub const CONFIG: Item<Config> = Item::new("config");
pub const ESCROWS: Map<String, EscrowInfo> = Map::new("htlcs");
pub const MAKER_ESCROWS: Map<Addr, Vec<String>> = Map::new("maker_htlcs");
