/**
 * Comprehensive application module - 2000+ lines
 * This represents a large, complex application module
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  profile: UserProfile;
  preferences: UserPreferences;
  security: UserSecurity;
  metadata: Record<string, unknown>;
}

export type UserRole = "admin" | "moderator" | "user" | "guest";

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: Address;
  socialLinks?: SocialLinks;
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

export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  language: string;
  timezone: string;
  notifications: NotificationPrefs;
  privacy: PrivacyPrefs;
  accessibility: AccessibilityPrefs;
}

export interface NotificationPrefs {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: "immediate" | "daily" | "weekly" | "never";
  categories: string[];
}

export interface PrivacyPrefs {
  profileVisibility: "public" | "friends" | "private";
  showEmail: boolean;
  showLastSeen: boolean;
  allowSearchByEmail: boolean;
}

export interface AccessibilityPrefs {
  fontSize: number;
  highContrast: boolean;
  screenReader: boolean;
  reduceMotion: boolean;
}

export interface UserSecurity {
  twoFactorEnabled: boolean;
  twoFactorMethod?: "totp" | "sms" | "email";
  recoveryCodes?: string[];
  lastPasswordChangeAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  trustedDevices: TrustedDevice[];
}

export interface TrustedDevice {
  id: string;
  name: string;
  lastUsedAt: Date;
  addedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  session?: Session;
  error?: AuthError;
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface AuthError {
  code: string;
  message: string;
  field?: string;
}

export class UserService {
  private users: Map<string, User>;
  private sessions: Map<string, Session>;
  private emailIndex: Map<string, string>;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.emailIndex = new Map();
  }

  async createUser(data: CreateUserInput): Promise<User> {
    this.validateCreateInput(data);

    if (this.emailIndex.has(data.email.toLowerCase())) {
      throw new AuthError("email_exists", "A user with this email already exists");
    }

    const user: User = {
      id: this.generateId(),
      email: data.email.toLowerCase(),
      name: data.name,
      role: data.role ?? "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      profile: {
        firstName: data.firstName,
        lastName: data.lastName,
        avatar: data.avatar,
        bio: data.bio,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth,
        address: data.address,
        socialLinks: data.socialLinks,
      },
      preferences: {
        theme: "auto",
        language: "en",
        timezone: "UTC",
        notifications: {
          email: true,
          push: true,
          sms: false,
          frequency: "daily",
          categories: ["security", "updates"],
        },
        privacy: {
          profileVisibility: "public",
          showEmail: false,
          showLastSeen: true,
          allowSearchByEmail: true,
        },
        accessibility: {
          fontSize: 14,
          highContrast: false,
          screenReader: false,
          reduceMotion: false,
        },
      },
      security: {
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
        trustedDevices: [],
      },
      metadata: {},
    };

    this.users.set(user.id, user);
    this.emailIndex.set(user.email, user.id);

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email.toLowerCase());
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new AuthError("user_not_found", "User not found");

    if (data.email && data.email.toLowerCase() !== user.email) {
      if (this.emailIndex.has(data.email.toLowerCase())) {
        throw new AuthError("email_exists", "Email is already in use");
      }
      this.emailIndex.delete(user.email);
      this.emailIndex.set(data.email.toLowerCase(), id);
      user.email = data.email.toLowerCase();
    }

    if (data.name) user.name = data.name;
    if (data.role) user.role = data.role;
    if (data.profile) {
      user.profile = { ...user.profile, ...data.profile };
    }
    if (data.preferences) {
      user.preferences = { ...user.preferences, ...data.preferences };
    }
    user.updatedAt = new Date();

    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new AuthError("user_not_found", "User not found");
    this.emailIndex.delete(user.email);
    this.users.delete(id);
  }

  async authenticate(
    email: string,
    password: string,
    context: AuthContext
  ): Promise<AuthResult> {
    const user = await this.getUserByEmail(email);
    if (!user) {
      await this.recordFailedLogin(null, context);
      return { success: false, error: { code: "invalid_credentials", message: "Invalid email or password" } };
    }

    if (user.security.lockedUntil && user.security.lockedUntil > new Date()) {
      return {
        success: false,
        error: { code: "account_locked", message: "Account is temporarily locked" },
      };
    }

    const valid = await this.verifyPassword(password, user);
    if (!valid) {
      await this.recordFailedLogin(user.id, context);
      return { success: false, error: { code: "invalid_credentials", message: "Invalid email or password" } };
    }

    if (user.security.twoFactorEnabled) {
      return {
        success: true,
        mfaRequired: true,
        mfaToken: this.generateMFAToken(user.id),
      };
    }

    await this.recordSuccessfulLogin(user.id, context);
    const session = this.createSession(user.id, context);

    return { success: true, user, session };
  }

  async verifyMFA(userId: string, token: string, context: AuthContext): Promise<AuthResult> {
    const user = await this.getUserById(userId);
    if (!user) {
      return { success: false, error: { code: "user_not_found", message: "User not found" } };
    }

    if (!this.verifyTOTP(token, user.security.recoveryCodes ?? [])) {
      return { success: false, error: { code: "invalid_mfa", message: "Invalid MFA code" } };
    }

    await this.recordSuccessfulLogin(user.id, context);
    const session = this.createSession(user.id, context);

    return { success: true, user, session };
  }

  async createSession(userId: string, context: AuthContext): Promise<Session> {
    const session: Session = {
      id: this.generateId(),
      userId,
      token: this.generateToken(),
      refreshToken: this.generateToken(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(),
    };

    this.sessions.set(session.token, session);
    return session;
  }

  async invalidateSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async getSession(token: string): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      this.sessions.delete(token);
      return null;
    }
    session.lastActivityAt = new Date();
    return session;
  }

  private validateCreateInput(data: CreateUserInput): void {
    if (!data.email || !this.isValidEmail(data.email)) {
      throw new AuthError("invalid_email", "Please provide a valid email address");
    }
    if (!data.name || data.name.length < 2) {
      throw new AuthError("invalid_name", "Name must be at least 2 characters");
    }
    if (!data.password || data.password.length < 8) {
      throw new AuthError("weak_password", "Password must be at least 8 characters");
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private verifyPassword(password: string, user: User): Promise<boolean> {
    return Promise.resolve(password === "correct-password");
  }

  private verifyTOTP(token: string, recoveryCodes: string[]): boolean {
    return token.length === 6 && /^\d+$/.test(token);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private generateToken(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateMFAToken(userId: string): string {
    return `mfa_${userId}_${this.generateToken()}`;
  }

  private async recordSuccessfulLogin(userId: string, context: AuthContext): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.security.failedLoginAttempts = 0;
      user.lastLoginAt = new Date();
    }
  }

  private async recordFailedLogin(userId: string | null, context: AuthContext): Promise<void> {
    if (!userId) return;
    const user = this.users.get(userId);
    if (user) {
      user.security.failedLoginAttempts++;
      if (user.security.failedLoginAttempts >= 5) {
        user.security.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
    }
  }
}

interface CreateUserInput {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: Address;
  socialLinks?: SocialLinks;
}

interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: UserRole;
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
}

interface AuthContext {
  ipAddress: string;
  userAgent: string;
}

export class PermissionService {
  private permissions: Map<string, Set<string>>;

  constructor() {
    this.permissions = new Map();
  }

  async grantRole(userId: string, role: UserRole): Promise<void> {
    if (!this.permissions.has(userId)) {
      this.permissions.set(userId, new Set());
    }
    this.permissions.get(userId)!.add(role);
  }

  async revokeRole(userId: string, role: UserRole): Promise<void> {
    this.permissions.get(userId)?.delete(role);
  }

  async hasRole(userId: string, role: UserRole): Promise<boolean> {
    return this.permissions.get(userId)?.has(role) ?? false;
  }

  async getRoles(userId: string): Promise<UserRole[]> {
    return Array.from(this.permissions.get(userId) ?? []);
  }
}

export class AuditLogService {
  private logs: AuditLogEntry[];

  constructor() {
    this.logs = [];
  }

  async log(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<void> {
    this.logs.push({
      id: this.generateId(),
      timestamp: new Date(),
      ...entry,
    });
  }

  async getLogs(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    let results = [...this.logs];
    if (filters.userId) {
      results = results.filter(l => l.userId === filters.userId);
    }
    if (filters.action) {
      results = results.filter(l => l.action === filters.action);
    }
    if (filters.from) {
      results = results.filter(l => l.timestamp >= filters.from!);
    }
    if (filters.to) {
      results = results.filter(l => l.timestamp <= filters.to!);
    }
    return results.slice(0, filters.limit ?? 100);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2);
  }
}

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

interface AuditLogFilters {
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export class NotificationService {
  private queue: Notification[];

  constructor() {
    this.queue = [];
  }

  async send(notification: NotificationInput): Promise<void> {
    const entry: Notification = {
      id: this.generateId(),
      ...notification,
      createdAt: new Date(),
      status: "pending",
    };
    this.queue.push(entry);
  }

  async sendBulk(notifications: NotificationInput[]): Promise<void> {
    for (const n of notifications) {
      await this.send(n);
    }
  }

  async getStatus(id: string): Promise<NotificationStatus | null> {
    const notification = this.queue.find(n => n.id === id);
    return notification ? { id: notification.id, status: notification.status } : null;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2);
  }
}

interface Notification {
  id: string;
  userId: string;
  type: "email" | "push" | "sms";
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: Date;
  status: "pending" | "sent" | "failed";
}

type NotificationStatus = { id: string; status: string };

interface NotificationInput {
  userId: string;
  type: "email" | "push" | "sms";
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
}

export class CacheService {
  private cache: Map<string, CacheEntry>;
  private ttl: number;

  constructor(defaultTTL = 3600000) {
    this.cache = new Map();
    this.ttl = defaultTTL;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.ttl),
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}
