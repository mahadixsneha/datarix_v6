-- =============================================
-- DATARIX v6 - Complete Database Setup
-- Run this on Neon SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS tb_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  avatar TEXT,
  plan TEXT DEFAULT 'free',
  is_admin BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  reset_token TEXT,
  reset_expires TIMESTAMP,
  storage_used BIGINT DEFAULT 0,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_table_registry (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tb_users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  physical_name TEXT NOT NULL UNIQUE,
  table_type TEXT DEFAULT 'sql',  -- 'sql' or 'collection'
  schema JSONB,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tb_users(id) ON DELETE CASCADE,
  api_key TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT 'Default Key',
  permissions TEXT DEFAULT 'read,write',
  expires_at TIMESTAMP,
  last_used TIMESTAMP,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_app_users (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES tb_users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  is_banned BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(owner_id, email)
);

CREATE TABLE IF NOT EXISTS tb_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tb_plans (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  price NUMERIC DEFAULT 0,
  max_tables INTEGER DEFAULT 10,
  max_rows_per_table INTEGER DEFAULT 1000,
  max_api_keys INTEGER DEFAULT 1,
  max_app_users INTEGER DEFAULT 100,
  csv_export BOOLEAN DEFAULT false,
  csv_import BOOLEAN DEFAULT false,
  webhooks BOOLEAN DEFAULT false,
  custom_domain BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_activity (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tb_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_webhooks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tb_users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT DEFAULT 'insert,update,delete',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tb_api_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  api_key TEXT,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  response_time INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO tb_settings (key, value) VALUES
  ('site_name', 'Datarix'),
  ('site_url', 'https://your-site.vercel.app'),
  ('support_link', 'https://t.me/your_support'),
  ('support_email', 'support@yourdomain.com'),
  ('allow_register', 'true'),
  ('announcement', ''),
  ('announcement_type', 'info'),
  ('smtp_from', ''),
  ('payment_enabled', 'false'),
  ('resend_api_key', ''),
  ('default_plan', 'free'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO tb_plans (name, price, max_tables, max_rows_per_table, max_api_keys, max_app_users, csv_export, csv_import, webhooks, custom_domain) VALUES
  ('free', 0, 10, 1000, 1, 100, false, false, false, false),
  ('pro', 9.99, 50, 50000, 5, 1000, true, true, true, false),
  ('business', 29.99, 200, 500000, 20, 10000, true, true, true, true)
ON CONFLICT (name) DO NOTHING;

-- After first signup run:
-- UPDATE tb_users SET is_admin = true, plan = 'business' WHERE id = 1;
