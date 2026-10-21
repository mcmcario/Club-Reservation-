const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-after-dark-'));
process.env.DATA_FILE = path.join(tempDir, 'store.json');
const { readStore } = require('../store');
const { server } = require('../server');

function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = key => parts.find(part => part.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

test('customer booking and admin moderation flow', async () => {
  const data = readStore();
  assert.equal(data.venues.length, 7);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', body, cookie = '') {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  try {
    const firstRun = await request('/api/me');
    assert.equal(firstRun.data.setupAvailable, true);
    const signup = await request('/api/signup', 'POST', { name: 'Customer One', email: 'customer@test.local', password: 'secure-password' });
    assert.equal(signup.status, 201);
    assert.equal(signup.data.user.role, 'user');
    const customerCookie = signup.cookie;
    assert.ok(customerCookie.startsWith('session='));

    const forbidden = await request('/api/admin/venues', 'POST', {}, customerCookie);
    assert.equal(forbidden.status, 403);

    const venues = await request('/api/venues');
    assert.equal(venues.data.venues.length, 7);
    assert.ok(venues.data.venues.some(item => item.name === 'AKAI 1108'));
    assert.ok(venues.data.venues.some(item => item.name === 'HEXA'));
    const discovery = venues.data.venues[0];
    const unavailable = await request('/api/bookings', 'POST', { venueId: discovery.id, type: 'table', date: today(), guests: 4 }, customerCookie);
    assert.equal(unavailable.status, 409);

    const admin = await request('/api/admin/setup', 'POST', { name: 'Site Admin', email: 'admin@test.local', password: 'secure-admin-password' });
    assert.equal(admin.status, 201);
    assert.equal(admin.data.user.role, 'admin');
    const adminCookie = admin.cookie;
    assert.equal((await request('/api/me')).data.setupAvailable, false);
    assert.equal((await request('/api/admin/setup', 'POST', { name: 'Other Admin', email: 'other@test.local', password: 'secure-admin-password' })).status, 409);
    const picture = fs.readFileSync(path.join(__dirname, '..', 'assets', 'urbn-qc.jpg'));
    const deniedUpload = await fetch(base + '/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: customerCookie }, body: picture });
    assert.equal(deniedUpload.status, 403);
    const invalidUpload = await fetch(base + '/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: Buffer.from('not an image') });
    assert.equal(invalidUpload.status, 400);
    const imageUpload = await fetch(base + '/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: picture });
    assert.equal(imageUpload.status, 201);
    const { imagePath } = await imageUpload.json();
    assert.match(imagePath, /^\/uploads\/[a-f0-9-]{36}\.jpg$/);
    const imageResponse = await fetch(base + imagePath);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), picture);
    const activated = await request(`/api/admin/venues/${discovery.id}`, 'PATCH', { ...discovery, partner: true, offers: [{ type: 'table', price: 2500, capacity: 24 }] }, adminCookie);
    assert.equal(activated.status, 200);
    const booking = await request('/api/bookings', 'POST', { venueId: discovery.id, type: 'table', date: today(), guests: 4 }, customerCookie);
    assert.equal(booking.status, 201);
    assert.equal(booking.data.booking.status, 'pending');
    const confirmed = await request(`/api/bookings/${booking.data.booking.id}`, 'PATCH', { status: 'confirmed' }, adminCookie);
    assert.equal(confirmed.status, 200);
    const mine = await request('/api/bookings', 'GET', undefined, customerCookie);
    assert.equal(mine.data.bookings[0].status, 'confirmed');

    const partner = await request('/api/admin/venues', 'POST', { name: 'Test Partner', area: 'Timog', address: 'Timog Avenue, Quezon City', summary: 'A test partner listing.', vibe: 'Lounge', hours: '8 PM – 2 AM', accent: 'blue', imagePath, photoCredit: 'Venue supplied photo', sourceUrl: 'https://example.com/partner', active: true, partner: true, offers: [{ type: 'entrance', price: 300, capacity: 20 }] }, adminCookie);
    assert.equal(partner.status, 201);
    assert.equal(partner.data.venue.partner, true);
    assert.equal(partner.data.venue.imagePath, imagePath);
    assert.equal(partner.data.venue.sourceUrl, 'https://example.com/partner');
    const badSource = await request(`/api/admin/venues/${partner.data.venue.id}`, 'PATCH', { ...partner.data.venue, sourceUrl: 'javascript:alert(1)' }, adminCookie);
    assert.equal(badSource.status, 400);
    const removedPhoto = await request(`/api/admin/venues/${partner.data.venue.id}`, 'PATCH', { ...partner.data.venue, imagePath: '', photoCredit: '' }, adminCookie);
    assert.equal(removedPhoto.status, 200);
    assert.equal(removedPhoto.data.venue.imagePath, '');
    const hidden = await request(`/api/admin/venues/${partner.data.venue.id}`, 'PATCH', { ...removedPhoto.data.venue, active: false }, adminCookie);
    assert.equal(hidden.status, 200);
    const publicVenues = await request('/api/venues');
    assert.equal(publicVenues.data.venues.some(item => item.id === partner.data.venue.id), false);

    const disabled = await request(`/api/admin/users/${signup.data.user.id}`, 'PATCH', { active: false }, adminCookie);
    assert.equal(disabled.status, 200);
    const signedOut = await request('/api/me', 'GET', undefined, customerCookie);
    assert.equal(signedOut.data.user, null);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (tempDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
