import { Request, Response, NextFunction } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
}

export function validateContentType(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'POST' || req.method === 'PUT') {
    const ct = req.header('content-type')?.toLowerCase() || '';
    if (!ct.includes('application/json')) {
      return res.status(415).json({ success: false, error: 'Unsupported Media Type, expected application/json' });
    }
  }
  next();
}

export function validateRequestSize(req: Request, res: Response, next: NextFunction) {
  const len = Number(req.header('content-length') || 0);
  if (len > 10 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: 'Payload Too Large' });
  }
  next();
}

export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  // keep minimal to avoid noise; full logging via winston in services
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}


