import { db } from '../database/postgres';

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
    `INSERT INTO analytics_events (name, properties, user_id, session_id, timestamp)
     VALUES ($1, $2, $3, $4, $5)`,
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
    `SELECT COUNT(*) FROM users
     WHERE last_login_at > NOW() - INTERVAL '7 days'`
  );
  const todayResult = await db.query(
    `SELECT COUNT(*) FROM users
     WHERE created_at::date = CURRENT_DATE`
  );
  const weekResult = await db.query(
    `SELECT COUNT(*) FROM users
     WHERE created_at > NOW() - INTERVAL '7 days'`
  );
  const monthResult = await db.query(
    `SELECT COUNT(*) FROM users
     WHERE created_at > NOW() - INTERVAL '30 days'`
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
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'`
  );
  const todayResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments
     WHERE status = 'completed' AND completed_at::date = CURRENT_DATE`
  );
  const weekResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments
     WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days'`
  );
  const monthResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments
     WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '30 days'`
  );
  const aovResult = await db.query(
    `SELECT COALESCE(AVG(total_amount), 0) as aov FROM orders WHERE status IN ('paid', 'shipped', 'delivered')`
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
    `SELECT COUNT(*) FROM analytics_events
     WHERE name = $1 AND timestamp > $2`,
    [eventName, since]
  );

  return parseInt(result.rows[0].count);
}

export async function getTopEvents(
  limit = 10,
  since?: Date
): Promise<{ name: string; count: number }[]> {
  let query = `SELECT name, COUNT(*) as count FROM analytics_events`;
  const params: any[] = [];

  if (since) {
    query += ' WHERE timestamp > $1';
    params.push(since);
  }

  query += ` GROUP BY name ORDER BY count DESC LIMIT ${params.length + 1}`;
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
      `SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE name = $1`,
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
      `SELECT COUNT(DISTINCT user_id) FROM users
       WHERE created_at >= $1 AND created_at < $2`,
      [cohortStart, cohortEnd]
    );

    const cohortSize = parseInt(usersResult.rows[0].count);

    if (cohortSize === 0) {
      results.push({ period: i, retention: 0 });
      continue;
    }

    const retainedResult = await db.query(
      `SELECT COUNT(DISTINCT user_id) FROM (
         SELECT DISTINCT user_id, DATE_TRUNC('month', last_login_at) as login_month
         FROM users
         WHERE created_at >= $1 AND created_at < $2
       ) ranked
       WHERE login_month > DATE_TRUNC('month', $1::date + INTERVAL '${i} months')`,
      [cohortStart, cohortEnd]
    );

    const retained = parseInt(retainedResult.rows[0].count);
    const retention = (retained / cohortSize) * 100;

    results.push({ period: i, retention });
  }

  return results;
}
