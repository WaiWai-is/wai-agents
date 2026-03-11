import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL environment variable is required in production');
}
const connectionString = DATABASE_URL || 'postgres://localhost:5432/wai_agents_dev';

const sql = postgres(connectionString, { max: 20 });
export const db = drizzle(sql);
export { sql };
