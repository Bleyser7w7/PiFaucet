/**
 * Pool PostgreSQL y migración mínima al arrancar.
 */

const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL || '';
const isLocal =
    dbUrl.includes('localhost') ||
    dbUrl.includes('127.0.0.1') ||
    process.env.PGSSLMODE === 'disable';

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const MIGRATION = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance NUMERIC(20, 4) NOT NULL DEFAULT 0,
  last_claim_at TIMESTAMPTZ,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referred_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(20, 4) NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_user_created ON claims (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pi_username TEXT NOT NULL,
  amount NUMERIC(20, 4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wd_user_created ON withdrawals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wd_status_created ON withdrawals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS ip_cooldowns (
  ip_key VARCHAR(200) PRIMARY KEY,
  last_claim_at TIMESTAMPTZ NOT NULL,
  last_user_id UUID
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  user_id UUID,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function migrate() {
  await pool.query(MIGRATION);
}

module.exports = { pool, migrate };
