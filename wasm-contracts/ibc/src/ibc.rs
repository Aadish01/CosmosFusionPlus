use cosmwasm_std::{DepsMut, Env, MessageInfo, Response, WasmMsg, IbcMsg, to_json_binary};
use crate::error::ContractError;
use crate::msg::{OrderInfo, OrderStatus};
use crate::state::{Config, Order, CONFIG, ORDERS};

/// Process IBC packet from other chains
pub fn process_ibc_packet(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    channel_id: String,
    packet_data: Vec<u8>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    // Verify channel
    if channel_id != config.ibc_channel {
        return Err(ContractError::InvalidIBCChannel { channel: channel_id });
    }
    
    // Parse packet data
    let packet: IBCPacket = serde_json::from_slice(&packet_data)
        .map_err(|_| ContractError::InvalidPacketData)?;
    
    match packet.action {
        IBCAction::CreateHTLC { swap_hash, maker, amount, denom, hashlock, timelock } => {
            create_htlc_from_ibc(deps, env, info, swap_hash, maker, amount, denom, hashlock, timelock)
        }
        IBCAction::UpdateOrderStatus { swap_hash, status } => {
            update_order_status_from_ibc(deps, swap_hash, status)
        }
    }
}

/// Send IBC packet to create HTLC on target chain
pub fn send_create_htlc_ibc(
    deps: DepsMut,
    env: Env,
    swap_hash: String,
    maker: String,
    amount: cosmwasm_std::Uint128,
    denom: String,
    hashlock: Vec<u8>,
    timelock: u64,
    target_chain: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    let packet = IBCPacket {
        action: IBCAction::CreateHTLC {
            swap_hash: swap_hash.clone(),
            maker,
            amount,
            denom,
            hashlock,
            timelock,
        },
    };
    
    let ibc_msg = IbcMsg::SendPacket {
        channel_id: config.ibc_channel,
        data: to_json_binary(&packet)?,
        timeout: cosmwasm_std::IbcTimeout::with_timestamp(env.block.time.plus_seconds(300)), // 5 minutes
    };
    
    Ok(Response::new()
        .add_attribute("method", "send_create_htlc_ibc")
        .add_attribute("swap_hash", swap_hash)
        .add_attribute("target_chain", target_chain))
}

/// Send IBC packet to update order status
pub fn send_update_status_ibc(
    deps: DepsMut,
    env: Env,
    swap_hash: String,
    status: OrderStatus,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    let packet = IBCPacket {
        action: IBCAction::UpdateOrderStatus {
            swap_hash: swap_hash.clone(),
            status,
        },
    };
    
    let ibc_msg = IbcMsg::SendPacket {
        channel_id: config.ibc_channel,
        data: to_json_binary(&packet)?,
        timeout: cosmwasm_std::IbcTimeout::with_timestamp(env.block.time.plus_seconds(300)),
    };
    
    Ok(Response::new()
        .add_attribute("method", "send_update_status_ibc")
        .add_attribute("swap_hash", swap_hash))
}

/// Create HTLC contract from IBC packet
fn create_htlc_from_ibc(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    swap_hash: String,
    maker: String,
    amount: cosmwasm_std::Uint128,
    denom: String,
    hashlock: Vec<u8>,
    timelock: u64,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    // Check if order already exists
    if ORDERS.has(deps.storage, swap_hash.clone()) {
        return Err(ContractError::OrderAlreadyExists { order_id: swap_hash });
    }
    
    let maker_addr = deps.api.addr_validate(&maker)?;
    
    // Create order
    let order = Order {
        swap_hash: swap_hash.clone(),
        maker: maker_addr.clone(),
        amount,
        denom: denom.clone(),
        hashlock,
        timelock,
        target_chain: "unknown".to_string(),
        status: OrderStatus::Pending,
        created_at: env.block.time,
        htlc_address: None,
    };
    
    ORDERS.save(deps.storage, swap_hash.clone(), &order)?;
    
    // Create HTLC contract via factory
    let create_htlc_msg = WasmMsg::Execute {
        contract_addr: config.htlc_factory.to_string(),
        msg: cosmwasm_std::to_json_binary(&serde_json::json!({
            "create_h_t_l_c": {
                "swap_hash": swap_hash.clone(),
                "maker": maker,
                "amount": amount.to_string(),
                "denom": denom,
                "hashlock": order.hashlock.clone(),
                "timelock": timelock
            }
        }))?,
        funds: vec![],
    };
    
    Ok(Response::new()
        .add_message(create_htlc_msg)
        .add_attribute("method", "create_htlc_from_ibc")
        .add_attribute("swap_hash", swap_hash))
}

/// Update order status from IBC packet
fn update_order_status_from_ibc(
    deps: DepsMut,
    swap_hash: String,
    status: OrderStatus,
) -> Result<Response, ContractError> {
    let mut order = ORDERS.load(deps.storage, swap_hash.clone())
        .map_err(|_| ContractError::OrderNotFound { order_id: swap_hash.clone() })?;
    
    order.status = status.clone();
    ORDERS.save(deps.storage, swap_hash.clone(), &order)?;
    
    Ok(Response::new()
        .add_attribute("method", "update_order_status_from_ibc")
        .add_attribute("swap_hash", swap_hash)
        .add_attribute("status", format!("{:?}", status)))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct IBCPacket {
    action: IBCAction,
}

#[derive(serde::Serialize, serde::Deserialize)]
enum IBCAction {
    CreateHTLC {
        swap_hash: String,
        maker: String,
        amount: cosmwasm_std::Uint128,
        denom: String,
        hashlock: Vec<u8>,
        timelock: u64,
    },
    UpdateOrderStatus {
        swap_hash: String,
        status: OrderStatus,
    },
}