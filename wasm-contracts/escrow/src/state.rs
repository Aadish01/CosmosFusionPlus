use cosmwasm_std::{Addr, Uint128, Timestamp};
use cw_storage_plus::Item;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::msg::SwapStatus;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Escrow {
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

// Storage - single escrow per contract
pub const ESCROW: Item<Escrow> = Item::new("swap");