use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Uint128, BankMsg, Addr,
};
use sha2::{Sha256, Digest};
use cw_utils::must_pay;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, SwapInfo, SwapStatus};
use crate::state::{Escrow, ESCROW};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Validate timelock
    if msg.timelock <= env.block.time.seconds() {
        return Err(ContractError::TimelockExpired);
    }

    // Validate amount
    if msg.amount.is_zero() {
        return Err(ContractError::InvalidAmount);
    }

    // Validate denom
    if msg.denom.is_empty() {
        return Err(ContractError::InvalidDenom);
    }

    let maker_addr = deps.api.addr_validate(&msg.maker)?;

    let swap = Escrow {
        maker: maker_addr,
        resolver: None,
        amount: msg.amount,
        denom: msg.denom,
        hashlock: msg.hashlock,
        timelock: msg.timelock,
        status: SwapStatus::Pending,
        created_at: env.block.time,
        funded_at: None,
        completed_at: None,
    };

    ESCROW.save(deps.storage, &swap)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("maker", msg.maker)
        .add_attribute("amount", msg.amount)
        .add_attribute("timelock", msg.timelock.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::LockFunds { amount, denom } => {
            lock_funds(deps, env, info, amount, denom)
        }
        ExecuteMsg::RevealSecret { secret } => {
            reveal_secret(deps, env, info, secret)
        }
        ExecuteMsg::CancelSwap {} => cancel_swap(deps, env, info),
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetSwapInfo {} => to_json_binary(&query_swap_info(deps)?),
    }
}

// ================================================================================================
// EXECUTE FUNCTIONS
// ================================================================================================

fn lock_funds(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
    denom: String,
) -> Result<Response, ContractError> {
    let mut swap = ESCROW.load(deps.storage)?;

    // Check if swap is in pending status
    if swap.status != SwapStatus::Pending {
        return Err(ContractError::SwapAlreadyCompleted);
    }

    // Validate amount matches
    if amount != swap.amount {
        return Err(ContractError::InvalidAmount);
    }

    // Validate denom matches
    if denom != swap.denom {
        return Err(ContractError::InvalidDenom);
    }

    // Check payment
    let paid = must_pay(&info, &denom).map_err(|e| ContractError::InsufficientFunds { 
        required: amount.to_string(), 
        got: e.to_string() 
    })?;
    if paid != amount {
        return Err(ContractError::InsufficientFunds { 
            required: amount.to_string(), 
            got: paid.to_string() 
        });
    }

    // Update swap status
    swap.status = SwapStatus::Funded;
    swap.resolver = Some(info.sender.clone());
    swap.funded_at = Some(env.block.time);

    ESCROW.save(deps.storage, &swap)?;

    Ok(Response::new()
        .add_attribute("method", "lock_funds")
        .add_attribute("resolver", info.sender)
        .add_attribute("amount", amount))
}

fn reveal_secret(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    secret: Vec<u8>,
) -> Result<Response, ContractError> {
    let mut swap = ESCROW.load(deps.storage)?;

    // Check if swap is funded
    if swap.status != SwapStatus::Funded {
        return Err(ContractError::SwapNotFunded);
    }

    // Check timelock
    if env.block.time.seconds() > swap.timelock {
        return Err(ContractError::TimelockExpired);
    }

    // Verify secret
    let secret_hash = Sha256::digest(&secret).to_vec();
    if secret_hash != swap.hashlock {
        return Err(ContractError::InvalidSecret);
    }

    // Update swap status
    swap.status = SwapStatus::Completed;
    swap.completed_at = Some(env.block.time);

    ESCROW.save(deps.storage, &swap)?;

    // Transfer tokens to maker
    let transfer_msg = BankMsg::Send {
        to_address: swap.maker.to_string(),
        amount: vec![cosmwasm_std::Coin {
            denom: swap.denom,
            amount: swap.amount,
        }],
    };

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("method", "reveal_secret")
        .add_attribute("maker", swap.maker)
        .add_attribute("amount", swap.amount))
}

fn cancel_swap(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
) -> Result<Response, ContractError> {
    let mut swap = ESCROW.load(deps.storage)?;

    // Check if swap can be cancelled
    if swap.status == SwapStatus::Completed {
        return Err(ContractError::SwapAlreadyCompleted);
    }

    if swap.status == SwapStatus::Cancelled {
        return Err(ContractError::SwapAlreadyCompleted);
    }

    // Check timelock
    if env.block.time.seconds() <= swap.timelock {
        return Err(ContractError::TimelockNotExpired);
    }

    // Determine who should receive the funds based on current state
    let mut messages = vec![];
    let refund_recipient = match swap.status {
        SwapStatus::Pending => {
            // If not funded, no funds to return
            None
        }
        SwapStatus::Funded => {
            // If funded, return funds to the resolver (who provided the funds)
            swap.resolver.clone()
        }
        SwapStatus::Completed | SwapStatus::Cancelled => {
            // These cases are already handled above
            None
        }
    };

    // Update swap status
    swap.status = SwapStatus::Cancelled;
    ESCROW.save(deps.storage, &swap)?;

    // Return funds to appropriate party
    if let Some(recipient) = refund_recipient.clone() {
        let transfer_msg = BankMsg::Send {
            to_address: recipient.to_string(),
            amount: vec![cosmwasm_std::Coin {
                denom: swap.denom.clone(),
                amount: swap.amount,
            }],
        };
        messages.push(cosmwasm_std::CosmosMsg::Bank(transfer_msg));
    }

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("method", "cancel_swap")
        .add_attribute("status", "cancelled")
        .add_attribute("refund_recipient", refund_recipient.map_or("none".to_string(), |addr| addr.to_string())))
}

// ================================================================================================
// QUERY FUNCTIONS
// ================================================================================================

fn query_swap_info(deps: Deps) -> StdResult<SwapInfo> {
    let swap = ESCROW.load(deps.storage)?;
    Ok(SwapInfo {
        maker: swap.maker,
        resolver: swap.resolver,
        amount: swap.amount,
        denom: swap.denom,
        hashlock: swap.hashlock,
        timelock: swap.timelock,
        status: swap.status,
        created_at: swap.created_at,
        funded_at: swap.funded_at,
        completed_at: swap.completed_at,
    })
}