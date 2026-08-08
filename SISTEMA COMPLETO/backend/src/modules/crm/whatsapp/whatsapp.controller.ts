import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { query } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { emitToTenant, emitToLeadRoom } from '../../../config/websocket.js';
import { ValidationError } from '../../../utils/errors.js';

/**
 * Receive webhook events from Evolution API.
 * POST /api/v1/webhooks/evolution
 *
 * Events handled:
 * - messages.upsert: New incoming/outgoing message
 * - messages.update: Message status change (delivered, read)
 * - connection.update: Instance connection status change
 */
export async function handleEvolutionWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { event, instance, data } = req.body;

    if (!event || !data) {
      res.status(200).json({ received: true }); // Acknowledge silently
      return;
    }

    console.log(`[WHATSAPP] Webhook received: ${event} from instance: ${instance}`);

    // Find the WhatsApp instance
    const instanceResult = await query(
      `SELECT wi.id, wi.tenant_id FROM whatsapp_instances wi
       WHERE wi.instance_name = $1 OR wi.instance_id = $1
       LIMIT 1`,
      [instance]
    );

    if (instanceResult.rows.length === 0) {
      console.warn(`[WHATSAPP] Unknown instance: ${instance}`);
      res.status(200).json({ received: true });
      return;
    }

    const waInstance = instanceResult.rows[0];
    const tenantId = waInstance.tenant_id;

    switch (event) {
      case 'messages.upsert':
        await handleMessageUpsert(waInstance.id, tenantId, data);
        break;

      case 'messages.update':
        await handleMessageUpdate(tenantId, data);
        break;

      case 'connection.update':
        await handleConnectionUpdate(waInstance.id, data);
        break;

      default:
        console.log(`[WHATSAPP] Unhandled event: ${event}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WHATSAPP] Webhook processing error:', error);
    // Always return 200 to prevent retries
    res.status(200).json({ received: true, error: 'processing_failed' });
  }
}

/**
 * Handle incoming message (messages.upsert).
 */
async function handleMessageUpsert(
  instanceId: string,
  tenantId: string,
  data: any
): Promise<void> {
  const messages = Array.isArray(data) ? data : [data];

  for (const msg of messages) {
    const key = msg.key || {};
    const messageInfo = msg.message || {};

    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') continue;

    const isFromMe = key.fromMe || false;
    const messageId = key.id;

    // Determine message type and content
    const { type, content, mediaUrl, mediaMimetype } = extractMessageContent(messageInfo);

    // Find or create lead by JID
    const leadId = await findOrCreateLeadByJid(tenantId, instanceId, remoteJid, msg.pushName);

    // Save message
    const savedMessage = await query(
      `INSERT INTO whatsapp_messages (
        tenant_id, instance_id, lead_id, remote_jid, message_id,
        direction, type, content, media_url, media_mimetype,
        is_from_me, sender_name, sender_phone, quoted_message_id, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO NOTHING
      RETURNING *`,
      [
        tenantId, instanceId, leadId, remoteJid, messageId,
        isFromMe ? 'outbound' : 'inbound',
        type, content || null, mediaUrl || null, mediaMimetype || null,
        isFromMe,
        msg.pushName || null,
        remoteJid.replace('@s.whatsapp.net', ''),
        key.quotedMessage?.stanzaId || null,
        JSON.stringify({ pushName: msg.pushName, timestamp: msg.messageTimestamp }),
      ]
    );

    if (savedMessage.rows.length > 0) {
      const newMessage = savedMessage.rows[0];

      // Update contact's last message time and unread count
      await query(
        `INSERT INTO whatsapp_contacts (tenant_id, instance_id, jid, push_name, phone, last_message_at, unread_count)
         VALUES ($1, $2, $3, $4, $5, NOW(), CASE WHEN $6 THEN 0 ELSE 1 END)
         ON CONFLICT (tenant_id, instance_id, jid) DO UPDATE SET
           push_name = COALESCE(EXCLUDED.push_name, whatsapp_contacts.push_name),
           last_message_at = NOW(),
           unread_count = CASE WHEN $6 THEN whatsapp_contacts.unread_count ELSE whatsapp_contacts.unread_count + 1 END`,
        [
          tenantId, instanceId, remoteJid,
          msg.pushName || null,
          remoteJid.replace('@s.whatsapp.net', ''),
          isFromMe,
        ]
      );

      // Update lead's last_contact_at
      if (leadId) {
        await query(
          'UPDATE leads SET last_contact_at = NOW() WHERE id = $1',
          [leadId]
        );
      }

      // Emit WebSocket events
      emitToTenant(tenantId, 'whatsapp:message:new', {
        message: newMessage,
        leadId,
        remoteJid,
      });

      if (leadId) {
        emitToLeadRoom(tenantId, leadId, 'whatsapp:message:new', {
          message: newMessage,
        });
      }

      // Emit contact list update
      emitToTenant(tenantId, 'whatsapp:contacts:update', {
        jid: remoteJid,
        lastMessageAt: new Date().toISOString(),
        lastMessage: content?.substring(0, 100),
        unreadIncrement: isFromMe ? 0 : 1,
      });
    }
  }
}

/**
 * Handle message status update (delivered, read, etc.).
 */
async function handleMessageUpdate(tenantId: string, data: any): Promise<void> {
  const updates = Array.isArray(data) ? data : [data];

  for (const update of updates) {
    const messageId = update.key?.id;
    const status = mapMessageStatus(update.update?.status);

    if (messageId && status) {
      await query(
        `UPDATE whatsapp_messages SET status = $1
         WHERE message_id = $2 AND tenant_id = $3`,
        [status, messageId, tenantId]
      );

      emitToTenant(tenantId, 'whatsapp:message:status', {
        messageId,
        status,
      });
    }
  }
}

/**
 * Handle connection status change.
 */
async function handleConnectionUpdate(instanceId: string, data: any): Promise<void> {
  const state = data.state || data.connection;
  const statusMap: Record<string, string> = {
    open: 'connected',
    close: 'disconnected',
    connecting: 'connecting',
  };

  const status = statusMap[state] || 'disconnected';

  await query(
    `UPDATE whatsapp_instances SET status = $1, phone_number = COALESCE($2, phone_number)
     WHERE id = $3`,
    [status, data.legacy?.phoneNumber || null, instanceId]
  );
}

/**
 * Send a text message via Evolution API.
 * POST /api/v1/whatsapp/send
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { instanceId, remoteJid, message, leadId } = req.body;
    const tenantId = req.tenantId!;

    if (!instanceId || !remoteJid || !message) {
      throw new ValidationError('instanceId, remoteJid, and message are required');
    }

    // Get instance details
    const instanceResult = await query(
      `SELECT instance_name, api_url, api_key_encrypted, api_key_iv, api_key_tag
       FROM whatsapp_instances WHERE id = $1 AND tenant_id = $2`,
      [instanceId, tenantId]
    );

    if (instanceResult.rows.length === 0) {
      throw new ValidationError('WhatsApp instance not found');
    }

    const instance = instanceResult.rows[0];

    // Decrypt API key
    const { decryptWithKey } = await import('../../../utils/encryption.js');
    const apiKey = decryptWithKey(
      instance.api_key_encrypted,
      env.AUDIT_ENCRYPTION_KEY,
      instance.api_key_iv,
      instance.api_key_tag
    );

    // Send via Evolution API
    const evolutionResponse = await axios.post(
      `${instance.api_url}/message/sendText/${instance.instance_name}`,
      {
        number: remoteJid.replace('@s.whatsapp.net', ''),
        text: message,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        timeout: 30000,
      }
    );

    const sentMessageId = evolutionResponse.data?.key?.id;

    // Save outbound message
    const savedMessage = await query(
      `INSERT INTO whatsapp_messages (
        tenant_id, instance_id, lead_id, remote_jid, message_id,
        direction, type, content, is_from_me, status
      ) VALUES ($1,$2,$3,$4,$5,'outbound','text',$6,true,'sent')
      RETURNING *`,
      [tenantId, instanceId, leadId || null, remoteJid, sentMessageId, message]
    );

    // Emit via WebSocket
    if (savedMessage.rows.length > 0) {
      const newMessage = savedMessage.rows[0];

      emitToTenant(tenantId, 'whatsapp:message:new', {
        message: newMessage,
        leadId,
        remoteJid,
      });

      if (leadId) {
        emitToLeadRoom(tenantId, leadId, 'whatsapp:message:new', {
          message: newMessage,
        });
      }
    }

    res.json({
      success: true,
      data: savedMessage.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get conversation messages for a lead.
 * GET /api/v1/whatsapp/messages/:leadId
 */
export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { leadId } = req.params;
    const tenantId = req.tenantId!;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string;

    let sql = `SELECT * FROM whatsapp_messages
               WHERE lead_id = $1 AND tenant_id = $2`;
    const params: unknown[] = [leadId, tenantId];
    let idx = 3;

    if (before) {
      sql += ` AND created_at < $${idx++}`;
      params.push(before);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await query(sql, params);

    // Mark as read
    await query(
      `UPDATE whatsapp_contacts SET unread_count = 0
       WHERE lead_id = $1 AND tenant_id = $2`,
      [leadId, tenantId]
    );

    res.json({
      success: true,
      data: result.rows.reverse(), // Return in chronological order
      hasMore: result.rows.length === limit,
    });
  } catch (error) {
    next(error);
  }
}

// ─── Helper Functions ──────────────────────────────────────────

function extractMessageContent(messageInfo: any): {
  type: string;
  content: string | null;
  mediaUrl: string | null;
  mediaMimetype: string | null;
} {
  if (messageInfo.conversation) {
    return { type: 'text', content: messageInfo.conversation, mediaUrl: null, mediaMimetype: null };
  }
  if (messageInfo.extendedTextMessage) {
    return { type: 'text', content: messageInfo.extendedTextMessage.text, mediaUrl: null, mediaMimetype: null };
  }
  if (messageInfo.imageMessage) {
    return { type: 'image', content: messageInfo.imageMessage.caption || null, mediaUrl: messageInfo.imageMessage.url, mediaMimetype: messageInfo.imageMessage.mimetype };
  }
  if (messageInfo.audioMessage) {
    return { type: 'audio', content: null, mediaUrl: messageInfo.audioMessage.url, mediaMimetype: messageInfo.audioMessage.mimetype };
  }
  if (messageInfo.videoMessage) {
    return { type: 'video', content: messageInfo.videoMessage.caption || null, mediaUrl: messageInfo.videoMessage.url, mediaMimetype: messageInfo.videoMessage.mimetype };
  }
  if (messageInfo.documentMessage) {
    return { type: 'document', content: messageInfo.documentMessage.fileName, mediaUrl: messageInfo.documentMessage.url, mediaMimetype: messageInfo.documentMessage.mimetype };
  }
  if (messageInfo.stickerMessage) {
    return { type: 'sticker', content: null, mediaUrl: messageInfo.stickerMessage.url, mediaMimetype: 'image/webp' };
  }
  return { type: 'text', content: '[Unsupported message type]', mediaUrl: null, mediaMimetype: null };
}

function mapMessageStatus(status: number | undefined): string | null {
  const statusMap: Record<number, string> = {
    0: 'pending',
    1: 'sent',
    2: 'delivered',
    3: 'read',
    4: 'read',
    5: 'failed',
  };
  return status !== undefined ? statusMap[status] || null : null;
}

async function findOrCreateLeadByJid(
  tenantId: string,
  instanceId: string,
  remoteJid: string,
  pushName?: string
): Promise<string | null> {
  // First check if there's already a lead with this JID
  const existing = await query(
    'SELECT id FROM leads WHERE whatsapp_jid = $1 AND tenant_id = $2 LIMIT 1',
    [remoteJid, tenantId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Check via contact table
  const contact = await query(
    'SELECT lead_id FROM whatsapp_contacts WHERE jid = $1 AND tenant_id = $2 AND lead_id IS NOT NULL LIMIT 1',
    [remoteJid, tenantId]
  );

  if (contact.rows.length > 0) {
    return contact.rows[0].lead_id;
  }

  // Auto-create lead from WhatsApp contact
  const phone = remoteJid.replace('@s.whatsapp.net', '');

  // Get default pipeline and first stage
  const pipeline = await query(
    `SELECT p.id as pipeline_id, ps.id as stage_id
     FROM pipelines p
     JOIN pipeline_stages ps ON ps.pipeline_id = p.id
     WHERE p.tenant_id = $1 AND p.is_default = true
     ORDER BY ps.position ASC LIMIT 1`,
    [tenantId]
  );

  if (pipeline.rows.length === 0) {
    return null; // No default pipeline configured
  }

  const { pipeline_id, stage_id } = pipeline.rows[0];

  const newLead = await query(
    `INSERT INTO leads (tenant_id, pipeline_id, stage_id, name, phone, whatsapp_jid, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'whatsapp')
     RETURNING id`,
    [tenantId, pipeline_id, stage_id, pushName || phone, phone, remoteJid]
  );

  const leadId = newLead.rows[0]?.id;

  // Link contact to lead
  if (leadId) {
    await query(
      `UPDATE whatsapp_contacts SET lead_id = $1 WHERE jid = $2 AND tenant_id = $3`,
      [leadId, remoteJid, tenantId]
    );
  }

  return leadId || null;
}
