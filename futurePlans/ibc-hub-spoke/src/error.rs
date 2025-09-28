use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: {msg}")]
    Unauthorized { msg: String },

    #[error("Invalid IBC channel: {channel}")]
    InvalidIBCChannel { channel: String },

    #[error("Invalid packet data")]
    InvalidPacketData,

    #[error("Invalid message format")]
    InvalidMessageFormat,
}


