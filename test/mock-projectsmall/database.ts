import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = {
  users: {
    async findByEmail(email: string) {
      const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      return result.rows[0];
    },
    async findById(id: string) {
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return result.rows[0];
    },
    async create(email: string, passwordHash: string) {
      const result = await pool.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *",
        [email, passwordHash]
      );
      return result.rows[0];
    },
  },
  sessions: {
    async find(token: string) {
      const result = await pool.query(
        "SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()",
        [token]
      );
      return result.rows[0];
    },
    async create(userId: string, token: string, expiresAt: Date) {
      await pool.query(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [userId, token, expiresAt]
      );
    },
    async delete(token: string) {
      await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
    },
  },
};
