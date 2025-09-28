use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub admin: Addr,
    pub htlc_factory: Addr,
    pub ibc_channel: String,
}

pub const CONFIG: Item<Config> = Item::new("config");

// chain -> channel_id routing table for outbound packets
pub const ROUTES: Map<String, String> = Map::new("routes");


