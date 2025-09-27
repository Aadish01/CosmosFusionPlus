use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: {msg}")]
    Unauthorized { msg: String },

    #[error("Swap already completed")]
    SwapAlreadyCompleted,

    #[error("Swap not funded")]
    SwapNotFunded,

    #[error("Invalid amount")]
    InvalidAmount,

    #[error("Invalid denom")]
    InvalidDenom,

    #[error("Invalid secret")]
    InvalidSecret,

    #[error("Timelock expired")]
    TimelockExpired,

    #[error("Timelock not expired")]
    TimelockNotExpired,

    #[error("Insufficient funds: required {required}, got {got}")]
    InsufficientFunds { required: String, got: String },
}