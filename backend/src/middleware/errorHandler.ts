import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: 'Not found' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  logger.error('Unhandled error', err);
  const status = err?.status || 500;
  const message = err?.message || 'Internal Server Error';
  res.status(status).json({ success: false, error: message });
}


