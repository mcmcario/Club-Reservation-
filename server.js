const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readStore, writeStore, hashPassword, verifyPassword } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(path.dirname(process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json')), 'uploads');
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const attempts = new Map();
const assets = {
  '/': ['Club reserv.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/theme-init.js': ['theme-init.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  ...Object.fromEntries(['akai-1108', 'radius-katipunan', 'club-hype', 'corte-ibiza', 'hexa', 'urbn-qc', 'urbn-qc-interior', 'g-side']
    .map(name => [`/assets/${name}.jpg`, [`assets/${name}.jpg`, 'image/jpeg']]))
};

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function text(value, max = 200) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt }; }
function cookie(req) { return (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('session='))?.slice(8); }
function auth(data, req) {
  const token = cookie(req);
  if (!token) return null;
  const session = data.sessions.find(item => item.token === token && item.expiresAt > Date.now());
  return session ? data.users.find(user => user.id === session.userId && user.active) || null : null;
}
function requireUser(user) { if (!user) fail(401, 'Please sign in to continue.'); }
function requireAdmin(user) { requireUser(user); if (user.role !== 'admin') fail(403, 'Admin access is required.'); }
function setSession(data, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions = data.sessions.filter(item => item.expiresAt > Date.now());
  data.sessions.push({ token, userId: user.id, expiresAt: Date.now() + SESSION_AGE });
  writeStore(data);
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_AGE / 1000}`);
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Send JSON data.');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) fail(413, 'Request is too large.');
  }
  try { return JSON.parse(raw || '{}'); } catch { fail(400, 'Invalid JSON.'); }
}
async function imageBody(req) {
  const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!extension) fail(415, 'Choose a JPG, PNG, or WebP image.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_IMAGE_SIZE) fail(413, 'Image must be 5 MB or smaller.');
    chunks.push(chunk);
  }
  const image = Buffer.concat(chunks);
  const valid = extension === 'jpg' ? image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
    : extension === 'png' ? image.length >= 8 && image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) fail(400, 'The selected file is not a valid image of that type.');
  return { image, extension };
}
function safeUrl(value) {
  const url = text(value, 500);
  if (!url) return '';
  try { if (['http:', 'https:'].includes(new URL(url).protocol)) return url; } catch { /* Reject invalid URLs. */ }
  fail(400, 'Use a full http or https link for venue and photo sources.');
}
function imagePath(value, existing = '') {
  const requested = value === undefined ? existing : text(value, 100);
  if (!requested) return '';
  if (assets[requested]?.[1] === 'image/jpeg') return requested;
  const match = requested.match(/^\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/);
  if (match && fs.existsSync(path.join(UPLOAD_DIR, match[1]))) return requested;
  fail(400, 'Upload a picture before saving this venue.');
}
function localToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = key => parts.find(part => part.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  const diff = (parsed - new Date(`${localToday()}T00:00:00Z`)) / 86400000;
  return !Number.isNaN(diff) && parsed.toISOString().slice(0, 10) === value && diff >= 0 && diff <= 90;
}
function validateVenue(input, existing = {}) {
  const name = text(input.name, 80), area = text(input.area, 30), address = text(input.address, 160);
  const summary = text(input.summary, 300), vibe = text(input.vibe, 40), hours = text(input.hours, 60);
  const partner = input.partner === true;
  if (!name || !['Katipunan', 'Timog', 'Tomas Morato'].includes(area) || !address || !summary || !vibe || !hours) fail(400, 'Complete all venue details and choose a supported area.');
  if (!Array.isArray(input.offers) || (partner && !input.offers.length)) fail(400, 'Partner venues need at least one booking option.');
  const seen = new Set();
  const offers = input.offers.map(offer => {
    const type = text(offer.type, 20);
    const price = Number(offer.price), capacity = Number(offer.capacity);
    if (!['entrance', 'seat', 'table'].includes(type) || seen.has(type) || !Number.isInteger(price) || price < 0 || price > 1000000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 10000) fail(400, 'Booking options need a unique type, valid price, and capacity.');
    seen.add(type);
    return { type, price, capacity };
  });
  const image = imagePath(input.imagePath, existing.imagePath);
  return { ...existing, name, area, address, summary, vibe, hours, partner, offers,
    imagePath: image, sourceUrl: safeUrl(input.sourceUrl ?? existing.sourceUrl),
    photoCredit: image ? text(input.photoCredit ?? existing.photoCredit, 100) : '',
    photoCreditUrl: image ? safeUrl(input.photoCreditUrl ?? existing.photoCreditUrl) : '',
    accent: ['violet', 'rose', 'amber', 'blue'].includes(input.accent) ? input.accent : existing.accent || 'violet', active: typeof input.active === 'boolean' ? input.active : existing.active ?? true };
}
function remaining(data, venue, date, type) {
  const offer = venue.offers.find(item => item.type === type);
  if (!offer) return 0;
  const used = data.bookings.filter(item => item.venueId === venue.id && item.date === date && item.type === type && ['pending', 'confirmed'].includes(item.status)).reduce((sum, item) => sum + item.guests, 0);
  return Math.max(0, offer.capacity - used);
}
function throttle(req, email) {
  const key = `${req.socket.remoteAddress}:${email}`;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
  recent.push(now); attempts.set(key, recent);
  if (attempts.size > 1000) attempts.clear();
}

async function api(req, res, pathname) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) fail(405, 'Method not allowed.');
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) fail(403, 'Invalid request origin.');
  }
  if (pathname === '/api/admin/images' && req.method === 'POST') {
    requireAdmin(auth(readStore(), req));
    const { image, extension } = await imageBody(req);
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), image, { flag: 'wx', mode: 0o600 });
    return send(res, 201, { imagePath: `/uploads/${filename}` });
  }
  const payload = req.method === 'GET' ? null : await body(req);
  const data = readStore();
  const user = auth(data, req);

  if (pathname === '/api/me' && req.method === 'GET') return send(res, 200, { user: user ? publicUser(user) : null, setupAvailable: !data.users.some(item => item.role === 'admin') });
  if (pathname === '/api/admin/setup' && req.method === 'POST') {
    if (data.users.some(item => item.role === 'admin')) fail(409, 'Admin setup is already complete. Please sign in.');
    const name = text(payload.name, 80), email = text(payload.email, 160).toLowerCase(), password = payload.password;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 200) fail(400, 'Enter a name, valid email, and password of at least 8 characters.');
    if (data.users.some(item => item.email === email)) fail(409, 'An account with this email already exists.');
    const admin = { id: crypto.randomUUID(), name, email, password: hashPassword(password), role: 'admin', active: true, createdAt: new Date().toISOString() };
    data.users.push(admin); setSession(data, res, admin);
    return send(res, 201, { user: publicUser(admin) });
  }
  if (pathname === '/api/signup' && req.method === 'POST') {
    const input = payload, name = text(input.name, 80), email = text(input.email, 160).toLowerCase(), password = input.password;
    throttle(req, email);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 200) fail(400, 'Enter your name, a valid email, and a password of at least 8 characters.');
    if (data.users.some(item => item.email === email)) fail(409, 'An account with this email already exists.');
    const newUser = { id: crypto.randomUUID(), name, email, password: hashPassword(password), role: 'user', active: true, createdAt: new Date().toISOString() };
    data.users.push(newUser); setSession(data, res, newUser);
    return send(res, 201, { user: publicUser(newUser) });
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    const input = payload, email = text(input.email, 160).toLowerCase();
    throttle(req, email);
    const found = data.users.find(item => item.email === email);
    if (!found || !verifyPassword(input.password, found.password)) fail(401, 'Incorrect email or password.');
    if (!found.active) fail(403, 'This account has been disabled.');
    setSession(data, res, found);
    return send(res, 200, { user: publicUser(found) });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    data.sessions = data.sessions.filter(item => item.token !== cookie(req)); writeStore(data);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/venues' && req.method === 'GET') return send(res, 200, { venues: data.venues.filter(item => item.active) });
  if (pathname === '/api/admin/venues' && req.method === 'GET') { requireAdmin(user); return send(res, 200, { venues: data.venues }); }
  if (pathname === '/api/admin/venues' && req.method === 'POST') {
    requireAdmin(user); const input = payload;
    const venue = validateVenue(input, { id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    data.venues.unshift(venue); writeStore(data); return send(res, 201, { venue });
  }
  const venueMatch = pathname.match(/^\/api\/admin\/venues\/([^/]+)$/);
  if (venueMatch && req.method === 'PATCH') {
    requireAdmin(user); const venue = data.venues.find(item => item.id === venueMatch[1]);
    if (!venue) fail(404, 'Venue not found.');
    Object.assign(venue, validateVenue(payload, venue)); writeStore(data); return send(res, 200, { venue });
  }
  if (pathname === '/api/bookings' && req.method === 'GET') {
    requireUser(user);
    const bookings = (user.role === 'admin' ? data.bookings : data.bookings.filter(item => item.userId === user.id)).map(item => ({ ...item, venueName: data.venues.find(venue => venue.id === item.venueId)?.name || 'Archived venue', customerName: data.users.find(customer => customer.id === item.userId)?.name || 'Unknown' }));
    return send(res, 200, { bookings: bookings.reverse() });
  }
  if (pathname === '/api/bookings' && req.method === 'POST') {
    requireUser(user); if (user.role !== 'user') fail(403, 'Use a customer account to book.');
    const input = payload, venue = data.venues.find(item => item.id === input.venueId && item.active);
    const type = text(input.type, 20), date = text(input.date, 20), guests = Number(input.guests), note = text(input.note, 300);
    if (!venue || !validDate(date) || !Number.isInteger(guests) || guests < 1 || guests > 30) fail(400, 'Choose an active venue, a date within 90 days, and 1–30 guests.');
    if (!venue.partner) fail(409, 'This venue is listed for discovery. In-app booking is not available until it becomes a partner.');
    const offer = venue.offers.find(item => item.type === type);
    if (!offer) fail(400, 'This booking option is unavailable.');
    if (remaining(data, venue, date, type) < guests) fail(409, 'There is not enough availability for this date and option.');
    const booking = { id: crypto.randomUUID(), reference: `QC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, userId: user.id, venueId: venue.id, type, date, guests, note, total: type === 'table' ? offer.price : offer.price * guests, status: 'pending', createdAt: new Date().toISOString() };
    data.bookings.push(booking); writeStore(data); return send(res, 201, { booking });
  }
  const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bookingMatch && req.method === 'PATCH') {
    requireUser(user); const booking = data.bookings.find(item => item.id === bookingMatch[1]);
    if (!booking) fail(404, 'Booking not found.');
    const input = payload, next = text(input.status, 20);
    if (user.role === 'admin') {
      if (!['confirmed', 'rejected'].includes(next) || booking.status !== 'pending') fail(400, 'Only pending bookings can be confirmed or rejected.');
    } else if (booking.userId !== user.id || next !== 'cancelled' || !['pending', 'confirmed'].includes(booking.status)) fail(403, 'You cannot change this booking.');
    booking.status = next; booking.updatedAt = new Date().toISOString(); writeStore(data); return send(res, 200, { booking });
  }
  if (pathname === '/api/admin/users' && req.method === 'GET') { requireAdmin(user); return send(res, 200, { users: data.users.map(publicUser) }); }
  const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && req.method === 'PATCH') {
    requireAdmin(user); const target = data.users.find(item => item.id === userMatch[1]);
    if (!target) fail(404, 'User not found.');
    if (target.role === 'admin') fail(403, 'Admin accounts cannot be changed here.');
    const input = payload; if (typeof input.active !== 'boolean') fail(400, 'Provide an active state.');
    target.active = input.active; if (!target.active) data.sessions = data.sessions.filter(item => item.userId !== target.id);
    writeStore(data); return send(res, 200, { user: publicUser(target) });
  }
  fail(404, 'Page not found.');
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    const uploaded = pathname.match(/^\/uploads\/([a-f0-9-]{36}\.(jpg|png|webp))$/);
    if (req.method === 'GET' && uploaded) {
      const filename = path.join(UPLOAD_DIR, uploaded[1]);
      if (!fs.existsSync(filename)) return fail(404, 'Image not found.');
      const content = fs.readFileSync(filename);
      const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[uploaded[2]];
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(content);
    }
    if (req.method !== 'GET' || !assets[pathname]) return fail(404, 'Page not found.');
    const [filename, mime] = assets[pathname];
    const content = fs.readFileSync(path.join(__dirname, filename));
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'" });
    res.end(content);
  } catch (error) {
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong.' });
    if (!error.status) console.error(error);
  }
});

if (require.main === module) {
  readStore();
  server.listen(PORT, '127.0.0.1', () => console.log(`QC After Dark is running at http://localhost:${PORT}`));
}
module.exports = { server, validDate, remaining };
