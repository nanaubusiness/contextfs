/**
 * Authentication module for user login and session management
 */
import { db } from "./database";
import { validateEmail, hashPassword } from "./utils";
import { JWT_SECRET, SESSION_TTL } from "./config";

export async function login(email: string, password: string): Promise<AuthToken> {
  const user = await db.users.findByEmail(email);
  if (!user) throw new AuthError("Invalid credentials");

  const valid = await hashPassword.compare(password, user.passwordHash);
  if (!valid) throw new AuthError("Invalid credentials");

  const token = await createSession(user.id);
  return { token, userId: user.id, expiresAt: Date.now() + SESSION_TTL };
}

export async function logout(token: string): Promise<void> {
  await db.sessions.delete(token);
}

export async function verifyToken(token: string): Promise<SessionUser> {
  const session = await db.sessions.find(token);
  if (!session) throw new AuthError("Session expired");

  const user = await db.users.findById(session.userId);
  if (!user) throw new AuthError("User not found");

  return { id: user.id, email: user.email, role: user.role };
}

export async function refreshSession(token: string): Promise<AuthToken> {
  const session = await db.sessions.find(token);
  if (!session) throw new AuthError("Session expired");

  const newToken = await createSession(session.userId);
  await db.sessions.delete(token);

  return { token: newToken, userId: session.userId, expiresAt: Date.now() + SESSION_TTL };
}

interface AuthToken {
  token: string;
  userId: string;
  expiresAt: number;
}

interface SessionUser {
  id: string;
  email: string;
  role: string;
}

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
