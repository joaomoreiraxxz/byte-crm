import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { redis } from './redis.js';
import { handleSSHSocket } from '../modules/system/ssh.socket.js';

let io: Server;

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
}

/**
 * Initialize Socket.IO server with JWT authentication
 * and tenant-based room management.
 */
export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6, // 1MB
  });

  // ─── Authentication Middleware ──────────────────────────────
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        tenantId: string;
        role: string;
      };

      socket.userId = decoded.userId;
      socket.tenantId = decoded.tenantId;

      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  // ─── Connection Handler ─────────────────────────────────────
  io.on('connection', (socket: AuthenticatedSocket) => {
    const { userId, tenantId } = socket;

    if (!tenantId || !userId) {
      socket.disconnect(true);
      return;
    }

    console.log(`[WS] User ${userId} connected (tenant: ${tenantId})`);

    // Join tenant-scoped rooms
    socket.join(`tenant:${tenantId}`);
    socket.join(`tenant:${tenantId}:user:${userId}`);

    // Track online users in Redis
    redis.sadd(`ws:online:${tenantId}`, userId);

    // ── Join lead-specific chat rooms ──
    socket.on('join:lead', (leadId: string) => {
      if (leadId && typeof leadId === 'string') {
        socket.join(`tenant:${tenantId}:lead:${leadId}`);
        console.log(`[WS] User ${userId} joined lead room: ${leadId}`);
      }
    });

    socket.on('leave:lead', (leadId: string) => {
      if (leadId && typeof leadId === 'string') {
        socket.leave(`tenant:${tenantId}:lead:${leadId}`);
      }
    });

    // ── WhatsApp typing indicator ──
    socket.on('whatsapp:typing', (data: { leadId: string; isTyping: boolean }) => {
      socket
        .to(`tenant:${tenantId}:lead:${data.leadId}`)
        .emit('whatsapp:typing', { userId, ...data });
    });

    // ── Disconnect ──
    socket.on('disconnect', (reason) => {
      console.log(`[WS] User ${userId} disconnected: ${reason}`);
      redis.srem(`ws:online:${tenantId}`, userId!);
    });

    // ── SSH Terminal ──
    handleSSHSocket(socket as any);
  });

  console.log('[WS] Socket.IO initialized');
  return io;
}

/**
 * Get the Socket.IO server instance.
 * Must be called after initWebSocket().
 */
export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initWebSocket() first.');
  }
  return io;
}

/**
 * Emit an event to all users in a tenant room.
 */
export function emitToTenant(tenantId: string, event: string, data: unknown): void {
  getIO().to(`tenant:${tenantId}`).emit(event, data);
}

/**
 * Emit an event to a specific lead's chat room.
 */
export function emitToLeadRoom(
  tenantId: string,
  leadId: string,
  event: string,
  data: unknown
): void {
  getIO().to(`tenant:${tenantId}:lead:${leadId}`).emit(event, data);
}

/**
 * Emit an event to a specific user.
 */
export function emitToUser(tenantId: string, userId: string, event: string, data: unknown): void {
  getIO().to(`tenant:${tenantId}:user:${userId}`).emit(event, data);
}

export default { initWebSocket, getIO, emitToTenant, emitToLeadRoom, emitToUser };
