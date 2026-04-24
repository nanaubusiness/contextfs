import { db } from '../database/postgres';
import { sendPushNotification, sendEmail, sendSMS } from '../services/notification';

export type NotificationType =
  | 'order_update'
  | 'payment_received'
  | 'message'
  | 'alert'
  | 'reminder'
  | 'promotion';

export type NotificationChannel = 'push' | 'email' | 'sms';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
  read: boolean;
  createdAt: Date;
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, any>,
  channels: NotificationChannel[] = ['push', 'email']
): Promise<string> {
  const result = await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data, channels, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
    [userId, type, title, body, JSON.stringify(data || {}), channels]
  );

  const notificationId = result.rows[0].id;

  await dispatchNotification(notificationId, userId, channels, { type, title, body, data });

  return notificationId;
}

async function dispatchNotification(
  notificationId: string,
  userId: string,
  channels: NotificationChannel[],
  payload: { type: NotificationType; title: string; body: string; data?: Record<string, any> }
): Promise<void> {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

  if (!user.rows[0]) return;

  const promises: Promise<void>[] = [];

  if (channels.includes('push')) {
    const pushToken = user.rows[0].push_token;
    if (pushToken) {
      promises.push(
        sendPushNotification(pushToken, payload.title, payload.body, payload.data)
          .catch(err => console.error('Push failed:', err))
      );
    }
  }

  if (channels.includes('email')) {
    promises.push(
      sendEmail({
        to: user.rows[0].email,
        subject: payload.title,
        body: payload.body
      }).catch(err => console.error('Email failed:', err))
    );
  }

  if (channels.includes('sms')) {
    const phone = user.rows[0].phone;
    if (phone) {
      promises.push(
        sendSMS(phone, payload.body).catch(err => console.error('SMS failed:', err))
      );
    }
  }

  await Promise.allSettled(promises);
}

export async function getUserNotifications(
  userId: string,
  limit = 50,
  offset = 0
): Promise<Notification[]> {
  const result = await db.query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows.map(mapNotification);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
    [userId]
  );

  return parseInt(result.rows[0].count);
}

export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<void> {
  await db.query(
    'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await db.query(
    'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
    [userId]
  );
}

export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<void> {
  await db.query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

export async function deleteOldNotifications(
  daysOld = 30
): Promise<number> {
  const result = await db.query(
    `DELETE FROM notifications
     WHERE created_at < NOW() - INTERVAL '${daysOld} days'
     AND read = true`
  );

  return result.rowCount;
}

export async function sendOrderUpdateNotification(
  userId: string,
  orderId: string,
  status: string,
  trackingNumber?: string
): Promise<void> {
  const messages: Record<string, { title: string; body: string }> = {
    paid: {
      title: 'Payment Confirmed',
      body: `Your payment for order #${orderId} has been confirmed.`
    },
    shipped: {
      title: 'Order Shipped',
      body: trackingNumber
        ? `Order #${orderId} has been shipped. Tracking: ${trackingNumber}`
        : `Order #${orderId} has been shipped.`
    },
    delivered: {
      title: 'Order Delivered',
      body: `Order #${orderId} has been delivered.`
    },
    cancelled: {
      title: 'Order Cancelled',
      body: `Order #${orderId} has been cancelled.`
    }
  };

  const msg = messages[status];
  if (msg) {
    await createNotification(userId, 'order_update', msg.title, msg.body, {
      orderId,
      status,
      trackingNumber
    });
  }
}

export async function sendReminderNotification(
  userId: string,
  reminderId: string,
  title: string,
  message: string
): Promise<void> {
  await createNotification(userId, 'reminder', title, message, { reminderId }, [
    'push',
    'email'
  ]);
}

function mapNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ? JSON.parse(row.data) : undefined,
    channels: row.channels,
    read: row.read,
    createdAt: row.created_at
  };
}
