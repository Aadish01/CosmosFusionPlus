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

    #[error("HTLC contract not found")]
    HTLCContractNotFound,

    #[error("Order not found: {order_id}")]
    OrderNotFound { order_id: String },

    #[error("Order already exists: {order_id}")]
    OrderAlreadyExists { order_id: String },

    #[error("Invalid order status")]
    InvalidOrderStatus,

    #[error("IBC packet processing failed")]
    IBCPacketProcessingFailed,

    #[error("Invalid message format")]
    InvalidMessageFormat,
}
