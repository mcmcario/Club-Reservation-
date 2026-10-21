const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoveryVenues } = require('../store');
const { createDatabase } = require('../api/db');
const { createApp } = require('../api/server');

function tomorrow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = key => parts.find(part => part.type === key).value;
  return new Date(Date.parse(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

test('database-backed club reservations enforce overlapping slot capacity', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-platform-'));
  const db = await createDatabase({ dataDir: path.join(temp, 'postgres'), legacyData: { users: [], venues: discoveryVenues, bookings: [] } });
  const server = createApp(db, { serveLegacy: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(route, method = 'GET', payload, cookie = '') {
    const response = await fetch(base + route, { method, headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  try {
    assert.equal((await call('/api/venues')).data.venues.length, 7);
    const admin = await call('/api/admin/setup', 'POST', { name: 'Club Admin', email: 'admin@test.local', password: 'admin-password-123' });
    assert.equal(admin.status, 201);
    const adminCookie = admin.cookie;
    assert.equal((await call('/api/admin/setup', 'POST', { name: 'Second', email: 'second@test.local', password: 'admin-password-123' })).status, 409);
    const guest = await call('/api/signup', 'POST', { name: 'Guest One', email: 'guest@test.local', password: 'guest-password-123' });
    const guestCookie = guest.cookie;
    assert.equal((await call('/api/admin/venues', 'POST', {}, guestCookie)).status, 403);
    const venue = await call('/api/admin/venues', 'POST', {
      name: 'Test Partner', area: 'Timog', address: 'Timog Avenue, Quezon City', summary: 'Test venue', vibe: 'Nightclub', hours: '8 PM–4 AM', accent: 'violet', active: true, partner: true,
      offers: [{ type: 'table', price: 2500, capacity: 4, durationMinutes: 120, startTimes: ['20:00', '21:00'] }]
    }, adminCookie);
    assert.equal(venue.status, 201);
    const id = venue.data.venue.id;
    const image = fs.readFileSync(path.join(__dirname, '..', 'assets', 'urbn-qc.jpg'));
    const uploaded = await fetch(base + '/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: image });
    assert.equal(uploaded.status, 201);
    const imagePath = (await uploaded.json()).imagePath;
    const served = await fetch(base + imagePath);
    assert.equal(served.status, 200);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), image);
    const date = tomorrow();
    const availability = await call(`/api/venues/${id}/availability?date=${date}&type=table`);
    assert.equal(availability.data.slots.length, 2);
    const first = await call('/api/reservations', 'POST', { venueId: id, type: 'table', date, startTime: '20:00', guests: 4 }, guestCookie);
    assert.equal(first.status, 201);
    assert.equal(first.data.reservation.status, 'pending');
    const overlap = await call('/api/reservations', 'POST', { venueId: id, type: 'table', date, startTime: '21:00', guests: 1 }, guestCookie);
    assert.equal(overlap.status, 409);
    const edited = await call(`/api/reservations/${first.data.reservation.id}`, 'PATCH', { venueId: id, type: 'table', date, startTime: '21:00', guests: 4, note: 'Birthday' }, guestCookie);
    assert.equal(edited.status, 200);
    assert.equal(edited.data.reservation.startTime, '21:00');
    const approved = await call(`/api/admin/reservations/${first.data.reservation.id}/status`, 'PATCH', { status: 'approved' }, adminCookie);
    assert.equal(approved.status, 200);
    assert.equal((await call(`/api/reservations/${first.data.reservation.id}`, 'PATCH', { venueId: id, type: 'table', date, startTime: '20:00', guests: 4 }, guestCookie)).status, 409);
    assert.equal((await call(`/api/admin/reservations/${first.data.reservation.id}/status`, 'PATCH', { status: 'completed' }, adminCookie)).status, 200);
    const next = await call('/api/reservations', 'POST', { venueId: id, type: 'table', date, startTime: '21:00', guests: 2 }, guestCookie);
    assert.equal(next.status, 201);
    assert.equal((await call(`/api/reservations/${next.data.reservation.id}/cancel`, 'POST', {}, guestCookie)).status, 200);
    const history = await call('/api/reservations', 'GET', undefined, guestCookie);
    assert.deepEqual(new Set(history.data.reservations.map(item => item.status)), new Set(['completed', 'cancelled']));
    const filtered = await call('/api/reservations?status=completed&q=Test', 'GET', undefined, adminCookie);
    assert.equal(filtered.data.reservations.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    if (temp.startsWith(os.tmpdir() + path.sep)) fs.rmSync(temp, { recursive: true, force: true });
  }
});
