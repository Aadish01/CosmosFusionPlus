use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: {msg}")]
    Unauthorized { msg: String },

    #[error("HTLC already exists: {swap_hash}")]
    HTLCAlreadyExists { swap_hash: String },

    #[error("HTLC not found: {swap_hash}")]
    HTLCNotFound { swap_hash: String },

    #[error("Invalid HTLC code ID")]
    InvalidHTLCCodeId,
}
