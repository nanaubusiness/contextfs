#!/usr/bin/env node

/**
 * Generate 2000 REAL test files with legitimate code patterns
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const realPatterns = {
  auth: () => `import { db } from '../database/postgres';
import { hashPassword, comparePassword } from '../utils/crypto';
import { generateToken, verifyToken } from '../utils/jwt';
import { sendEmail } from '../services/email';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'moderator';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  emailVerified: boolean;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

  if (!user.rows[0]) {
    return { success: false, error: 'Invalid credentials' };
  }

  const validPassword = await comparePassword(password, user.rows[0].password_hash);
  if (!validPassword) {
    await logFailedLogin(user.rows[0].id);
    return { success: false, error: 'Invalid credentials' };
  }

  const token = generateToken({ userId: user.rows[0].id, role: user.rows[0].role });

  await db.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.rows[0].id]
  );

  await logSuccessfulLogin(user.rows[0].id);

  return {
    success: true,
    token,
    user: mapUser(user.rows[0])
  };
}

export async function register(
  email: string,
  password: string,
  role: 'admin' | 'user' | 'moderator' = 'user'
): Promise<{ success: boolean; user?: User; error?: string }> {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);

  if (existing.rows[0]) {
    return { success: false, error: 'Email already registered' };
  }

  const passwordHash = await hashPassword(password);

  const result = await db.query(
    \`INSERT INTO users (email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *\`,
    [email, passwordHash, role]
  );

  const verificationToken = generateToken({ userId: result.rows[0].id, purpose: 'verify' });
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    body: \`Click here to verify: https://app.example.com/verify/\${verificationToken}\`
  });

  return { success: true, user: mapUser(result.rows[0]) };
}

export async function verifyEmail(token: string): Promise<boolean> {
  try {
    const decoded = verifyToken(token);
    if (decoded.purpose !== 'verify') return false;

    await db.query(
      'UPDATE users SET email_verified = true WHERE id = $1',
      [decoded.userId]
    );
    return true;
  } catch {
    return false;
  }
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);

  if (!user.rows[0]) {
    return { success: false, error: 'User not found' };
  }

  const valid = await comparePassword(oldPassword, user.rows[0].password_hash);
  if (!valid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  const newHash = await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
    newHash,
    userId
  ]);

  await invalidateAllSessions(userId);

  return { success: true };
}

export async function resetPassword(email: string): Promise<void> {
  const user = await db.query('SELECT id FROM users WHERE email = $1', [email]);

  if (!user.rows[0]) {
    return;
  }

  const resetToken = generateToken({
    userId: user.rows[0].id,
    purpose: 'reset',
    expiresIn: '1h'
  });

  await sendEmail({
    to: email,
    subject: 'Password Reset',
    body: \`Reset here: https://app.example.com/reset-password/\${resetToken}\`
  });
}

async function logSuccessfulLogin(userId: string): Promise<void> {
  await db.query(
    'INSERT INTO login_logs (user_id, success, ip_address) VALUES ($1, true, $2)',
    [userId, getClientIP()]
  );
}

async function logFailedLogin(userId: string): Promise<void> {
  await db.query(
    'INSERT INTO login_logs (user_id, success, ip_address) VALUES ($1, false, $2)',
    [userId, getClientIP()]
  );
}

async function invalidateAllSessions(userId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    emailVerified: row.email_verified
  };
}

function getClientIP(): string {
  return '127.0.0.1';
}
`,

  payment: () => `import { db } from '../database/postgres';
import { stripe } from '../services/stripe';
import { sendEmail } from '../services/email';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'card' | 'bank_transfer' | 'crypto';

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  stripePaymentId: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface CreatePaymentIntent {
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
}

export async function createPaymentIntent(
  data: CreatePaymentIntent
): Promise<{ success: boolean; clientSecret?: string; error?: string }> {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [data.userId]);

  if (!user.rows[0]) {
    return { success: false, error: 'User not found' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(data.amount * 100),
      currency: data.currency,
      metadata: { userId: data.userId }
    });

    await db.query(
      \`INSERT INTO payments (id, user_id, amount, currency, status, method, stripe_payment_id, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())\`,
      [
        paymentIntent.id,
        data.userId,
        data.amount,
        data.currency,
        data.paymentMethod,
        paymentIntent.client_secret
      ]
    );

    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (err) {
    return { success: false, error: 'Failed to create payment intent' };
  }
}

export async function confirmPayment(paymentId: string): Promise<boolean> {
  try {
    const payment = await stripe.paymentIntents.retrieve(paymentId);

    if (payment.status === 'succeeded') {
      await db.query(
        \`UPDATE payments SET status = 'completed', completed_at = NOW() WHERE id = $1\`,
        [paymentId]
      );

      const paymentRecord = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
      await fulfillOrder(paymentRecord.rows[0]);

      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function refundPayment(
  paymentId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payment = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);

    if (!payment.rows[0]) {
      return { success: false, error: 'Payment not found' };
    }

    if (payment.rows[0].status !== 'completed') {
      return { success: false, error: 'Can only refund completed payments' };
    }

    await stripe.refunds.create({
      payment_intent: paymentId,
      reason: 'requested_by_customer'
    });

    await db.query(
      \`UPDATE payments SET status = 'refunded' WHERE id = $1\`,
      [paymentId]
    );

    await sendEmail({
      to: await getUserEmail(payment.rows[0].user_id),
      subject: 'Refund Processed',
      body: \`Your refund of \${payment.rows[0].amount} \${payment.rows[0].currency} has been processed.\`
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to process refund' };
  }
}

export async function getPaymentHistory(userId: string): Promise<Payment[]> {
  const result = await db.query(
    \`SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC\`,
    [userId]
  );

  return result.rows.map(mapPayment);
}

async function fulfillOrder(payment: Payment): Promise<void> {
  await db.query(
    'INSERT INTO orders (user_id, payment_id, status, created_at) VALUES ($1, $2, $3, NOW())',
    [payment.userId, payment.id, 'fulfilled']
  );
}

async function getUserEmail(userId: string): Promise<string> {
  const result = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.email || '';
}

function mapPayment(row: any): Payment {
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    method: row.method,
    stripePaymentId: row.stripe_payment_id,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}
`,

  userProfile: () => `import { db } from '../database/postgres';
import { uploadToS3 } from '../services/storage';
import { invalidateCache } from '../services/cache';

export interface UserProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  bio?: string;
  avatarUrl?: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: Address;
  socialLinks?: SocialLinks;
  timezone: string;
  language: string;
  updatedAt: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface SocialLinks {
  twitter?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const cacheKey = \`profile:\${userId}\`;
  const cached = await invalidateCache(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = await db.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);

  if (!result.rows[0]) {
    return null;
  }

  const profile = mapProfile(result.rows[0]);

  await invalidateCache(cacheKey, JSON.stringify(profile), 300);

  return profile;
}

export async function updateProfile(
  userId: string,
  data: Partial<UserProfile>
): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.firstName !== undefined) {
    updates.push(\`first_name = $\${paramCount++}\`);
    values.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    updates.push(\`last_name = $\${paramCount++}\`);
    values.push(data.lastName);
  }
  if (data.bio !== undefined) {
    updates.push(\`bio = $\${paramCount++}\`);
    values.push(data.bio);
  }
  if (data.phone !== undefined) {
    updates.push(\`phone = $\${paramCount++}\`);
    values.push(data.phone);
  }
  if (data.dateOfBirth !== undefined) {
    updates.push(\`date_of_birth = $\${paramCount++}\`);
    values.push(data.dateOfBirth);
  }
  if (data.timezone !== undefined) {
    updates.push(\`timezone = $\${paramCount++}\`);
    values.push(data.timezone);
  }
  if (data.language !== undefined) {
    updates.push(\`language = $\${paramCount++}\`);
    values.push(data.language);
  }

  updates.push(\`updated_at = NOW()\`);

  if (updates.length === 1) {
    return { success: false, error: 'No fields to update' };
  }

  values.push(userId);

  try {
    const result = await db.query(
      \`UPDATE user_profiles SET \${updates.join(', ')} WHERE user_id = $\${paramCount} RETURNING *\`,
      values
    );

    if (!result.rows[0]) {
      return { success: false, error: 'Profile not found' };
    }

    await invalidateCache(\`profile:\${userId}\`);

    return { success: true, profile: mapProfile(result.rows[0]) };
  } catch (err) {
    return { success: false, error: 'Failed to update profile' };
  }
}

export async function uploadAvatar(
  userId: string,
  file: Buffer,
  mimeType: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return { success: false, error: 'Invalid file type' };
  }

  if (file.length > 5 * 1024 * 1024) {
    return { success: false, error: 'File too large (max 5MB)' };
  }

  try {
    const key = \`avatars/\${userId}/\${Date.now()}.jpg\`;
    const url = await uploadToS3(key, file, mimeType);

    await db.query(
      'UPDATE user_profiles SET avatar_url = $1, updated_at = NOW() WHERE user_id = $2',
      [url, userId]
    );

    await invalidateCache(\`profile:\${userId}\`);

    return { success: true, url };
  } catch (err) {
    return { success: false, error: 'Failed to upload avatar' };
  }
}

export async function updateAddress(
  userId: string,
  address: Address
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.query(
      \`UPDATE user_profiles
       SET address = $1, updated_at = NOW()
       WHERE user_id = $2\`,
      [JSON.stringify(address), userId]
    );

    await invalidateCache(\`profile:\${userId}\`);

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to update address' };
  }
}

export async function updateSocialLinks(
  userId: string,
  links: SocialLinks
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.query(
      \`UPDATE user_profiles
       SET social_links = $1, updated_at = NOW()
       WHERE user_id = $2\`,
      [JSON.stringify(links), userId]
    );

    await invalidateCache(\`profile:\${userId}\`);

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to update social links' };
  }
}

function mapProfile(row: any): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    address: row.address ? JSON.parse(row.address) : undefined,
    socialLinks: row.social_links ? JSON.parse(row.social_links) : undefined,
    timezone: row.timezone || 'UTC',
    language: row.language || 'en',
    updatedAt: row.updated_at
  };
}
`,

  orderService: () => `import { db } from '../database/postgres';
import { processPayment } from './payment';
import { sendEmail } from '../services/email';
import { deductInventory } from './inventory';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface OrderItem {
  productId: string;
  quantity: number;
  priceAtTime: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  shippingAddress: Address;
  paymentId?: string;
  trackingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export async function createOrder(
  userId: string,
  items: OrderItem[],
  shippingAddress: Address
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (items.length === 0) {
    return { success: false, error: 'Order must have at least one item' };
  }

  const productIds = items.map(i => i.productId);
  const products = await db.query(
    \`SELECT id, price, stock FROM products WHERE id = ANY($1)\`,
    [productIds]
  );

  if (products.rows.length !== items.length) {
    return { success: false, error: 'One or more products not found' };
  }

  const productMap = new Map(products.rows.map(p => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product || product.stock < item.quantity) {
      return { success: false, error: \`Insufficient stock for \${item.productId}\` };
    }
  }

  const totalAmount = items.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    return sum + product.price * item.quantity;
  }, 0);

  try {
    const result = await db.query(
      \`INSERT INTO orders (user_id, items, total_amount, currency, status, shipping_address, created_at, updated_at)
       VALUES ($1, $2, $3, 'USD', 'pending', $4, NOW(), NOW())
       RETURNING id\`,
      [userId, JSON.stringify(items), totalAmount, JSON.stringify(shippingAddress)]
    );

    const orderId = result.rows[0].id;

    await sendEmail({
      to: await getUserEmail(userId),
      subject: 'Order Confirmation',
      body: \`Your order #\${orderId} has been received and is being processed.\`
    });

    return { success: true, orderId };
  } catch (err) {
    return { success: false, error: 'Failed to create order' };
  }
}

export async function payOrder(
  orderId: string,
  paymentMethodId: string
): Promise<{ success: boolean; error?: string }> {
  const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (!order.rows[0]) {
    return { success: false, error: 'Order not found' };
  }

  if (order.rows[0].status !== 'pending') {
    return { success: false, error: 'Order cannot be paid' };
  }

  const paymentResult = await processPayment({
    orderId,
    amount: order.rows[0].total_amount,
    currency: order.rows[0].currency,
    paymentMethodId
  });

  if (!paymentResult.success) {
    return { success: false, error: paymentResult.error };
  }

  await db.query(
    \`UPDATE orders SET status = 'paid', payment_id = $1, updated_at = NOW() WHERE id = $2\`,
    [paymentResult.paymentId, orderId]
  );

  await deductInventory(order.rows[0].items);

  await sendEmail({
    to: await getUserEmail(order.rows[0].user_id),
    subject: 'Payment Confirmed',
    body: \`Your payment for order #\${orderId} has been confirmed.\`
  });

  return { success: true };
}

export async function shipOrder(
  orderId: string,
  trackingNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.query(
      \`UPDATE orders
       SET status = 'shipped', tracking_number = $1, shipped_at = NOW(), updated_at = NOW()
       WHERE id = $2\`,
      [trackingNumber, orderId]
    );

    const order = await db.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);

    await sendEmail({
      to: await getUserEmail(order.rows[0].user_id),
      subject: 'Order Shipped',
      body: \`Your order #\${orderId} has been shipped. Tracking: \${trackingNumber}\`
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to ship order' };
  }
}

export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (!order.rows[0]) {
    return { success: false, error: 'Order not found' };
  }

  if (['delivered', 'cancelled', 'refunded'].includes(order.rows[0].status)) {
    return { success: false, error: 'Order cannot be cancelled' };
  }

  try {
    await db.query(
      \`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1\`,
      [orderId]
    );

    if (order.rows[0].payment_id) {
      await refundPayment(order.rows[0].payment_id);
    }

    await restoreInventory(order.rows[0].items);

    await sendEmail({
      to: await getUserEmail(order.rows[0].user_id),
      subject: 'Order Cancelled',
      body: \`Your order #\${orderId} has been cancelled. Reason: \${reason}\`
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to cancel order' };
  }
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const result = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (!result.rows[0]) {
    return null;
  }

  return mapOrder(result.rows[0]);
}

export async function getUserOrders(userId: string): Promise<Order[]> {
  const result = await db.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return result.rows.map(mapOrder);
}

async function getUserEmail(userId: string): Promise<string> {
  const result = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.email || '';
}

async function refundPayment(paymentId: string): Promise<void> {
  await db.query('UPDATE payments SET status = $1 WHERE id = $2', ['refunded', paymentId]);
}

async function deductInventory(items: OrderItem[]): Promise<void> {
  for (const item of items) {
    await db.query(
      'UPDATE products SET stock = stock - $1 WHERE id = $2',
      [item.quantity, item.productId]
    );
  }
}

async function restoreInventory(items: OrderItem[]): Promise<void> {
  for (const item of items) {
    await db.query(
      'UPDATE products SET stock = stock + $1 WHERE id = $2',
      [item.quantity, item.productId]
    );
  }
}

function mapOrder(row: any): Order {
  return {
    id: row.id,
    userId: row.user_id,
    items: JSON.parse(row.items),
    totalAmount: parseFloat(row.total_amount),
    currency: row.currency,
    status: row.status,
    shippingAddress: JSON.parse(row.shipping_address),
    paymentId: row.payment_id,
    trackingNumber: row.tracking_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at
  };
}
`,

  notification: () => `import { db } from '../database/postgres';
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
    \`INSERT INTO notifications (user_id, type, title, body, data, channels, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id\`,
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
    \`SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3\`,
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
    \`DELETE FROM notifications
     WHERE created_at < NOW() - INTERVAL '\${daysOld} days'
     AND read = true\`
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
      body: \`Your payment for order #\${orderId} has been confirmed.\`
    },
    shipped: {
      title: 'Order Shipped',
      body: trackingNumber
        ? \`Order #\${orderId} has been shipped. Tracking: \${trackingNumber}\`
        : \`Order #\${orderId} has been shipped.\`
    },
    delivered: {
      title: 'Order Delivered',
      body: \`Order #\${orderId} has been delivered.\`
    },
    cancelled: {
      title: 'Order Cancelled',
      body: \`Order #\${orderId} has been cancelled.\`
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
`,

  analytics: () => `import { db } from '../database/postgres';

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  userId?: string;
  sessionId: string;
  timestamp: Date;
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  averageOrderValue: number;
}

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  await db.query(
    \`INSERT INTO analytics_events (name, properties, user_id, session_id, timestamp)
     VALUES ($1, $2, $3, $4, $5)\`,
    [
      event.name,
      JSON.stringify(event.properties || {}),
      event.userId,
      event.sessionId,
      event.timestamp
    ]
  );
}

export async function getUserMetrics(): Promise<UserMetrics> {
  const totalResult = await db.query('SELECT COUNT(*) FROM users');
  const activeResult = await db.query(
    \`SELECT COUNT(*) FROM users
     WHERE last_login_at > NOW() - INTERVAL '7 days'\`
  );
  const todayResult = await db.query(
    \`SELECT COUNT(*) FROM users
     WHERE created_at::date = CURRENT_DATE\`
  );
  const weekResult = await db.query(
    \`SELECT COUNT(*) FROM users
     WHERE created_at > NOW() - INTERVAL '7 days'\`
  );
  const monthResult = await db.query(
    \`SELECT COUNT(*) FROM users
     WHERE created_at > NOW() - INTERVAL '30 days'\`
  );

  return {
    totalUsers: parseInt(totalResult.rows[0].count),
    activeUsers: parseInt(activeResult.rows[0].count),
    newUsersToday: parseInt(todayResult.rows[0].count),
    newUsersThisWeek: parseInt(weekResult.rows[0].count),
    newUsersThisMonth: parseInt(monthResult.rows[0].count)
  };
}

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
  const totalResult = await db.query(
    \`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'\`
  );
  const todayResult = await db.query(
    \`SELECT COALESCE(SUM(amount), 0) as total FROM payments
     WHERE status = 'completed' AND completed_at::date = CURRENT_DATE\`
  );
  const weekResult = await db.query(
    \`SELECT COALESCE(SUM(amount), 0) as total FROM payments
     WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days'\`
  );
  const monthResult = await db.query(
    \`SELECT COALESCE(SUM(amount), 0) as total FROM payments
     WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '30 days'\`
  );
  const aovResult = await db.query(
    \`SELECT COALESCE(AVG(total_amount), 0) as aov FROM orders WHERE status IN ('paid', 'shipped', 'delivered')\`
  );

  return {
    totalRevenue: parseFloat(totalResult.rows[0].total),
    revenueToday: parseFloat(todayResult.rows[0].total),
    revenueThisWeek: parseFloat(weekResult.rows[0].total),
    revenueThisMonth: parseFloat(monthResult.rows[0].total),
    averageOrderValue: parseFloat(aovResult.rows[0].aov)
  };
}

export async function getEventCount(
  eventName: string,
  since: Date
): Promise<number> {
  const result = await db.query(
    \`SELECT COUNT(*) FROM analytics_events
     WHERE name = $1 AND timestamp > $2\`,
    [eventName, since]
  );

  return parseInt(result.rows[0].count);
}

export async function getTopEvents(
  limit = 10,
  since?: Date
): Promise<{ name: string; count: number }[]> {
  let query = \`SELECT name, COUNT(*) as count FROM analytics_events\`;
  const params: any[] = [];

  if (since) {
    query += ' WHERE timestamp > $1';
    params.push(since);
  }

  query += \` GROUP BY name ORDER BY count DESC LIMIT \${params.length + 1}\`;
  params.push(limit);

  const result = await db.query(query, params);

  return result.rows.map(row => ({
    name: row.name,
    count: parseInt(row.count)
  }));
}

export async function getUserFunnel(
  steps: string[]
): Promise<{ step: string; count: number; conversionRate: number }[]> {
  if (steps.length === 0) return [];

  const results: { step: string; count: number; conversionRate: number }[] = [];

  let previousCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result = await db.query(
      \`SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE name = $1\`,
      [step]
    );

    const count = parseInt(result.rows[0].count);
    const conversionRate = previousCount > 0 ? (count / previousCount) * 100 : 100;

    results.push({ step, count, conversionRate });
    previousCount = count;
  }

  return results;
}

export async function getRetentionCohort(
  cohortDate: Date,
  periods: number = 12
): Promise<{ period: number; retention: number }[]> {
  const results: { period: number; retention: number }[] = [];

  for (let i = 0; i < periods; i++) {
    const cohortStart = new Date(cohortDate);
    cohortStart.setMonth(cohortStart.getMonth() + i);

    const cohortEnd = new Date(cohortStart);
    cohortEnd.setMonth(cohortEnd.getMonth() + 1);

    const usersResult = await db.query(
      \`SELECT COUNT(DISTINCT user_id) FROM users
       WHERE created_at >= $1 AND created_at < $2\`,
      [cohortStart, cohortEnd]
    );

    const cohortSize = parseInt(usersResult.rows[0].count);

    if (cohortSize === 0) {
      results.push({ period: i, retention: 0 });
      continue;
    }

    const retainedResult = await db.query(
      \`SELECT COUNT(DISTINCT user_id) FROM (
         SELECT DISTINCT user_id, DATE_TRUNC('month', last_login_at) as login_month
         FROM users
         WHERE created_at >= $1 AND created_at < $2
       ) ranked
       WHERE login_month > DATE_TRUNC('month', $1::date + INTERVAL '\${i} months')\`,
      [cohortStart, cohortEnd]
    );

    const retained = parseInt(retainedResult.rows[0].count);
    const retention = (retained / cohortSize) * 100;

    results.push({ period: i, retention });
  }

  return results;
}
`,

  inventory: () => `import { db } from '../database/postgres';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  sku: string;
  category: string;
  tags: string[];
  images: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryAlert {
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
}

export async function getProduct(productId: string): Promise<Product | null> {
  const result = await db.query('SELECT * FROM products WHERE id = $1', [productId]);

  if (!result.rows[0]) {
    return null;
  }

  return mapProduct(result.rows[0]);
}

export async function getProducts(
  options: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    active?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Product[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramCount = 1;

  if (options.category) {
    conditions.push(\`category = $\${paramCount++}\`);
    params.push(options.category);
  }

  if (options.minPrice !== undefined) {
    conditions.push(\`price >= $\${paramCount++}\`);
    params.push(options.minPrice);
  }

  if (options.maxPrice !== undefined) {
    conditions.push(\`price <= $\${paramCount++}\`);
    params.push(options.maxPrice);
  }

  if (options.inStock) {
    conditions.push('stock > 0');
  }

  if (options.active !== undefined) {
    conditions.push(\`active = $\${paramCount++}\`);
    params.push(options.active);
  }

  let query = 'SELECT * FROM products';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  if (options.limit) {
    query += \` LIMIT $\${paramCount++}\`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += \` OFFSET $\${paramCount++}\`;
    params.push(options.offset);
  }

  const result = await db.query(query, params);

  return result.rows.map(mapProduct);
}

export async function updateStock(
  productId: string,
  quantity: number,
  operation: 'add' | 'subtract' = 'subtract'
): Promise<{ success: boolean; newStock?: number; error?: string }> {
  try {
    const current = await db.query('SELECT stock FROM products WHERE id = $1', [productId]);

    if (!current.rows[0]) {
      return { success: false, error: 'Product not found' };
    }

    const newStock =
      operation === 'add'
        ? current.rows[0].stock + quantity
        : current.rows[0].stock - quantity;

    if (newStock < 0) {
      return { success: false, error: 'Insufficient stock' };
    }

    await db.query('UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2', [
      newStock,
      productId
    ]);

    if (newStock <= 10) {
      await checkLowStockAlert(productId);
    }

    return { success: true, newStock };
  } catch (err) {
    return { success: false, error: 'Failed to update stock' };
  }
}

export async function deductInventory(
  items: { productId: string; quantity: number }[]
): Promise<{ success: boolean; error?: string }> {
  for (const item of items) {
    const result = await updateStock(item.productId, item.quantity, 'subtract');
    if (!result.success) {
      return { success: false, error: result.error };
    }
  }

  return { success: true };
}

export async function checkLowStockAlert(productId: string): Promise<void> {
  const product = await db.query(
    'SELECT id, name, stock FROM products WHERE id = $1',
    [productId]
  );

  if (!product.rows[0] || product.rows[0].stock > 10) return;

  await db.query(
    \`INSERT INTO inventory_alerts (product_id, current_stock, threshold, created_at)
     VALUES ($1, $2, 10, NOW())\`,
    [productId, product.rows[0].stock]
  );
}

export async function getLowStockProducts(threshold = 10): Promise<InventoryAlert[]> {
  const result = await db.query(
    'SELECT id, name, stock FROM products WHERE stock <= $1 AND active = true',
    [threshold]
  );

  return result.rows.map(row => ({
    productId: row.id,
    productName: row.name,
    currentStock: row.stock,
    threshold
  }));
}

export async function getInventoryValuation(): Promise<{
  totalValue: number;
  productCount: number;
  outOfStockCount: number;
}> {
  const result = await db.query(
    \`SELECT
       COALESCE(SUM(price * stock), 0) as total_value,
       COUNT(*) as product_count,
       COUNT(*) FILTER (WHERE stock = 0) as out_of_stock
     FROM products WHERE active = true\`
  );

  return {
    totalValue: parseFloat(result.rows[0].total_value),
    productCount: parseInt(result.rows[0].product_count),
    outOfStockCount: parseInt(result.rows[0].out_of_stock)
  };
}

export async function searchProducts(
  query: string,
  limit = 20
): Promise<Product[]> {
  const result = await db.query(
    \`SELECT * FROM products
     WHERE active = true
     AND (
       name ILIKE $1
       OR description ILIKE $1
       OR sku ILIKE $1
       OR $2 = ANY(tags)
     )
     ORDER BY name
     LIMIT $3\`,
    [\`%\${query}%\`, query, limit]
  );

  return result.rows.map(mapProduct);
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price),
    currency: row.currency || 'USD',
    stock: row.stock,
    sku: row.sku,
    category: row.category,
    tags: row.tags || [],
    images: row.images || [],
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
`
};

const templateKeys = Object.keys(realPatterns);

async function main() {
  const outputDir = path.join(__dirname, "mock-project2000-real");
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Generating 2000 REAL files in ${outputDir}...`);

  for (let i = 0; i < 2000; i++) {
    const templateKey = templateKeys[i % templateKeys.length];
    const template = realPatterns[templateKey as keyof typeof realPatterns];
    const name = `${templateKey}-${String(i).padStart(4, "0")}`;

    let content = template();
    content = content.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');

    const filePath = path.join(outputDir, `${name}.ts`);
    await fs.writeFile(filePath, content);

    if ((i + 1) % 200 === 0) {
      console.log(`  Generated ${i + 1}/2000 files...`);
    }
  }

  console.log("Done!");
}

main().catch(console.error);
