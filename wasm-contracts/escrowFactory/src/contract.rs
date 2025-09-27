use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Addr, Uint128, WasmMsg, SubMsg, Reply, SubMsgResult, Order, StdError,
};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, HTLCInfo as EscrowInfoMsg, ConfigResponse};
use crate::state::{Config, EscrowInfo as EscrowInfoState, CONFIG, ESCROWS, MAKER_ESCROWS};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let config = Config {
        admin: deps.api.addr_validate(&msg.admin)?,
        htlc_code_id: msg.htlc_code_id,
    };

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", config.admin)
        .add_attribute("htlc_code_id", config.htlc_code_id.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateHTLC {
            swap_hash,
            maker,
            amount,
            denom,
            hashlock,
            timelock,
        } => create_htlc(deps, env, info, swap_hash, maker, amount, denom, hashlock, timelock),
        
        ExecuteMsg::UpdateHTLCCodeId { code_id } => {
            update_htlc_code_id(deps, info, code_id)
        }
        
        ExecuteMsg::UpdateAdmin { admin } => update_admin(deps, info, admin),
    }
}

// ================================================================================================
// REPLY HANDLER
// ================================================================================================

#[entry_point]
pub fn reply(deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    match msg.result {
        SubMsgResult::Ok(res) => {
            // Find instantiated contract address from events
            let mut contract_addr: Option<String> = None;
            for event in res.events {
                if event.ty == "instantiate" || event.ty == "wasm" {
                    for attr in event.attributes {
                        if attr.key == "_contract_address" || attr.key == "contract_address" {
                            contract_addr = Some(attr.value);
                            break;
                        }
                    }
                }
                if contract_addr.is_some() {
                    break;
                }
            }

            let htlc_address = Addr::unchecked(
                contract_addr.ok_or_else(|| StdError::generic_err("No _contract_address in reply"))?,
            );

            // Update the most recent pending HTLC (with empty address)
            let mut pending_key: Option<String> = None;
            let mut pending_info: Option<EscrowInfoState> = None;
            for item in ESCROWS.range(deps.storage, None, None, Order::Descending) {
                let (key, info) = item.map_err(|e| StdError::generic_err(e.to_string()))?;
                if info.htlc_address == Addr::unchecked("") {
                    pending_key = Some(key);
                    pending_info = Some(info);
                    break;
                }
            }

            let key = pending_key.ok_or_else(|| StdError::generic_err("No pending HTLC to update"))?;
            let mut info = pending_info.ok_or_else(|| StdError::generic_err("No pending HTLC info"))?;
            info.htlc_address = htlc_address.clone();
            ESCROWS.save(deps.storage, key.clone(), &info)?;

            Ok(Response::new()
                .add_attribute("method", "reply")
                .add_attribute("htlc_address", htlc_address)
                .add_attribute("swap_hash", info.swap_hash))
        }
        SubMsgResult::Err(err) => Err(ContractError::Std(StdError::generic_err(err))),
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetHTLC { swap_hash } => to_json_binary(&query_htlc(deps, swap_hash)?),
        QueryMsg::GetHTLCsByMaker { maker } => to_json_binary(&query_htlcs_by_maker(deps, maker)?),
        QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
    }
}

// ================================================================================================
// EXECUTE FUNCTIONS
// ================================================================================================

fn create_htlc(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    swap_hash: String,
    maker: String,
    amount: Uint128,
    denom: String,
    hashlock: Vec<u8>,
    timelock: u64,
) -> Result<Response, ContractError> {
    // Check if HTLC already exists
    if ESCROWS.has(deps.storage, swap_hash.clone()) {
        return Err(ContractError::HTLCAlreadyExists { swap_hash });
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
    let config = CONFIG.load(deps.storage)?;

    // Create HTLC contract instantiation message
    let htlc_init_msg = serde_json::json!({
        "admin": config.admin.to_string(),
        "maker": maker.clone(),
        "amount": amount.to_string(),
        "denom": denom.clone(),
        "hashlock": hashlock.clone(),
        "timelock": timelock
    });

    let instantiate_msg = WasmMsg::Instantiate {
        admin: Some(config.admin.to_string()),
        code_id: config.htlc_code_id,
        msg: to_json_binary(&htlc_init_msg)?,
        funds: vec![],
        label: format!("htlc-{}", swap_hash),
    };

    let sub_msg = SubMsg::reply_on_success(instantiate_msg, 1);

    // Store HTLC info (will be updated in reply)
    let htlc_info = EscrowInfoState {
        swap_hash: swap_hash.clone(),
        htlc_address: Addr::unchecked(""), // Will be updated in reply
        maker: maker_addr.clone(),
        amount,
        denom: denom.clone(),
        hashlock,
        timelock,
        created_at: env.block.time,
    };

    ESCROWS.save(deps.storage, swap_hash.clone(), &htlc_info)?;

    // Add to maker's HTLCs
    let mut maker_htlcs = MAKER_ESCROWS
        .may_load(deps.storage, maker_addr.clone())?
        .unwrap_or_default();
    maker_htlcs.push(swap_hash.clone());
    MAKER_ESCROWS.save(deps.storage, maker_addr, &maker_htlcs)?;

    Ok(Response::new()
        .add_submessage(sub_msg)
        .add_attribute("method", "create_htlc")
        .add_attribute("swap_hash", swap_hash)
        .add_attribute("maker", maker)
        .add_attribute("amount", amount)
        .add_attribute("timelock", timelock.to_string()))
}

fn update_htlc_code_id(
    deps: DepsMut,
    info: MessageInfo,
    code_id: u64,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    
    // Check if sender is admin
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized { 
            msg: "Only admin can update HTLC code ID".to_string() 
        });
    }

    config.htlc_code_id = code_id;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "update_htlc_code_id")
        .add_attribute("code_id", code_id.to_string()))
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

fn query_htlc(deps: Deps, swap_hash: String) -> StdResult<EscrowInfoMsg> {
    let htlc_info = ESCROWS.load(deps.storage, swap_hash)?;
    Ok(EscrowInfoMsg {
        swap_hash: htlc_info.swap_hash,
        htlc_address: htlc_info.htlc_address,
        maker: htlc_info.maker,
        amount: htlc_info.amount,
        denom: htlc_info.denom,
        hashlock: htlc_info.hashlock,
        timelock: htlc_info.timelock,
        created_at: htlc_info.created_at,
    })
}

fn query_htlcs_by_maker(deps: Deps, maker: String) -> StdResult<Vec<EscrowInfoMsg>> {
    let maker_addr = deps.api.addr_validate(&maker)?;
    let swap_hashes = MAKER_ESCROWS.load(deps.storage, maker_addr).unwrap_or_default();
    
    let mut htlcs = Vec::new();
    for swap_hash in swap_hashes {
        if let Ok(htlc) = query_htlc(deps, swap_hash) {
            htlcs.push(htlc);
        }
    }
    
    Ok(htlcs)
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: config.admin,
        htlc_code_id: config.htlc_code_id,
    })
}
