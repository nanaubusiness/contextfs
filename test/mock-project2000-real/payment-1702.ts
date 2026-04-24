import { db } from '../database/postgres';
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
      `INSERT INTO payments (id, user_id, amount, currency, status, method, stripe_payment_id, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())`,
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
        `UPDATE payments SET status = 'completed', completed_at = NOW() WHERE id = $1`,
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
      `UPDATE payments SET status = 'refunded' WHERE id = $1`,
      [paymentId]
    );

    await sendEmail({
      to: await getUserEmail(payment.rows[0].user_id),
      subject: 'Refund Processed',
      body: `Your refund of ${payment.rows[0].amount} ${payment.rows[0].currency} has been processed.`
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to process refund' };
  }
}

export async function getPaymentHistory(userId: string): Promise<Payment[]> {
  const result = await db.query(
    `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
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
