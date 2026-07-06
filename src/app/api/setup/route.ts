import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROJECT_REF = 'knhytunmplzvgandcdyl';

const SQL = `
CREATE TABLE IF NOT EXISTS gym_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reception')),
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

async function createTable(pool: Pool): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query(SQL);
    return 'ok';
  } finally {
    client.release();
  }
}

export async function GET() {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 });
  }

  const regions = [
    'aws-0-eu-west-1',
    'aws-0-eu-central-1',
    'aws-0-us-east-1',
    'aws-0-us-west-1',
    'aws-0-eu-south-1',
    'aws-0-eu-west-2',
    'aws-0-eu-west-3',
  ];

  for (const region of regions) {
    const pool = new Pool({
      host: `${region}.pooler.supabase.com`,
      port: 5432,
      database: 'postgres',
      user: `postgres.${PROJECT_REF}`,
      password: SERVICE_ROLE_KEY,
      max: 1,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    try {
      const msg = await createTable(pool);
      await pool.end();
      return NextResponse.json({ success: true, region, message: 'Table gym_users created (or already exists)' });
    } catch (e: any) {
      await pool.end().catch(() => {});
      continue;
    }
  }

  return NextResponse.json({
    error: 'Could not connect to Supabase. Try creating the table manually.',
    sql: SQL,
  }, { status: 500 });
}
