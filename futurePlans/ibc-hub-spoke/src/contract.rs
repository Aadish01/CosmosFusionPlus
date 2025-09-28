use cosmwasm_std::{
    entry_point, to_json_binary, Binary, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult, WasmMsg,
};

use crate::error::ContractError;
use crate::msg::{ConfigResponse, ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Config, CONFIG, ROUTES};
use cosmwasm_std::{IbcMsg, IbcTimeout};

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
    Ok(Response::new().add_attribute("method", "instantiate"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateOrder { swap_hash, maker, amount, denom, hashlock, timelock, .. } => {
            let config = CONFIG.load(deps.storage)?;
            let msg = to_json_binary(&serde_json::json!({
                "create_h_t_l_c": {
                    "swap_hash": swap_hash,
                    "maker": maker,
                    "amount": amount,
                    "denom": denom,
                    "hashlock": hashlock,
                    "timelock": timelock
                }
            }))?;
            let exec = WasmMsg::Execute { contract_addr: config.htlc_factory.to_string(), msg, funds: vec![] };
            Ok(Response::new().add_message(exec).add_attribute("method", "CreateOrder"))
        }
        ExecuteMsg::SetRoute { chain, channel_id } => {
            ROUTES.save(deps.storage, chain.clone(), &channel_id)?;
            Ok(Response::new().add_attribute("action", "set_route").add_attribute("chain", chain).add_attribute("channel", channel_id))
        }
        ExecuteMsg::SendCreateHTLC { swap_hash, maker, amount, denom, hashlock, timelock, dest_chain } => {
            let channel = ROUTES.may_load(deps.storage, dest_chain.clone())?
                .ok_or_else(|| ContractError::InvalidIBCChannel { channel: dest_chain.clone() })?;

            let packet = serde_json::to_vec(&crate::ibc::IbcPacket {
                action: crate::ibc::IbcAction::CreateHTLC { swap_hash: swap_hash.clone(), maker: maker.clone(), amount: amount.clone(), denom: denom.clone(), hashlock: hashlock.clone(), timelock },
            }).map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

            // Simple time-based timeout: 5 minutes from now
            let ibc_msg = IbcMsg::SendPacket {
                channel_id: channel.clone(),
                data: packet.into(),
                timeout: IbcTimeout::with_timestamp(env.block.time.plus_seconds(300)),
            };

            Ok(Response::new()
                .add_message(CosmosMsg::Ibc(ibc_msg))
                .add_attribute("action", "send_create_htlc")
                .add_attribute("channel", channel)
                .add_attribute("swap_hash", swap_hash))
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => {
            let cfg = CONFIG.load(deps.storage)?;
            to_json_binary(&ConfigResponse { admin: cfg.admin, htlc_factory: cfg.htlc_factory, ibc_channel: cfg.ibc_channel })
        }
    }
}


