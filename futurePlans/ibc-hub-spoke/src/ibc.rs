use cosmwasm_std::{
    entry_point, DepsMut, Env, Response, StdResult, WasmMsg, to_json_binary,
    IbcChannelOpenMsg, IbcChannelConnectMsg, IbcChannelCloseMsg,
    IbcPacketReceiveMsg, IbcPacketAckMsg, IbcPacketTimeoutMsg, IbcReceiveResponse,
    Binary,
};
use crate::state::CONFIG;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub enum IbcAction {
    CreateHTLC {
        swap_hash: String,
        maker: String,
        amount: String,
        denom: String,
        hashlock: Vec<u8>,
        timelock: u64,
    },
    UpdateStatus {
        swap_hash: String,
        status: String,
    },
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IbcPacket {
    pub action: IbcAction,
}

#[entry_point]
pub fn ibc_channel_open(_deps: DepsMut, _env: Env, _msg: IbcChannelOpenMsg) -> StdResult<()> {
    Ok(())
}

#[entry_point]
pub fn ibc_channel_connect(_deps: DepsMut, _env: Env, _msg: IbcChannelConnectMsg) -> StdResult<()> {
    Ok(())
}

#[entry_point]
pub fn ibc_channel_close(_deps: DepsMut, _env: Env, _msg: IbcChannelCloseMsg) -> StdResult<()> {
    Ok(())
}

#[entry_point]
pub fn ibc_packet_receive(deps: DepsMut, _env: Env, msg: IbcPacketReceiveMsg) -> StdResult<IbcReceiveResponse> {
    let data: Binary = msg.packet.data;
    let packet: IbcPacket = serde_json::from_slice(&data).map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    match packet.action {
        IbcAction::CreateHTLC { swap_hash, maker, amount, denom, hashlock, timelock } => {
            let cfg = CONFIG.load(deps.storage)?;
            let exec_msg = to_json_binary(&serde_json::json!({
                "create_h_t_l_c": {
                    "swap_hash": swap_hash,
                    "maker": maker,
                    "amount": amount,
                    "denom": denom,
                    "hashlock": hashlock,
                    "timelock": timelock
                }
            }))?;
            let exec = WasmMsg::Execute { contract_addr: cfg.htlc_factory.to_string(), msg: exec_msg, funds: vec![] };
            Ok(IbcReceiveResponse::new()
                .set_ack(Binary::from(b"ok".to_vec()))
                .add_message(exec))
        }
        IbcAction::UpdateStatus { .. } => {
            // No-op for now; acknowledge
            Ok(IbcReceiveResponse::new().set_ack(Binary::from(b"ok".to_vec())))
        }
    }
}

#[entry_point]
pub fn ibc_packet_ack(_deps: DepsMut, _env: Env, _msg: IbcPacketAckMsg) -> StdResult<Response> {
    Ok(Response::new())
}

#[entry_point]
pub fn ibc_packet_timeout(_deps: DepsMut, _env: Env, _msg: IbcPacketTimeoutMsg) -> StdResult<Response> {
    Ok(Response::new())
}


