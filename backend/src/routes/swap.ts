import express from 'express';
import RelayerService from '../services/RelayerService';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiResponse, ExecuteSwapOrderRequest, UserIntent } from '../types';

const router = express.Router();

router.post(
  '/eth_to_cosmos/build',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const userIntent: UserIntent = req.body;
    const built = relayerService.buildEvmSwapOrder(userIntent);
    if (!built) return res.status(400).json({ success: false, error: 'Failed to build swap order' } satisfies ApiResponse);
    return res.status(200).json({ success: true, data: built } satisfies ApiResponse);
  })
);

router.post(
  '/cosmos_to_eth/build',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const userIntent: UserIntent = req.body;
    const order = relayerService.createCosmosToEthOrder(userIntent);
    return res.status(200).json({ success: true, data: { orderHash: order.orderHash } } satisfies ApiResponse);
  })
);

router.post(
  '/eth_to_cosmos',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const { orderHash, signature }: ExecuteSwapOrderRequest = req.body;
    await relayerService.executeEvmSwapOrder(orderHash, signature);
    return res.status(200).json({ success: true, data: { executed: true } } satisfies ApiResponse);
  })
);

router.post(
  '/cosmos_to_eth',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const { orderHash, srcCancellationTimestamp } = req.body as { orderHash: string; srcCancellationTimestamp?: number };
    await relayerService.confirmCosmosToEth(orderHash, srcCancellationTimestamp);
    return res.status(200).json({ success: true, data: { executed: true } } satisfies ApiResponse);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const order = relayerService.getOrderByHash(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' } satisfies ApiResponse);
    return res.status(200).json({ success: true, data: order } satisfies ApiResponse);
  })
);

router.get(
  '/user/:address',
  asyncHandler(async (req, res) => {
    const relayerService = req.app.locals.relayerService as RelayerService;
    const orders = relayerService.getOrdersByUser(req.params.address);
    return res.status(200).json({ success: true, data: { orders, totalOrders: orders.length } } satisfies ApiResponse);
  })
);

export default router;


