import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import logger from './utils/logger';

import { securityHeaders, validateContentType, validateRequestSize, requestLogger } from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import swapRoutes from './routes/swap';
import RelayerService from './services/RelayerService';

async function createApp(): Promise<express.Application> {
  const app = express();

  app.use(compression());
  app.use(securityHeaders);
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key'],
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(validateContentType);
  app.use(validateRequestSize);
  app.use(requestLogger);

  const relayerService = await RelayerService.create();
  app.locals.relayerService = relayerService;

  app.get('/health', (_, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  app.use('/api/swap', swapRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function startServer(): Promise<void> {
  const app = await createApp();
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';
  const server = createServer(app);

  server.listen(port, host, () => {
    logger.info('Server started', { port, host, env: process.env.NODE_ENV || 'development' });
  });

  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Startup failed', err);
    process.exit(1);
  });
}

export { createApp, startServer };


