const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('./db');
const { hashPassword, verifyPassword } = require('../store');

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const root = path.join(__dirname, '..');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = key => parts.find(part => part.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const nowTime = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = key => parts.find(part => part.type === key).value;
  return `${get('hour')}:${get('minute')}`;
};
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const publicUser = row => ({ id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, createdAt: row.created_at });

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  const days = (parsed - new Date(`${today()}T00:00:00Z`)) / 86400000;
  return !Number.isNaN(days) && parsed.toISOString().slice(0, 10) === value && days >= 0 && days <= 90;
}
function validUrl(value) {
  const url = text(value, 500);
  if (!url) return '';
  try { if (['https:', 'http:'].includes(new URL(url).protocol)) return url; } catch { /* Rejected below. */ }
  fail(400, 'Enter a full http or https link.');
}
function validateOffer(input) {
  const type = text(input.type, 20), price = Number(input.price), capacity = Number(input.capacity);
  const durationMinutes = Number(input.durationMinutes);
  const startTimes = Array.isArray(input.startTimes) ? [...new Set(input.startTimes.map(item => text(item, 5)))].sort() : [];
  if (!['entrance', 'seat', 'table'].includes(type) || !Number.isInteger(price) || price < 0 || price > 1000000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 10000 || !Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 480 || !startTimes.length || startTimes.length > 24 || startTimes.some(time => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) fail(400, 'Each booking option needs a valid price, capacity, duration, and arrival times.');
  return { type, price, capacity, durationMinutes, startTimes };
}
function validateVenue(input) {
  const name = text(input.name, 80), area = text(input.area, 30), address = text(input.address, 160);
  const summary = text(input.summary, 300), vibe = text(input.vibe, 40), hours = text(input.hours, 60);
  if (!name || !['Katipunan', 'Timog', 'Tomas Morato'].includes(area) || !address || !summary || !vibe || !hours) fail(400, 'Complete the venue name, area, address, description, category, and hours.');
  const offers = Array.isArray(input.offers) ? input.offers.map(validateOffer) : [];
  if (new Set(offers.map(item => item.type)).size !== offers.length) fail(400, 'Choose each booking option only once.');
  const partner = input.partner === true;
  if (partner && !offers.length) fail(400, 'Partner venues need at least one booking option with arrival times.');
  const imagePath = text(input.imagePath, 100);
  if (imagePath && !/^\/(?:assets\/[a-z0-9-]+\.jpg|api\/images\/[a-f0-9-]{36})$/.test(imagePath)) fail(400, 'Upload a picture before saving it.');
  return { name, area, address, summary, vibe, hours, partner, offers, imagePath,
    accent: ['violet', 'rose', 'amber', 'blue'].includes(input.accent) ? input.accent : 'violet',
    active: input.active !== false, sourceUrl: validUrl(input.sourceUrl),
    photoCredit: imagePath ? text(input.photoCredit, 100) : '', photoCreditUrl: imagePath ? validUrl(input.photoCreditUrl) : '' };
}
function venueFromRow(row, offers) {
  return { id: row.id, name: row.name, area: row.area, address: row.address, summary: row.summary, vibe: row.vibe, hours: row.hours,
    accent: row.accent, active: row.active, partner: row.partner, sourceUrl: row.source_url, imagePath: row.image_path,
    photoCredit: row.photo_credit, photoCreditUrl: row.photo_credit_url,
    offers: offers.filter(offer => offer.venue_id === row.id).map(offer => ({ type: offer.type, price: offer.price, capacity: offer.capacity, durationMinutes: offer.duration_minutes, startTimes: offer.start_times })) };
}
async function venueList(db, activeOnly = true) {
  const [venues, offers] = await Promise.all([
    db.query(`SELECT * FROM venues ${activeOnly ? 'WHERE active = TRUE' : ''} ORDER BY created_at DESC, name`),
    db.query('SELECT * FROM offers ORDER BY type')
  ]);
  return venues.rows.map(row => venueFromRow(row, offers.rows));
}
function slotEnd(date, time, durationMinutes) {
  const dateTime = new Date(`${date}T${time}:00Z`);
  return new Date(dateTime.getTime() + durationMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
async function remaining(db, venueId, type, startAt, endAt, capacity, excludingId = '') {
  const used = await db.query(`SELECT COALESCE(SUM(guests),0)::int AS used FROM reservations
    WHERE venue_id=$1 AND type=$2 AND status IN ('pending','approved') AND start_at < $4::timestamp AND end_at > $3::timestamp AND id <> $5`,
    [venueId, type, startAt, endAt, excludingId]);
  return Math.max(0, capacity - used.rows[0].used);
}
const bookingSelect = `SELECT r.id,r.reference,r.user_id AS "userId",r.venue_id AS "venueId",r.type,
  TO_CHAR(r.booking_date,'YYYY-MM-DD') AS date,r.start_time AS "startTime",r.duration_minutes AS "durationMinutes",
  r.start_at AS "startAt",r.end_at AS "endAt",r.guests,r.note,r.total,r.status,r.created_at AS "createdAt",
  v.name AS "venueName",v.area AS "venueArea",u.name AS "customerName",u.email AS "customerEmail"
  FROM reservations r JOIN venues v ON v.id=r.venue_id JOIN users u ON u.id=r.user_id`;

function createApp(db, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.get('host')) fail(403, 'Invalid request origin.'); }
      catch (error) { return next(error); }
    }
    next();
  });
  app.use(express.json({ limit: '60kb' }));
  app.use('/api', async (req, res, next) => {
    try {
      const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('session='))?.slice(8);
      req.token = token;
      if (token) {
        const found = await db.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE', [tokenHash(token)]);
        req.user = found.rows[0] || null;
      }
      next();
    } catch (error) { next(error); }
  });
  const requireUser = req => { if (!req.user) fail(401, 'Please sign in to continue.'); };
  const requireAdmin = req => { requireUser(req); if (req.user.role !== 'admin') fail(403, 'Admin access is required.'); };
  const secureCookie = process.env.NODE_ENV === 'production';
  async function signIn(req, res, user, status = 200) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [tokenHash(token), user.id, new Date(Date.now() + SESSION_MS)]);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: SESSION_MS, path: '/' });
    res.status(status).json({ user: publicUser(user) });
  }
  function throttle(req, email) {
    const key = `${req.ip}:${email}`, now = Date.now();
    const recent = (attempts.get(key) || []).filter(time => now - time < 15 * 60000);
    if (recent.length >= 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
    recent.push(now); attempts.set(key, recent);
    if (attempts.size > 1000) attempts.clear();
  }
  app.get('/api/health', async (req, res) => { await db.query('SELECT 1'); res.json({ ok: true }); });
  app.get('/api/me', async (req, res) => {
    const admin = await db.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
    res.json({ user: req.user ? publicUser(req.user) : null, setupAvailable: !admin.rows.length, setupTokenRequired: Boolean(process.env.NODE_ENV === 'production') });
  });
  app.post('/api/admin/setup', async (req, res) => {
    const existing = await db.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
    if (existing.rows.length) fail(409, 'Admin setup is already complete. Please sign in.');
    if (process.env.NODE_ENV === 'production') {
      const expected = process.env.ADMIN_SETUP_TOKEN || '';
      const given = text(req.body.setupToken, 200);
      if (!expected) fail(503, 'Set ADMIN_SETUP_TOKEN before creating the first admin.');
      if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) fail(403, 'Incorrect admin setup code.');
    }
    const { name, email, password } = validateAccount(req.body);
    const user = { id: crypto.randomUUID(), name, email, password_hash: hashPassword(password), role: 'admin', active: true, created_at: new Date() };
    try { await db.query('INSERT INTO users (id,name,email,password_hash,role,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', Object.values(user)); }
    catch (error) { if (error.code === '23505') fail(409, 'This email is already registered.'); throw error; }
    await signIn(req, res, user, 201);
  });
  app.post('/api/signup', async (req, res) => {
    const { name, email, password } = validateAccount(req.body); throttle(req, email);
    const user = { id: crypto.randomUUID(), name, email, password_hash: hashPassword(password), role: 'customer', active: true, created_at: new Date() };
    try { await db.query('INSERT INTO users (id,name,email,password_hash,role,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', Object.values(user)); }
    catch (error) { if (error.code === '23505') fail(409, 'This email is already registered.'); throw error; }
    await signIn(req, res, user, 201);
  });
  app.post('/api/login', async (req, res) => {
    const email = text(req.body.email, 160).toLowerCase(); throttle(req, email);
    const found = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = found.rows[0];
    if (!user || !verifyPassword(req.body.password, user.password_hash)) fail(401, 'Incorrect email or password.');
    if (!user.active) fail(403, 'This account is disabled.');
    await signIn(req, res, user);
  });
  app.post('/api/logout', async (req, res) => {
    if (req.token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(req.token)]);
    res.clearCookie('session', { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/venues', async (req, res) => res.json({ venues: await venueList(db) }));
  app.get('/api/admin/venues', async (req, res) => { requireAdmin(req); res.json({ venues: await venueList(db, false) }); });
  app.get('/api/venues/:id/availability', async (req, res) => {
    const date = text(req.query.date, 10), type = text(req.query.type, 20);
    if (!validDate(date)) fail(400, 'Choose a date within the next 90 days.');
    const offer = await db.query('SELECT o.*,v.active,v.partner FROM offers o JOIN venues v ON v.id=o.venue_id WHERE o.venue_id=$1 AND o.type=$2', [req.params.id, type]);
    const row = offer.rows[0];
    if (!row || !row.active || !row.partner) fail(404, 'This booking option is unavailable.');
    const slots = await Promise.all(row.start_times.map(async time => {
      const start = `${date} ${time}:00`, end = slotEnd(date, time, row.duration_minutes);
      const remainingGuests = date === today() && time <= nowTime() ? 0 : await remaining(db, req.params.id, type, start, end, row.capacity);
      return { time, remaining: remainingGuests };
    }));
    res.json({ date, type, durationMinutes: row.duration_minutes, slots });
  });
  app.get('/api/reservations', async (req, res) => {
    requireUser(req);
    const where = [], params = [];
    if (req.user.role !== 'admin') { params.push(req.user.id); where.push(`r.user_id=$${params.length}`); }
    const status = text(req.query.status, 20);
    if (status && status !== 'all') { params.push(status); where.push(`r.status=$${params.length}`); }
    const q = text(req.query.q, 100);
    if (q) { params.push(`%${q}%`); where.push(`(r.reference ILIKE $${params.length} OR v.name ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
    const result = await db.query(`${bookingSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.booking_date DESC,r.start_time DESC,r.created_at DESC LIMIT 500`, params);
    res.json({ reservations: result.rows });
  });
  app.post('/api/reservations', async (req, res) => {
    requireUser(req); if (req.user.role !== 'customer') fail(403, 'Use a customer account to reserve.');
    const input = validateReservation(req.body);
    const reservation = await db.transaction(async tx => createOrEditReservation(tx, input, req.user.id));
    res.status(201).json({ reservation });
  });
  app.patch('/api/reservations/:id', async (req, res) => {
    requireUser(req); if (req.user.role !== 'customer') fail(403, 'Use a customer account to edit.');
    const input = validateReservation(req.body);
    const reservation = await db.transaction(async tx => {
      const old = await tx.query('SELECT * FROM reservations WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!old.rows.length || old.rows[0].user_id !== req.user.id) fail(404, 'Reservation not found.');
      if (old.rows[0].status !== 'pending') fail(409, 'Only pending reservations can be edited.');
      return createOrEditReservation(tx, input, req.user.id, req.params.id);
    });
    res.json({ reservation });
  });
  app.post('/api/reservations/:id/cancel', async (req, res) => {
    requireUser(req); if (req.user.role !== 'customer') fail(403, 'Use a customer account to cancel.');
    const changed = await db.query("UPDATE reservations SET status='cancelled',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status IN ('pending','approved') RETURNING id", [req.params.id, req.user.id]);
    if (!changed.rows.length) fail(409, 'This reservation cannot be cancelled.');
    res.json({ ok: true });
  });
  app.patch('/api/admin/reservations/:id/status', async (req, res) => {
    requireAdmin(req);
    const status = text(req.body.status, 20);
    if (!['approved', 'rejected', 'completed'].includes(status)) fail(400, 'Choose Approved, Rejected, or Completed.');
    const allowed = status === 'completed' ? 'approved' : 'pending';
    const changed = await db.query('UPDATE reservations SET status=$1,updated_at=NOW() WHERE id=$2 AND status=$3 RETURNING id', [status, req.params.id, allowed]);
    if (!changed.rows.length) fail(409, 'This status change is unavailable.');
    res.json({ ok: true });
  });
  app.post('/api/admin/venues', async (req, res) => {
    requireAdmin(req); const venue = validateVenue(req.body); const id = crypto.randomUUID();
    await saveVenue(db, id, venue, true);
    res.status(201).json({ venue: (await venueList(db, false)).find(item => item.id === id) });
  });
  app.patch('/api/admin/venues/:id', async (req, res) => {
    requireAdmin(req); const venue = validateVenue(req.body);
    const found = await db.query('SELECT id FROM venues WHERE id=$1', [req.params.id]);
    if (!found.rows.length) fail(404, 'Venue not found.');
    await saveVenue(db, req.params.id, venue, false);
    res.json({ venue: (await venueList(db, false)).find(item => item.id === req.params.id) });
  });
  app.post('/api/admin/images', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
    requireAdmin(req);
    const mime = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024 || !validImage(bytes, mime)) fail(400, 'Choose a valid JPG, PNG, or WebP picture up to 5 MB.');
    const id = crypto.randomUUID();
    await db.query('INSERT INTO images (id,mime,data) VALUES ($1,$2,$3)', [id, mime, bytes]);
    res.status(201).json({ imagePath: `/api/images/${id}` });
  });
  app.get('/api/images/:id', async (req, res) => {
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) fail(404, 'Picture not found.');
    const image = await db.query('SELECT mime,data FROM images WHERE id=$1', [req.params.id]);
    if (!image.rows.length) fail(404, 'Picture not found.');
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(image.rows[0].mime).send(Buffer.from(image.rows[0].data));
  });
  app.get('/api/admin/users', async (req, res) => {
    requireAdmin(req);
    const result = await db.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at DESC');
    res.json({ users: result.rows.map(publicUser) });
  });
  app.patch('/api/admin/users/:id', async (req, res) => {
    requireAdmin(req);
    if (typeof req.body.active !== 'boolean') fail(400, 'Provide an active state.');
    const changed = await db.query("UPDATE users SET active=$1 WHERE id=$2 AND role='customer' RETURNING id,name,email,role,active,created_at", [req.body.active, req.params.id]);
    if (!changed.rows.length) fail(404, 'Customer not found.');
    if (!req.body.active) await db.query('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
    res.json({ user: publicUser(changed.rows[0]) });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use('/assets', express.static(path.join(root, 'assets'), { maxAge: '1d' }));
  const built = path.join(root, 'web', 'dist');
  if (fs.existsSync(path.join(built, 'index.html'))) {
    app.use(express.static(built));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(built, 'index.html')));
  } else if (options.serveLegacy !== false) {
    app.get('/', (req, res) => res.sendFile(path.join(root, 'Club reserv.html')));
    for (const name of ['app.js', 'app.css', 'theme-init.js']) app.get(`/${name}`, (req, res) => res.sendFile(path.join(root, name)));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : error.message });
  });
  return app;
}

function validateAccount(input) {
  const name = text(input.name, 80), email = text(input.email, 160).toLowerCase(), password = input.password;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 200) fail(400, 'Enter a name, valid email, and password of at least 8 characters.');
  return { name, email, password };
}
function validateReservation(input) {
  const venueId = text(input.venueId, 100), type = text(input.type, 20), date = text(input.date, 10), startTime = text(input.startTime, 5);
  const guests = Number(input.guests), note = text(input.note, 300);
  if (!venueId || !['entrance', 'seat', 'table'].includes(type) || !validDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !Number.isInteger(guests) || guests < 1 || guests > 30) fail(400, 'Choose a venue, date, arrival time, option, and 1–30 guests.');
  if (date === today() && startTime <= nowTime()) fail(400, 'Choose a future arrival time.');
  return { venueId, type, date, startTime, guests, note };
}
async function createOrEditReservation(tx, input, userId, id = '') {
  const found = await tx.query('SELECT o.*,v.active,v.partner FROM offers o JOIN venues v ON v.id=o.venue_id WHERE o.venue_id=$1 AND o.type=$2 FOR UPDATE OF o', [input.venueId, input.type]);
  const offer = found.rows[0];
  if (!offer || !offer.active || !offer.partner || !offer.start_times.includes(input.startTime)) fail(409, 'This arrival slot is no longer available.');
  const start = `${input.date} ${input.startTime}:00`, end = slotEnd(input.date, input.startTime, offer.duration_minutes);
  if (await remaining(tx, input.venueId, input.type, start, end, offer.capacity, id) < input.guests) fail(409, 'This slot does not have enough space for your group.');
  const total = offer.type === 'table' ? offer.price : offer.price * input.guests;
  if (id) {
    await tx.query('UPDATE reservations SET venue_id=$1,type=$2,booking_date=$3,start_time=$4,start_at=$5,end_at=$6,duration_minutes=$7,guests=$8,note=$9,total=$10,updated_at=NOW() WHERE id=$11', [input.venueId, input.type, input.date, input.startTime, start, end, offer.duration_minutes, input.guests, input.note, total, id]);
  } else {
    id = crypto.randomUUID();
    const reference = `QC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await tx.query('INSERT INTO reservations (id,reference,user_id,venue_id,type,booking_date,start_time,duration_minutes,start_at,end_at,guests,note,total,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,\'pending\')', [id, reference, userId, input.venueId, input.type, input.date, input.startTime, offer.duration_minutes, start, end, input.guests, input.note, total]);
  }
  const result = await tx.query(`${bookingSelect} WHERE r.id=$1`, [id]);
  return result.rows[0];
}
async function saveVenue(db, id, venue, isNew) {
  await db.transaction(async tx => {
    if (isNew) await tx.query('INSERT INTO venues (id,name,area,address,summary,vibe,hours,accent,active,partner,source_url,image_path,photo_credit,photo_credit_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [id, venue.name, venue.area, venue.address, venue.summary, venue.vibe, venue.hours, venue.accent, venue.active, venue.partner, venue.sourceUrl, venue.imagePath, venue.photoCredit, venue.photoCreditUrl]);
    else await tx.query('UPDATE venues SET name=$2,area=$3,address=$4,summary=$5,vibe=$6,hours=$7,accent=$8,active=$9,partner=$10,source_url=$11,image_path=$12,photo_credit=$13,photo_credit_url=$14 WHERE id=$1', [id, venue.name, venue.area, venue.address, venue.summary, venue.vibe, venue.hours, venue.accent, venue.active, venue.partner, venue.sourceUrl, venue.imagePath, venue.photoCredit, venue.photoCreditUrl]);
    await tx.query('DELETE FROM offers WHERE venue_id=$1', [id]);
    for (const offer of venue.offers) await tx.query('INSERT INTO offers (venue_id,type,price,capacity,duration_minutes,start_times) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [id, offer.type, offer.price, offer.capacity, offer.durationMinutes, JSON.stringify(offer.startTimes)]);
  });
}
function validImage(bytes, mime) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
async function start() {
  const db = await createDatabase();
  const app = createApp(db);
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, '0.0.0.0');
  try { await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); }
  catch (error) { await db.close(); throw error; }
  console.log(`QC After Dark is running at http://localhost:${port}`);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    try {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.close();
      process.exit(0);
    } catch (error) { console.error(error); process.exit(1); }
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { server, db };
}
if (require.main === module) start().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createApp, start, validDate, remaining };
