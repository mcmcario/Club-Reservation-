const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const file = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');

// Discovery listings are real venues, but none is represented as a partner by default.
// Addresses are starting points for the prototype; admins should verify details with each venue.
const discoveryVenues = [
  {
    id: 'venue-akai-1108', name: 'AKAI 1108', area: 'Katipunan',
    address: 'Unit 303, FBR Arcade, 317 Katipunan Avenue, Quezon City',
    summary: 'A bar and nightlife venue along Katipunan Avenue.', vibe: 'Bar & club',
    hours: 'Check with venue', accent: 'rose', sourceUrl: 'https://www.corner.inc/place/ppsiQmugjwej',
    imagePath: '/assets/akai-1108.jpg', photoCreditUrl: 'https://www.corner.inc/place/ppsiQmugjwej', photoCredit: 'Corner'
  },
  {
    id: 'venue-radius-katipunan', name: 'Radius Katipunan', area: 'Katipunan',
    address: '3F, 318 Katipunan Avenue, Quezon City',
    summary: 'A bar in the Katipunan nightlife area.', vibe: 'Bar',
    hours: 'Check with venue', accent: 'violet', sourceUrl: 'https://www.instagram.com/p/DLhXMu1ST7B/',
    imagePath: '/assets/radius-katipunan.jpg', photoCreditUrl: 'https://www.instagram.com/p/DLhXMu1ST7B/', photoCredit: 'Radius / Instagram'
  },
  {
    id: 'venue-club-hype', name: 'Club HYPE', area: 'Tomas Morato',
    address: '232 Scout Borromeo Street, Quezon City',
    summary: 'A nightclub in the Tomas Morato and Scout area.', vibe: 'Nightclub',
    hours: 'Check with venue', accent: 'blue', sourceUrl: 'https://linktr.ee/clubhypeph',
    imagePath: '/assets/club-hype.jpg', photoCreditUrl: 'https://www.facebook.com/clubhypeqc', photoCredit: 'Club HYPE / Facebook'
  },
  {
    id: 'venue-corte-ibiza', name: 'Corte Ibiza Super Club', area: 'Tomas Morato',
    address: '281 Tomas Morato Avenue corner Scout Castor Street, Quezon City',
    summary: 'A nightclub on Tomas Morato Avenue.', vibe: 'Super club',
    hours: 'Check with venue', accent: 'amber', sourceUrl: 'https://www.facebook.com/343086116049520/',
    imagePath: '/assets/corte-ibiza.jpg', photoCreditUrl: 'https://www.facebook.com/343086116049520/', photoCredit: 'Corte Ibiza / Facebook'
  },
  {
    id: 'venue-hexa', name: 'HEXA', area: 'Tomas Morato',
    address: '184 Unit C, Kojak Building, Tomas Morato Avenue, Quezon City',
    summary: 'A nightclub on Tomas Morato Avenue.', vibe: 'Nightclub',
    hours: 'Check with venue', accent: 'violet', sourceUrl: 'https://www.findglocal.com/PH/Quezon-City/1453603-17/genre/191478144212980/Night%2Bclubs',
    imagePath: '/assets/hexa.jpg', photoCreditUrl: 'https://www.instagram.com/p/DBJAJsIKSrP/', photoCredit: 'HEXA / Instagram'
  },
  {
    id: 'venue-urbn-qc', name: 'URBN QC', area: 'Timog',
    address: '62 Timog Avenue, Quezon City',
    summary: 'A bar and dance club on Timog Avenue.', vibe: 'Dance club',
    hours: 'Check with venue', accent: 'blue', sourceUrl: 'https://www.facebook.com/URBNQC/',
    imagePath: '/assets/urbn-qc.jpg', photoCreditUrl: 'https://static.wixstatic.com/media/fb344d_01d83b326a9b42f48f27a49342f8e78e~mv2.jpg', photoCredit: 'URBN QC website'
  },
  {
    id: 'venue-g-side', name: 'G-Side Tomas Morato', area: 'Tomas Morato',
    address: '27A Tomas Morato Avenue corner Eugenio Lopez Drive, Quezon City',
    summary: 'A nightclub in the Tomas Morato area.', vibe: 'Nightclub',
    hours: 'Check with venue', accent: 'rose', sourceUrl: 'https://www.facebook.com/GSideNightClub/',
    imagePath: '/assets/g-side.jpg', photoCreditUrl: 'https://www.overheremanila.com/best-girls-night-out-ideas-in-manila/', photoCredit: 'G-Side / Instagram via Over Here Manila'
  }
].map(venue => ({ ...venue, active: true, partner: false, offers: [] }));

function initialStore() {
  return { version: 5, users: [], sessions: [], venues: structuredClone(discoveryVenues), bookings: [] };
}

function migrateStore(data) {
  if (data.version >= 5) return data;
  if (data.version < 2) {
    const reservedIds = new Set(data.bookings.map(booking => booking.venueId));
    data.venues = data.venues
      .filter(venue => !venue.id.startsWith('demo-') || reservedIds.has(venue.id))
      .map(venue => venue.id.startsWith('demo-') ? { ...venue, active: false, partner: false } : { ...venue, partner: venue.partner !== false });
    const existingIds = new Set(data.venues.map(venue => venue.id));
    for (const venue of discoveryVenues) if (!existingIds.has(venue.id)) data.venues.push(structuredClone(venue));
  }
  const seedById = new Map(discoveryVenues.map(venue => [venue.id, venue]));
  data.venues = data.venues.map(venue => {
    const seed = seedById.get(venue.id);
    if (!seed) return venue;
    const radiusAddress = venue.id === 'venue-radius-katipunan' && venue.address === 'Katipunan Avenue, Quezon City'
      ? { address: seed.address, sourceUrl: seed.sourceUrl } : {};
    return { ...venue, imagePath: seed.imagePath, photoCreditUrl: seed.photoCreditUrl, photoCredit: seed.photoCredit, sourceUrl: seed.sourceUrl, ...radiusAddress };
  });
  data.version = 5;
  writeStore(data);
  return data;
}

function readStore() {
  if (!fs.existsSync(file)) {
    const data = initialStore();
    writeStore(data);
    return data;
  }
  return migrateStore(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || hash.length !== 128) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

module.exports = { readStore, writeStore, hashPassword, verifyPassword, discoveryVenues };
