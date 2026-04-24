import { db } from '../database/postgres';
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
    `SELECT id, price, stock FROM products WHERE id = ANY($1)`,
    [productIds]
  );

  if (products.rows.length !== items.length) {
    return { success: false, error: 'One or more products not found' };
  }

  const productMap = new Map(products.rows.map(p => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product || product.stock < item.quantity) {
      return { success: false, error: `Insufficient stock for ${item.productId}` };
    }
  }

  const totalAmount = items.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    return sum + product.price * item.quantity;
  }, 0);

  try {
    const result = await db.query(
      `INSERT INTO orders (user_id, items, total_amount, currency, status, shipping_address, created_at, updated_at)
       VALUES ($1, $2, $3, 'USD', 'pending', $4, NOW(), NOW())
       RETURNING id`,
      [userId, JSON.stringify(items), totalAmount, JSON.stringify(shippingAddress)]
    );

    const orderId = result.rows[0].id;

    await sendEmail({
      to: await getUserEmail(userId),
      subject: 'Order Confirmation',
      body: `Your order #${orderId} has been received and is being processed.`
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
    `UPDATE orders SET status = 'paid', payment_id = $1, updated_at = NOW() WHERE id = $2`,
    [paymentResult.paymentId, orderId]
  );

  await deductInventory(order.rows[0].items);

  await sendEmail({
    to: await getUserEmail(order.rows[0].user_id),
    subject: 'Payment Confirmed',
    body: `Your payment for order #${orderId} has been confirmed.`
  });

  return { success: true };
}

export async function shipOrder(
  orderId: string,
  trackingNumber: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.query(
      `UPDATE orders
       SET status = 'shipped', tracking_number = $1, shipped_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [trackingNumber, orderId]
    );

    const order = await db.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);

    await sendEmail({
      to: await getUserEmail(order.rows[0].user_id),
      subject: 'Order Shipped',
      body: `Your order #${orderId} has been shipped. Tracking: ${trackingNumber}`
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
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    if (order.rows[0].payment_id) {
      await refundPayment(order.rows[0].payment_id);
    }

    await restoreInventory(order.rows[0].items);

    await sendEmail({
      to: await getUserEmail(order.rows[0].user_id),
      subject: 'Order Cancelled',
      body: `Your order #${orderId} has been cancelled. Reason: ${reason}`
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
