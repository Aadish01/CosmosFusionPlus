use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Addr, Uint128, Timestamp, WasmMsg,
};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, OrderInfo, OrderStatus, ConfigResponse};
use crate::state::{Config, Order, CONFIG, ORDERS, MAKER_ORDERS};
use crate::ibc::{process_ibc_packet, send_create_htlc_ibc};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let config = Config {
        admin: deps.api.addr_validate(&msg.admin)?,
        htlc_factory: deps.api.addr_validate(&msg.htlc_factory)?,
        ibc_channel: msg.ibc_channel,
    };

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", config.admin)
        .add_attribute("htlc_factory", config.htlc_factory)
        .add_attribute("ibc_channel", config.ibc_channel))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateOrder {
            swap_hash,
            maker,
            amount,
            denom,
            hashlock,
            timelock,
            target_chain,
        } => create_order(deps, env, info, swap_hash, maker, amount, denom, hashlock, timelock, target_chain),
        
        ExecuteMsg::UpdateOrderStatus { swap_hash, status } => {
            update_order_status(deps, info, swap_hash, status)
        }
        
        ExecuteMsg::ProcessIBCPacket { channel_id, packet_data } => {
            process_ibc_packet(deps, env, info, channel_id, packet_data)
        }
        
        ExecuteMsg::UpdateHTLCFactory { htlc_factory } => {
            update_htlc_factory(deps, info, htlc_factory)
        }
        
        ExecuteMsg::UpdateIBCChannel { channel_id } => {
            update_ibc_channel(deps, info, channel_id)
        }
        
        ExecuteMsg::UpdateAdmin { admin } => {
            update_admin(deps, info, admin)
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetOrder { swap_hash } => to_json_binary(&query_order(deps, swap_hash)?),
        QueryMsg::GetOrdersByMaker { maker } => to_json_binary(&query_orders_by_maker(deps, maker)?),
        QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
    }
}

// ================================================================================================
// EXECUTE FUNCTIONS
// ================================================================================================

fn create_order(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    swap_hash: String,
    maker: String,
    amount: Uint128,
    denom: String,
    hashlock: Vec<u8>,
    timelock: u64,
    target_chain: String,
) -> Result<Response, ContractError> {
    // Check if order already exists
    if ORDERS.has(deps.storage, swap_hash.clone()) {
        return Err(ContractError::OrderAlreadyExists { order_id: swap_hash });
    }

    // Validate timelock
    if timelock <= env.block.time.seconds() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err("Timelock expired")));
    }

    // Validate amount
    if amount.is_zero() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err("Invalid amount")));
    }

    // Validate denom
    if denom.is_empty() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err("Invalid denom")));
    }

    let maker_addr = deps.api.addr_validate(&maker)?;

    let order = Order {
        swap_hash: swap_hash.clone(),
        maker: maker_addr.clone(),
        amount,
        denom: denom.clone(),
        hashlock,
        timelock,
        target_chain: target_chain.clone(),
        status: OrderStatus::Pending,
        created_at: env.block.time,
        htlc_address: None,
    };

    ORDERS.save(deps.storage, swap_hash.clone(), &order)?;

    // Add to maker's orders
    let mut maker_orders = MAKER_ORDERS
        .may_load(deps.storage, maker_addr.clone())?
        .unwrap_or_default();
    maker_orders.push(swap_hash.clone());
    MAKER_ORDERS.save(deps.storage, maker_addr, &maker_orders)?;

    // Create HTLC via factory
    let create_htlc_msg = WasmMsg::Execute {
        contract_addr: CONFIG.load(deps.storage)?.htlc_factory.to_string(),
        msg: cosmwasm_std::to_json_binary(&serde_json::json!({
            "create_h_t_l_c": {
                "swap_hash": swap_hash.clone(),
                "maker": maker.clone(),
                "amount": amount.to_string(),
                "denom": denom,
                "hashlock": order.hashlock.clone(),
                "timelock": timelock
            }
        }))?,
        funds: vec![],
    };

    // Send IBC packet to target chain
    let _ibc_response = send_create_htlc_ibc(
        deps,
        env,
        swap_hash.clone(),
        maker,
        amount,
        order.denom.clone(),
        order.hashlock.clone(),
        timelock,
        target_chain,
    )?;

    Ok(Response::new()
        .add_message(create_htlc_msg)
        .add_attribute("method", "create_order")
        .add_attribute("swap_hash", swap_hash))
}

