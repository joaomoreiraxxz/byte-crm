import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { env } from './config/env.js';
import { checkConnection } from './config/database.js';
import { checkRedisConnection } from './config/redis.js';
import { initWebSocket } from './config/websocket.js';
import { applySentinela } from './middleware/sentinela.js';
import { globalErrorHandler } from './utils/errors.js';

// Route imports
import authRoutes from './modules/auth/auth.routes.js';
import leadsRoutes from './modules/crm/leads/leads.routes.js';
import whatsappRoutes from './modules/crm/whatsapp/whatsapp.routes.js';
import erpRoutes from './modules/erp/erp.routes.js';
import vaultRoutes from './modules/banco/vault.routes.js';

async function bootstrap(): Promise<void> {
  const app = express();
  const httpServer = createServer(app);

  // ─── Core Middleware ─────────────────────────────────────────
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", env.CORS_ORIGIN],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 'Authorization', 'X-CSRF-Token',
      'X-Vault-Session', 'X-Request-ID',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit', 'X-RateLimit-Remaining',
      'X-RateLimit-Reset', 'Retry-After',
    ],
    maxAge: 86400,
  }));

  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());

  // Request logging
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // ─── Health Check (before Sentinela) ─────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'bytecrm-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ─── Apply Sentinela Security Stack ──────────────────────────
  const apiRouter = express.Router();
  applySentinela(apiRouter);

  // ─── Mount Routes ────────────────────────────────────────────
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/crm/leads', leadsRoutes);
  apiRouter.use('/', whatsappRoutes);         // /webhooks/evolution + /whatsapp/*
  apiRouter.use('/erp', erpRoutes);
  apiRouter.use('/vault', vaultRoutes);

  // Prefix all API routes with /api/v1
  app.use('/api/v1', apiRouter);

  // ─── 404 Handler ─────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ─── Global Error Handler ───────────────────────────────────
  app.use(globalErrorHandler);

  // ─── Initialize Services ────────────────────────────────────
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         CRM BYTE — Backend Service          ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Database
  const dbConnected = await checkConnection();
  if (!dbConnected) {
    console.error('ERROR: Cannot connect to PostgreSQL. The app will stay alive but API calls will fail.');
  }

  // Redis
  const redisConnected = await checkRedisConnection();
  if (!redisConnected) {
    console.error('ERROR: Cannot connect to Redis. The app will stay alive but caching/sessions will fail.');
  }

  // WebSocket
  initWebSocket(httpServer);

  // ─── Start Server ───────────────────────────────────────────
  httpServer.listen(env.PORT, () => {
    console.log(`\n🚀 API Server running on port ${env.PORT}`);
    console.log(`📡 Environment: ${env.NODE_ENV}`);
    console.log(`🔗 CORS origin: ${env.CORS_ORIGIN}`);
    console.log(`🛡️  Sentinela: Active`);
    console.log(`🔌 WebSocket: Active`);
    console.log('');
  });

  // ─── Graceful Shutdown ──────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error('FATAL: Bootstrap failed:', error);
  process.exit(1);
});
