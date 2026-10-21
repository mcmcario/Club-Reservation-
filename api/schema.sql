CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  summary TEXT NOT NULL,
  vibe TEXT NOT NULL,
  hours TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT 'violet',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  partner BOOLEAN NOT NULL DEFAULT FALSE,
  source_url TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '',
  photo_credit TEXT NOT NULL DEFAULT '',
  photo_credit_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrance', 'seat', 'table')),
  price INTEGER NOT NULL CHECK (price >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 30 AND 480),
  start_times JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (venue_id, type)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  type TEXT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TEXT,
  duration_minutes INTEGER,
  start_at TIMESTAMP,
  end_at TIMESTAMP,
  guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 30),
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reservations_slot_idx ON reservations(venue_id, type, start_at, end_at)
  WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS reservations_user_idx ON reservations(user_id, booking_date DESC);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