fn update_order_status(
    deps: DepsMut,
    info: MessageInfo,
    swap_hash: String,
    status: OrderStatus,
) -> Result<Response, ContractError> {
    let mut order = ORDERS.load(deps.storage, swap_hash.clone())
        .map_err(|_| ContractError::OrderNotFound { order_id: swap_hash.clone() })?;

    // Only admin or HTLC factory can update status
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin && info.sender != config.htlc_factory {
        return Err(ContractError::Unauthorized { 
            msg: "Only admin or HTLC factory can update order status".to_string() 
        });
    }

    order.status = status.clone();
    ORDERS.save(deps.storage, swap_hash.clone(), &order)?;

    Ok(Response::new()
        .add_attribute("method", "update_order_status")
        .add_attribute("swap_hash", swap_hash)
        .add_attribute("status", format!("{:?}", status)))
}

fn update_htlc_factory(
    deps: DepsMut,
    info: MessageInfo,
    htlc_factory: String,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    
    // Check if sender is admin
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized { 
            msg: "Only admin can update HTLC factory".to_string() 
        });
    }

    // Validate new HTLC factory address
    let new_htlc_factory = deps.api.addr_validate(&htlc_factory)?;
    config.htlc_factory = new_htlc_factory.clone();
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "update_htlc_factory")
        .add_attribute("htlc_factory", new_htlc_factory))
}

fn update_ibc_channel(
    deps: DepsMut,
    info: MessageInfo,
    channel_id: String,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    
    // Check if sender is admin
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized { 
            msg: "Only admin can update IBC channel".to_string() 
        });
    }

    config.ibc_channel = channel_id.clone();
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "update_ibc_channel")
        .add_attribute("channel_id", channel_id))
}

fn update_admin(
    deps: DepsMut,
    info: MessageInfo,
    admin: String,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    
    // Check if sender is current admin
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized { 
            msg: "Only admin can update admin".to_string() 
        });
    }

    // Validate new admin address
    let new_admin = deps.api.addr_validate(&admin)?;
    config.admin = new_admin.clone();
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "update_admin")
        .add_attribute("admin", new_admin))
}

// ================================================================================================
// QUERY FUNCTIONS
// ================================================================================================

fn query_order(deps: Deps, swap_hash: String) -> StdResult<OrderInfo> {
    let order = ORDERS.load(deps.storage, swap_hash)?;
    Ok(OrderInfo {
        swap_hash: order.swap_hash,
        maker: order.maker,
        amount: order.amount,
        denom: order.denom,
        hashlock: order.hashlock,
        timelock: order.timelock,
        target_chain: order.target_chain,
        htlc_address: order.htlc_address,
        status: order.status,
        created_at: order.created_at,
    })
}

fn query_orders_by_maker(deps: Deps, maker: String) -> StdResult<Vec<OrderInfo>> {
    let maker_addr = deps.api.addr_validate(&maker)?;
    let swap_hashes = MAKER_ORDERS.load(deps.storage, maker_addr).unwrap_or_default();
    
    let mut orders = Vec::new();
    for swap_hash in swap_hashes {
        if let Ok(order) = query_order(deps, swap_hash) {
            orders.push(order);
        }
    }
    
    Ok(orders)
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: config.admin,
        htlc_factory: config.htlc_factory,
        ibc_channel: config.ibc_channel,
    })
}