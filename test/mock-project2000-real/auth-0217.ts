import { db } from '../database/postgres';
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
    `INSERT INTO users (email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
    [email, passwordHash, role]
  );

  const verificationToken = generateToken({ userId: result.rows[0].id, purpose: 'verify' });
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    body: `Click here to verify: https://app.example.com/verify/${verificationToken}`
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
    body: `Reset here: https://app.example.com/reset-password/${resetToken}`
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
