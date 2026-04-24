import { db } from '../database/postgres';
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
  const cacheKey = `profile:${userId}`;
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
    updates.push(`first_name = $${paramCount++}`);
    values.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    updates.push(`last_name = $${paramCount++}`);
    values.push(data.lastName);
  }
  if (data.bio !== undefined) {
    updates.push(`bio = $${paramCount++}`);
    values.push(data.bio);
  }
  if (data.phone !== undefined) {
    updates.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }
  if (data.dateOfBirth !== undefined) {
    updates.push(`date_of_birth = $${paramCount++}`);
    values.push(data.dateOfBirth);
  }
  if (data.timezone !== undefined) {
    updates.push(`timezone = $${paramCount++}`);
    values.push(data.timezone);
  }
  if (data.language !== undefined) {
    updates.push(`language = $${paramCount++}`);
    values.push(data.language);
  }

  updates.push(`updated_at = NOW()`);

  if (updates.length === 1) {
    return { success: false, error: 'No fields to update' };
  }

  values.push(userId);

  try {
    const result = await db.query(
      `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = $${paramCount} RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      return { success: false, error: 'Profile not found' };
    }

    await invalidateCache(`profile:${userId}`);

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
    const key = `avatars/${userId}/${Date.now()}.jpg`;
    const url = await uploadToS3(key, file, mimeType);

    await db.query(
      'UPDATE user_profiles SET avatar_url = $1, updated_at = NOW() WHERE user_id = $2',
      [url, userId]
    );

    await invalidateCache(`profile:${userId}`);

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
      `UPDATE user_profiles
       SET address = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(address), userId]
    );

    await invalidateCache(`profile:${userId}`);

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
      `UPDATE user_profiles
       SET social_links = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(links), userId]
    );

    await invalidateCache(`profile:${userId}`);

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
