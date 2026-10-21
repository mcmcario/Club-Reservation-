const fs = require('node:fs');
const path = require('node:path');
const { discoveryVenues, readStore } = require('../store');

const root = path.join(__dirname, '..');

// OneDrive can restore local database files with the Windows read-only bit set.
// PGlite needs to write its lock, WAL, and cache files when reopening them.
function makeLocalDatabaseWritable(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) makeLocalDatabaseWritable(target);
    else if (entry.isFile()) fs.chmodSync(target, 0o666);
  }
  fs.chmodSync(directory, 0o777);
}

async function createDatabase(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  let db;
  if (databaseUrl) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: databaseUrl, max: 10, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: true } : undefined });
    db = {
      query: (sql, params = []) => pool.query(sql, params),
      exec: sql => pool.query(sql),
      transaction: async fn => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const value = await fn(client);
          await client.query('COMMIT');
          return value;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
      close: () => pool.end()
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir = options.dataDir || process.env.PGLITE_DATA_DIR || path.join(root, 'data', 'postgres');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    makeLocalDatabaseWritable(dataDir);
    const pg = await PGlite.create(dataDir);
    db = { query: (sql, params = []) => pg.query(sql, params), exec: sql => pg.exec(sql), transaction: fn => pg.transaction(fn), close: () => pg.close() };
  }
  await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  if (options.seed !== false) await seedDatabase(db, options);
  return db;
}

async function seedDatabase(db, options) {
  const existing = await db.query('SELECT COUNT(*)::int AS count FROM venues');
  if (existing.rows[0].count) return;
  const legacy = options.legacyData || (process.env.NODE_ENV === 'production' ? null : readStore());
  const venues = legacy?.venues?.length ? legacy.venues : discoveryVenues;
  await db.transaction(async tx => {
    for (const user of legacy?.users || []) {
      await tx.query('INSERT INTO users (id,name,email,password_hash,role,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
        [user.id, user.name, user.email, user.password, user.role === 'admin' ? 'admin' : 'customer', user.active, user.createdAt]);
    }
    for (const venue of venues) {
      let imagePath = venue.imagePath || '';
      const upload = imagePath.match(/^\/uploads\/([a-f0-9-]{36}\.(jpg|png|webp))$/);
      if (upload) {
        const file = path.join(root, 'data', 'uploads', upload[1]);
        if (fs.existsSync(file)) {
          const id = upload[1].split('.')[0];
          const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[upload[2]];
          await tx.query('INSERT INTO images (id,mime,data) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, mime, fs.readFileSync(file)]);
          imagePath = `/api/images/${id}`;
        } else imagePath = '';
      }
      await tx.query('INSERT INTO venues (id,name,area,address,summary,vibe,hours,accent,active,partner,source_url,image_path,photo_credit,photo_credit_url,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
        [venue.id, venue.name, venue.area, venue.address, venue.summary, venue.vibe, venue.hours, venue.accent || 'violet', venue.active !== false, Boolean(venue.partner), venue.sourceUrl || '', imagePath, venue.photoCredit || '', venue.photoCreditUrl || '', venue.createdAt || new Date().toISOString()]);
      for (const offer of venue.offers || []) {
        await tx.query('INSERT INTO offers (venue_id,type,price,capacity,duration_minutes,start_times) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
          [venue.id, offer.type, offer.price, offer.capacity, offer.durationMinutes || 120, JSON.stringify(offer.startTimes || [])]);
      }
    }
    for (const booking of legacy?.bookings || []) {
      await tx.query('INSERT INTO reservations (id,reference,user_id,venue_id,type,booking_date,start_time,start_at,end_at,guests,note,total,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING',
        [booking.id, booking.reference, booking.userId, booking.venueId, booking.type, booking.date, booking.guests, booking.note || '', booking.total, booking.status === 'confirmed' ? 'approved' : booking.status, booking.createdAt, booking.updatedAt || booking.createdAt]);
    }
  });
}

module.exports = { createDatabase };
