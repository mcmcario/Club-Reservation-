const app = document.getElementById('app');
const state = { user: null, guest: false, view: 'auth', authMode: 'login', setupAvailable: false, afterAuth: null, venues: [], bookings: [], adminVenues: [], users: [], area: 'All', search: '', savedOnly: false, savedIds: new Set(), surpriseId: null, selectedVenue: null, adminTab: 'overview', editVenue: null };
const savedKey = 'qc-after-dark-saved-venues';
try {
  const saved = JSON.parse(localStorage.getItem(savedKey) || '[]');
  if (Array.isArray(saved)) state.savedIds = new Set(saved.filter(id => typeof id === 'string'));
} catch { /* Saved venues remain available for this visit. */ }
const peso = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const typeName = type => ({ entrance: 'Entrance', seat: 'Seat', table: 'Table' })[type] || type;
const initials = name => (name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
function today() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const get = key => parts.find(part => part.type === key).value; return `${get('year')}-${get('month')}-${get('day')}`; }
function bookingLimit() { return new Date(Date.parse(`${today()}T00:00:00Z`) + 90 * 86400000).toISOString().slice(0, 10); }
function toast(message) { document.querySelector('.toast')?.remove(); const box = document.createElement('div'); box.className = 'toast'; box.textContent = message; document.body.append(box); setTimeout(() => box.remove(), 4000); }
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
async function uploadImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP picture.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Picture must be 5 MB or smaller.');
  const response = await fetch('/api/admin/images', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Picture upload failed.');
  return data.imagePath;
}
async function refresh() {
  const [venues, bookings] = await Promise.all([api('/api/venues'), state.user ? api('/api/bookings') : Promise.resolve({ bookings: [] })]);
  state.venues = venues.venues; state.bookings = bookings.bookings;
  if (state.user?.role === 'admin') {
    const [adminVenues, users] = await Promise.all([api('/api/admin/venues'), api('/api/admin/users')]);
    state.adminVenues = adminVenues.venues; state.users = users.users;
  }
}
function brand() { return `<a href="#" class="brand" data-action="home"><span class="brand-mark">✦</span><span>QC After Dark<small>Quezon City nightlife</small></span></a>`; }
function themeButton() { const light = document.documentElement.dataset.theme === 'light'; return `<button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="Switch to ${light ? 'dark' : 'light'} mode" title="Switch to ${light ? 'dark' : 'light'} mode"><span class="theme-icon" aria-hidden="true">${light ? '☾' : '☀'}</span><span class="theme-label">${light ? 'Dark mode' : 'Light mode'}</span></button>`; }
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('qc-after-dark-theme', theme); } catch { /* Keep the choice for this page. */ }
  document.cookie = `qc_theme=${theme}; Max-Age=31536000; SameSite=Lax; Path=/`;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f7f5fb' : '#030307';
  document.querySelectorAll('.theme-toggle').forEach(button => { button.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`); button.title = button.getAttribute('aria-label'); button.querySelector('.theme-icon').textContent = theme === 'light' ? '☾' : '☀'; button.querySelector('.theme-label').textContent = theme === 'light' ? 'Dark mode' : 'Light mode'; });
}
function header() {
  return `<header class="shell topbar">${brand()}<nav class="top-actions">
    ${state.user?.role === 'admin' ? `<button class="nav-link" data-action="admin">Dashboard</button><button class="nav-link" data-action="browse">Explore</button>` : `<button class="nav-link" data-action="browse">Explore</button>${state.user ? `<button class="nav-link" data-action="bookings">My bookings</button>` : ''}`}
    ${themeButton()}${state.user ? `<span class="user-chip"><span class="avatar">${esc(initials(state.user.name))}</span><span>${esc(state.user.name.split(' ')[0])}</span></span><button class="text-btn" data-action="logout">Log out</button>` : `<button class="pill-btn small-btn" data-action="show-auth">Sign in</button>`}
  </nav></header>`;
}
function footer() { return `<footer class="footer"><div class="shell footer-inner"><div>${brand()}</div><div>Made for nights out in Quezon City · Reservations require venue confirmation.</div></div></footer>`; }
function authPage() {
  const signup = state.authMode === 'signup';
  const setup = state.authMode === 'admin-setup' && state.setupAvailable;
  const needsName = signup || setup;
  return `<main class="auth-layout"><section class="auth-art">${brand()}<div class="auth-copy"><span class="eyebrow">Quezon City nights, made easy</span><h1>Find your <em>next night</em> out.</h1><p>Explore real bars and clubs around Katipunan, Timog, and Tomas Morato. Partner venues can accept requests for entrance, seats, or tables.</p></div><div class="auth-foot"><span>01 — Discover</span><span>02 — Request</span><span>03 — Get confirmed</span></div></section>
  <section class="auth-panel"><div class="auth-theme">${themeButton()}</div><div class="auth-card"><span class="eyebrow">Welcome to QC After Dark</span><h2>${setup ? 'Set up your site.' : signup ? 'Join the night.' : 'Good to see you.'}</h2><p>${setup ? 'Create the first admin account to manage venues, pictures, bookings, and customers.' : signup ? 'Create a customer account to request reservations and track them.' : 'Sign in to book your next night. Admins use this same sign-in.'}</p>
    <div class="tabs"><button class="${!signup && !setup ? 'active' : ''}" data-action="auth-login">Sign in</button><button class="${signup ? 'active' : ''}" data-action="auth-signup">Create account</button>${state.setupAvailable ? `<button class="${setup ? 'active' : ''}" data-action="auth-admin-setup">Set up admin</button>` : ''}</div>
    <form id="auth-form">${needsName ? `<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="name" required autocomplete="name" placeholder="Your name"></div>` : ''}
      <div class="field"><label for="auth-email">Email address</label><input id="auth-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com"></div>
      <div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" name="password" required minlength="${needsName ? 8 : 1}" autocomplete="${needsName ? 'new-password' : 'current-password'}" placeholder="${needsName ? 'At least 8 characters' : 'Your password'}"></div>
      <div id="auth-error" aria-live="polite"></div><button class="primary-btn full" type="submit">${setup ? 'Create admin account' : signup ? 'Create account' : 'Sign in'} →</button>
    </form><div class="divider">or</div><button class="outline-btn full" data-action="guest">Explore as guest</button><p class="fineprint">Guests can browse venues. Create an account to make a reservation request.</p>
  </div></section></main>`;
}
function venueArt(venue, detail = false) {
  const image = venue.imagePath ? `<img class="venue-photo" src="${esc(venue.imagePath)}" alt="${esc(venue.name)} venue" loading="${detail ? 'eager' : 'lazy'}">` : '';
  const credit = venue.photoCredit ? venue.photoCreditUrl
    ? `<a class="photo-credit" href="${esc(venue.photoCreditUrl)}" target="_blank" rel="noopener noreferrer">Photo: ${esc(venue.photoCredit)} ↗</a>`
    : `<span class="photo-credit">Photo: ${esc(venue.photoCredit)}</span>` : '';
  const artStyle = ['venue-club-hype', 'venue-corte-ibiza'].includes(venue.id) ? 'identity-art' : venue.id === 'venue-radius-katipunan' ? 'portrait-art' : '';
  return `<div class="venue-art ${detail ? 'detail-art' : ''} ${image ? 'has-photo' : ''} ${artStyle} ${esc(venue.accent)}" data-wordmark="${esc(venue.name)}">${image}<span class="venue-badge">${venue.partner ? 'Booking partner' : 'Discover venue'}</span>${credit}</div>`;
}
function venueCard(venue) {
  const lowest = venue.partner && venue.offers.length ? Math.min(...venue.offers.map(offer => offer.price)) : null;
  const saved = state.savedIds.has(venue.id);
  return `<article class="venue-card ${state.surpriseId === venue.id ? 'is-picked' : ''}" data-venue-id="${esc(venue.id)}">${venueArt(venue)}<button class="save-venue ${saved ? 'is-saved' : ''}" type="button" data-action="save-venue" data-id="${esc(venue.id)}" aria-label="${saved ? 'Remove ' : 'Save '}${esc(venue.name)}${saved ? ' from saved venues' : ' to saved venues'}" aria-pressed="${saved}" title="${saved ? 'Remove from saved' : 'Save venue'}">${saved ? '♥' : '♡'}</button><div class="venue-body"><div class="venue-meta"><span>${esc(venue.area)}</span><span>${esc(venue.vibe)}</span></div><h3>${esc(venue.name)}</h3><p>${esc(venue.summary)}</p><div class="venue-bottom"><div><small>${venue.partner ? 'Booking options from' : 'In-app booking'}</small><strong>${venue.partner ? peso(lowest) : 'Coming soon'}</strong></div><button class="outline-btn small-btn" data-action="venue" data-id="${esc(venue.id)}">View venue →</button></div></div></article>`;
}
function visibleSavedCount() { return state.venues.filter(venue => state.savedIds.has(venue.id)).length; }
function filteredVenues() { return state.venues.filter(venue => (state.area === 'All' || venue.area === state.area) && (!state.savedOnly || state.savedIds.has(venue.id)) && `${venue.name} ${venue.vibe} ${venue.area}`.toLowerCase().includes(state.search.toLowerCase())); }
function venueResults() {
  const venues = filteredVenues();
  const empty = state.savedOnly && !visibleSavedCount() ? 'Save venues with the heart button to make your shortlist.' : 'No venues match these filters.';
  return venues.map(venueCard).join('') || `<div class="empty">${empty}</div>`;
}
function updateVenueGrid() {
  const grid = document.getElementById('venue-grid');
  if (!grid) return;
  grid.innerHTML = venueResults();
  const count = filteredVenues().length;
  document.getElementById('venue-count').textContent = `${count} ${count === 1 ? 'venue' : 'venues'} shown`;
}
function updateSavedControls() {
  document.querySelectorAll('[data-action="save-venue"]').forEach(button => {
    const venue = state.venues.find(item => item.id === button.dataset.id);
    if (!venue) return;
    const saved = state.savedIds.has(venue.id);
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', `${saved ? 'Remove ' : 'Save '}${venue.name}${saved ? ' from saved venues' : ' to saved venues'}`);
    button.title = saved ? 'Remove from saved' : 'Save venue';
    button.textContent = button.classList.contains('save-detail') ? `${saved ? '♥ Saved' : '♡ Save venue'}` : saved ? '♥' : '♡';
  });
  const filter = document.querySelector('[data-action="saved-only"]');
  if (filter) filter.textContent = `♡ Saved (${visibleSavedCount()})`;
}
function browsePage() {
  return `${header()}<main><section class="hero"><div class="shell hero-content"><div class="hero-copy"><span class="eyebrow">Your city, after hours</span><h1>Where will the <em>night</em> take you?</h1><p>Explore real nightlife spots in Katipunan, Timog, and Tomas Morato. Send reservation requests through QC After Dark when a venue becomes a booking partner.</p><div class="hero-cta"><a href="#venues" class="primary-btn">Explore venues ↓</a><button class="outline-btn surprise-btn" data-action="surprise">✦ Pick my spot</button>${!state.user ? `<button class="hero-account-link" data-action="show-auth">Create an account →</button>` : ''}</div><div class="hero-mini"><div><strong>03</strong><span>QC districts</span></div><div><strong>03</strong><span>Ways to book</span></div><div><strong>${String(state.venues.length).padStart(2, '0')}</strong><span>Places to explore</span></div></div></div><div class="hero-stage" aria-hidden="true"><div class="stage-halo"></div><div class="stage-photo stage-photo-back"><img src="/assets/akai-1108.jpg" alt=""></div><div class="stage-photo stage-photo-front"><img src="/assets/urbn-qc-interior.jpg" alt=""></div><div class="stage-caption"><span class="stage-dot"></span> Quezon City after dark</div></div></div></section>
  <section class="section shell" id="venues"><div class="section-heading"><div><span class="eyebrow">The directory</span><h2>Find your scene</h2></div><p>Browse real venues around Quezon City. Booking options and prices appear only after an admin sets up a partner listing.</p></div>
  <div class="demo-notice"><strong>✦</strong><span>Venue names and locations are for discovery. A listing does not mean the venue is partnered with this website. Check directly with the venue for current details.</span></div>
  <div class="filter-bar"><div class="filter-tabs">${['All', 'Katipunan', 'Timog', 'Tomas Morato'].map(area => `<button data-action="area" data-area="${area}" class="${state.area === area ? 'active' : ''}" aria-pressed="${state.area === area}">${area === 'All' ? 'All areas' : area}</button>`).join('')}</div><input class="search" id="venue-search" type="search" placeholder="Search a venue or vibe…" value="${esc(state.search)}" aria-label="Search venues"></div>
  <div class="directory-tools"><span id="venue-count" aria-live="polite">${filteredVenues().length} ${filteredVenues().length === 1 ? 'venue' : 'venues'} shown</span><button class="saved-filter ${state.savedOnly ? 'active' : ''}" type="button" data-action="saved-only" aria-pressed="${state.savedOnly}">♡ Saved (${visibleSavedCount()})</button><small>Saved venues stay on this browser.</small></div>
  <div class="venue-grid" id="venue-grid">${venueResults()}</div></section></main>${footer()}`;
}
function venuePage() {
  const venue = state.venues.find(item => item.id === state.selectedVenue);
  if (!venue) { state.view = 'browse'; return browsePage(); }
  const first = venue.offers[0];
  const bookingPanel = venue.partner ? `<aside class="booking-panel"><span class="eyebrow">Save your spot</span><h2>Request a booking</h2><p>Select your date and booking type. You will see it as pending until an admin confirms it.</p>
  <form id="booking-form"><div class="field"><label for="booking-date">Date</label><input id="booking-date" name="date" type="date" min="${today()}" max="${bookingLimit()}" required></div>
  <div class="field"><label for="booking-type">Booking type</label><select id="booking-type" name="type">${venue.offers.map(offer => `<option value="${offer.type}">${typeName(offer.type)} · ${peso(offer.price)}${offer.type === 'table' ? ' per table' : ' per person'}</option>`).join('')}</select></div>
  <div class="field"><label for="booking-guests">Number of guests</label><input id="booking-guests" name="guests" type="number" min="1" max="30" value="1" required></div>
  <div class="field"><label for="booking-note">Special request <span class="muted">(optional)</span></label><textarea id="booking-note" name="note" maxlength="300" placeholder="Anything the venue should know?"></textarea></div>
  <div class="price-preview"><span>Estimated amount<small id="price-rule">${first.type === 'table' ? 'Per table' : 'Per person'}</small></span><strong id="price-value">${peso(first.price)}</strong></div>
  <button class="primary-btn full" type="${state.user?.role === 'user' ? 'submit' : 'button'}" ${state.user?.role === 'user' ? '' : `data-action="${state.user?.role === 'admin' ? 'admin-book-info' : 'reserve-auth'}"`}>${state.user?.role === 'admin' ? 'Customer account required' : state.user ? 'Send booking request →' : 'Sign in to request →'}</button><p class="booking-note">No payment is taken here. Booking options are entered by the site admin after confirming them with the venue.</p></form></aside>` : `<aside class="booking-panel"><span class="eyebrow">Discovery listing</span><h2>Bookings coming soon.</h2><p>${esc(venue.name)} has not been set up as a booking partner on QC After Dark. This site cannot reserve entrance, seats, or tables here yet.</p><div class="demo-notice"><strong>✦</strong><span>Contact the venue directly for current hours, prices, and reservations.</span></div></aside>`;
  const saved = state.savedIds.has(venue.id);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`;
  return `${header()}<main><div class="shell"><div class="page-header"><button class="back-btn" data-action="browse">← Back to venues</button><span class="eyebrow">${esc(venue.area)} / ${esc(venue.vibe)}</span><h1>${esc(venue.name)}</h1><p>${esc(venue.address)}</p><div class="venue-quicklinks"><button class="outline-btn small-btn save-venue save-detail ${saved ? 'is-saved' : ''}" type="button" data-action="save-venue" data-id="${esc(venue.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove ' : 'Save '}${esc(venue.name)}${saved ? ' from saved venues' : ' to saved venues'}">${saved ? '♥ Saved' : '♡ Save venue'}</button><a class="outline-btn small-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">View map ↗</a>${venue.sourceUrl ? `<a class="outline-btn small-btn" href="${esc(venue.sourceUrl)}" target="_blank" rel="noopener noreferrer">Venue info ↗</a>` : ''}</div></div>
  <div class="detail-grid"><div>${venueArt(venue, true)}<div class="detail-summary"><span class="eyebrow">About the venue</span><h2>Your night starts here.</h2><p>${esc(venue.summary)}</p><div class="detail-facts"><div class="fact"><span>Neighborhood</span><strong>${esc(venue.area)}, Quezon City</strong></div><div class="fact"><span>Hours</span><strong>${esc(venue.hours)}</strong></div><div class="fact"><span>Booking choices</span><strong>${venue.partner ? venue.offers.map(item => typeName(item.type)).join(' · ') : 'Not available in app yet'}</strong></div><div class="fact"><span>Location</span><strong>${esc(venue.address)}</strong></div></div></div></div>${bookingPanel}</div></div></main>${footer()}`;
}
function bookingRow(item, admin = false) {
  return `<article class="data-row"><div><span class="status ${esc(item.status)}">${esc(item.status)}</span><h3>${esc(item.venueName)} · ${typeName(item.type)}</h3><p>${esc(item.reference)} · ${esc(item.date)} · ${item.guests} guest${item.guests === 1 ? '' : 's'} · ${peso(item.total)}${admin ? ` · ${esc(item.customerName)}` : ''}</p>${item.note ? `<p>Note: ${esc(item.note)}</p>` : ''}</div><div class="row-actions">${admin && item.status === 'pending' ? `<button class="pill-btn small-btn" data-action="booking-status" data-id="${esc(item.id)}" data-status="confirmed">Confirm</button><button class="danger-btn small-btn" data-action="booking-status" data-id="${esc(item.id)}" data-status="rejected">Reject</button>` : ''}${!admin && ['pending', 'confirmed'].includes(item.status) ? `<button class="outline-btn small-btn" data-action="booking-status" data-id="${esc(item.id)}" data-status="cancelled">Cancel request</button>` : ''}</div></article>`;
}
function bookingsPage() { return `${header()}<main class="shell dashboard"><button class="back-btn" data-action="browse">← Explore venues</button><div class="dash-top"><div><span class="eyebrow">Your plans</span><h1>My bookings</h1><p class="muted">Track your requests and their confirmation status.</p></div><button class="pill-btn" data-action="browse">Find a venue →</button></div><div class="data-list" style="margin-top:30px">${state.bookings.length ? state.bookings.map(item => bookingRow(item)).join('') : `<div class="empty">No bookings yet. Explore the directory to plan your first night.</div>`}</div></main>${footer()}`; }
function adminVenueRow(venue) { return `<article class="data-row admin-venue-row"><div class="admin-venue-main"><div class="admin-venue-thumb">${venue.imagePath ? `<img src="${esc(venue.imagePath)}" alt="" loading="lazy">` : '<span aria-hidden="true">✦</span>'}</div><div><span class="status ${venue.active ? 'active' : 'disabled'}">${venue.active ? 'Active' : 'Hidden'}</span><h3>${esc(venue.name)} · ${venue.partner ? 'Booking partner' : 'Discovery only'}</h3><p>${esc(venue.area)} · ${esc(venue.address)} · ${venue.partner ? venue.offers.map(item => typeName(item.type)).join(', ') : 'No in-app bookings'}</p></div></div><div class="row-actions"><button class="outline-btn small-btn" data-action="edit-venue" data-id="${esc(venue.id)}">Edit</button><button class="${venue.active ? 'danger-btn' : 'pill-btn'} small-btn" data-action="toggle-venue" data-id="${esc(venue.id)}">${venue.active ? 'Hide' : 'Show'}</button></div></article>`; }
function venueForm() {
  const venue = state.adminVenues.find(item => item.id === state.editVenue) || {};
  const offer = type => venue.offers?.find(item => item.type === type);
  return `<section class="panel venue-editor" id="venue-form-panel"><span class="eyebrow">Partner directory</span><h2>${venue.id ? `Edit ${esc(venue.name)}` : 'Add club or business'}</h2><p class="field-note editor-intro">Enter the information guests will see. You can save a discovery listing first, then turn on bookings when prices and capacity are agreed with the venue.</p><form id="venue-form">
  <div class="form-grid">
    <div class="field"><label>Venue name</label><input name="name" value="${esc(venue.name)}" maxlength="80" required></div>
    <div class="field"><label>Area</label><select name="area" required><option value="">Choose area</option>${['Katipunan', 'Timog', 'Tomas Morato'].map(area => `<option ${venue.area === area ? 'selected' : ''}>${area}</option>`).join('')}</select></div>
    <div class="field"><label>Address</label><input name="address" value="${esc(venue.address)}" maxlength="160" required></div>
    <div class="field"><label>Vibe / category</label><input name="vibe" value="${esc(venue.vibe)}" maxlength="40" placeholder="Cocktail bar, Dance club…" required></div>
    <div class="field"><label>Opening hours</label><input name="hours" value="${esc(venue.hours)}" maxlength="60" placeholder="Check with venue" required></div>
    <div class="field"><label>Card color</label><select name="accent">${['violet', 'rose', 'amber', 'blue'].map(color => `<option value="${color}" ${venue.accent === color ? 'selected' : ''}>${color[0].toUpperCase() + color.slice(1)}</option>`).join('')}</select></div>
  </div>
  <div class="field"><label>Description</label><textarea name="summary" maxlength="300" required>${esc(venue.summary)}</textarea></div>
  <div class="field"><label>Official website or social page <span class="muted">(optional)</span></label><input name="sourceUrl" type="url" value="${esc(venue.sourceUrl)}" placeholder="https://www.instagram.com/yourvenue/"></div>
  <div class="venue-photo-editor"><div><span class="eyebrow">Listing picture</span><p class="field-note">Upload a landscape photo for the card shown to guests. JPG, PNG, or WebP, up to 5 MB. A 16:9 image works best.</p><div class="field"><label for="venue-image">Choose picture</label><input id="venue-image" name="image" type="file" accept="image/jpeg,image/png,image/webp"></div>${venue.imagePath ? `<label class="checkbox-line"><input name="removePhoto" type="checkbox" id="remove-photo"> Remove current picture</label>` : ''}<div class="field"><label>Photo credit <span class="muted">(optional)</span></label><input name="photoCredit" maxlength="100" value="${esc(venue.photoCredit)}" placeholder="Venue supplied photo"></div><div class="field"><label>Photo source link <span class="muted">(optional)</span></label><input name="photoCreditUrl" type="url" value="${esc(venue.photoCreditUrl)}" placeholder="https://www.instagram.com/p/..."></div></div><div class="photo-preview" id="photo-preview">${venue.imagePath ? `<img src="${esc(venue.imagePath)}" alt="Current listing picture">` : '<span>Picture preview</span>'}</div></div>
  <label class="checkbox-line"><input type="checkbox" name="partner" ${venue.partner ? 'checked' : ''}> Booking partner · allow in-app reservation requests</label>
  <span class="eyebrow">Booking options</span><p class="field-note" style="margin:8px 0 16px">Choose at least one option before enabling a booking partner. Capacity is guests per date. Table price is per table; other prices are per guest.</p>
  <div class="offer-grid">${['entrance', 'seat', 'table'].map(type => `<div class="offer-card"><label><input type="checkbox" name="offer-${type}" ${offer(type) ? 'checked' : ''}> ${typeName(type)}</label><div class="field"><label>Price (₱)</label><input type="number" min="0" max="1000000" name="price-${type}" value="${offer(type)?.price ?? ''}" placeholder="0"></div><div class="field"><label>Guest capacity / date</label><input type="number" min="1" max="10000" name="capacity-${type}" value="${offer(type)?.capacity ?? ''}" placeholder="50"></div></div>`).join('')}</div>
  <label class="checkbox-line"><input type="checkbox" name="active" ${venue.active !== false ? 'checked' : ''}> Visible in directory</label><div class="row-actions" style="justify-content:start"><button type="submit" class="primary-btn">${venue.id ? 'Save changes' : 'Add club or business'}</button>${venue.id ? `<button type="button" class="outline-btn" data-action="new-venue">Cancel editing</button>` : ''}</div></form></section>`;
}
function adminPage() {
  const pending = state.bookings.filter(item => item.status === 'pending').length;
  const active = state.adminVenues.filter(item => item.active).length;
  const customers = state.users.filter(item => item.role === 'user').length;
  return `${header()}<main class="shell dashboard"><div class="dash-top"><div><span class="eyebrow">Control room</span><h1>Admin dashboard</h1><p class="muted">Manage listings, reservation requests, and customer access.</p></div><button class="pill-btn" data-action="new-venue">+ Add club or business</button></div>
  <div class="stat-grid"><div class="stat"><strong>${pending}</strong><span>Pending requests</span></div><div class="stat"><strong>${active}</strong><span>Visible venues</span></div><div class="stat"><strong>${customers}</strong><span>Customer accounts</span></div></div>
  <div class="dash-tabs">${[['overview', 'Overview'], ['bookings', 'Reservations'], ['venues', 'Venues'], ['users', 'Users']].map(([key, name]) => `<button class="${state.adminTab === key ? 'active' : ''}" data-action="admin-tab" data-tab="${key}">${name}</button>`).join('')}</div>
  ${state.adminTab === 'overview' ? `<div class="section-heading"><div><span class="eyebrow">Needs attention</span><h2>Pending requests</h2></div><p>Confirm or reject incoming bookings. Pending requests reserve capacity until reviewed.</p></div><div class="data-list">${state.bookings.filter(item => item.status === 'pending').map(item => bookingRow(item, true)).join('') || `<div class="empty">You're all caught up. No pending requests.</div>`}</div>` : ''}
  ${state.adminTab === 'bookings' ? `<div class="data-list">${state.bookings.map(item => bookingRow(item, true)).join('') || `<div class="empty">There are no reservations yet.</div>`}</div>` : ''}
  ${state.adminTab === 'venues' ? `<div class="data-list">${state.adminVenues.map(adminVenueRow).join('') || `<div class="empty">No venues yet.</div>`}</div>${venueForm()}` : ''}
  ${state.adminTab === 'users' ? `<div class="data-list">${state.users.map(user => `<article class="data-row"><div><span class="status ${user.active ? 'active' : 'disabled'}">${user.active ? 'Active' : 'Disabled'}</span><h3>${esc(user.name)} ${user.role === 'admin' ? '· Admin' : ''}</h3><p>${esc(user.email)} · Joined ${esc(user.createdAt.slice(0, 10))}</p></div><div class="row-actions">${user.role !== 'admin' ? `<button class="${user.active ? 'danger-btn' : 'pill-btn'} small-btn" data-action="toggle-user" data-id="${esc(user.id)}">${user.active ? 'Disable' : 'Enable'}</button>` : ''}</div></article>`).join('') || `<div class="empty">No users yet.</div>`}</div>` : ''}
  </main>${footer()}`;
}
function render() {
  app.innerHTML = state.view === 'auth' ? authPage() : state.view === 'browse' ? browsePage() : state.view === 'venue' ? venuePage() : state.view === 'bookings' ? bookingsPage() : adminPage();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function go(view) { state.view = view; render(); }
function showError(id, error) { const box = document.getElementById(id); if (box) { box.className = 'alert'; box.textContent = error.message; } else toast(error.message); }
async function updateBooking(id, status) { await api(`/api/bookings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); render(); toast(`Booking ${status}.`); }
function pricePreview() { const venue = state.venues.find(item => item.id === state.selectedVenue); const type = document.getElementById('booking-type')?.value; const guests = Number(document.getElementById('booking-guests')?.value || 1); const offer = venue?.offers.find(item => item.type === type); if (!offer) return; document.getElementById('price-value').textContent = peso(type === 'table' ? offer.price : offer.price * Math.max(1, guests)); document.getElementById('price-rule').textContent = type === 'table' ? 'Per table' : `${Math.max(1, guests)} guest${guests === 1 ? '' : 's'}`; }

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  event.preventDefault(); const action = button.dataset.action;
  try {
    if (action === 'toggle-theme') { setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); }
    else if (['auth-login', 'auth-signup', 'auth-admin-setup'].includes(action)) { state.authMode = action === 'auth-login' ? 'login' : action === 'auth-signup' ? 'signup' : 'admin-setup'; render(); }
    else if (action === 'guest') { state.guest = true; go('browse'); }
    else if (action === 'show-auth' || action === 'reserve-auth') { state.afterAuth = state.view === 'venue' ? 'venue' : null; if (action === 'reserve-auth') state.authMode = 'signup'; go('auth'); }
    else if (action === 'admin-book-info') { toast('Use a customer account to make a booking request.'); }
    else if (action === 'home' || action === 'browse') { if (!state.user && !state.guest) state.guest = true; go('browse'); }
    else if (action === 'bookings') { go('bookings'); }
    else if (action === 'admin') { state.adminTab = 'overview'; go('admin'); }
    else if (action === 'venue') { state.selectedVenue = button.dataset.id; go('venue'); }
    else if (action === 'area') {
      state.area = button.dataset.area; state.surpriseId = null;
      document.querySelectorAll('[data-action="area"]').forEach(tab => { const active = tab.dataset.area === state.area; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
      updateVenueGrid();
    }
    else if (action === 'saved-only') {
      state.savedOnly = !state.savedOnly; state.surpriseId = null;
      button.classList.toggle('active', state.savedOnly); button.setAttribute('aria-pressed', String(state.savedOnly));
      updateVenueGrid();
    }
    else if (action === 'save-venue') {
      const id = button.dataset.id;
      if (state.savedIds.has(id)) state.savedIds.delete(id); else state.savedIds.add(id);
      try { localStorage.setItem(savedKey, JSON.stringify([...state.savedIds])); } catch { /* Keep the choice for this visit. */ }
      if (state.savedOnly) updateVenueGrid();
      updateSavedControls();
      toast(state.savedIds.has(id) ? 'Added to your saved venues.' : 'Removed from saved venues.');
    }
    else if (action === 'surprise') {
      const choices = filteredVenues();
      if (!choices.length) { toast('No venues match your filters. Try another area or clear your search.'); return; }
      const alternatives = choices.length > 1 ? choices.filter(venue => venue.id !== state.surpriseId) : choices;
      const chosen = alternatives[Math.floor(Math.random() * alternatives.length)];
      state.surpriseId = chosen.id; updateVenueGrid();
      const card = [...document.querySelectorAll('[data-venue-id]')].find(item => item.dataset.venueId === chosen.id);
      card?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      toast(`Tonight's pick: ${chosen.name}. View the venue for details.`);
    }
    else if (action === 'admin-tab') { state.adminTab = button.dataset.tab; state.editVenue = null; render(); }
    else if (action === 'new-venue') { state.adminTab = 'venues'; state.editVenue = null; render(); document.getElementById('venue-form-panel')?.scrollIntoView({ behavior: 'smooth' }); }
    else if (action === 'edit-venue') { state.editVenue = button.dataset.id; render(); document.getElementById('venue-form-panel')?.scrollIntoView({ behavior: 'smooth' }); }
    else if (action === 'logout') { await api('/api/logout', { method: 'POST', body: '{}' }); state.user = null; state.guest = false; state.authMode = 'login'; go('auth'); }
    else if (action === 'booking-status') { await updateBooking(button.dataset.id, button.dataset.status); }
    else if (action === 'toggle-venue') { const venue = state.adminVenues.find(item => item.id === button.dataset.id); await api(`/api/admin/venues/${encodeURIComponent(venue.id)}`, { method: 'PATCH', body: JSON.stringify({ ...venue, active: !venue.active }) }); await refresh(); render(); toast(`Venue ${venue.active ? 'hidden' : 'shown'}.`); }
    else if (action === 'toggle-user') { const user = state.users.find(item => item.id === button.dataset.id); await api(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) }); await refresh(); render(); toast(`User ${user.active ? 'disabled' : 'enabled'}.`); }
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'venue-search') { state.search = event.target.value; state.surpriseId = null; updateVenueGrid(); }
  if (['booking-type', 'booking-guests'].includes(event.target.id)) pricePreview();
});
document.addEventListener('change', event => {
  if (event.target.id === 'booking-type') pricePreview();
  if (event.target.id === 'remove-photo') {
    if (event.target.checked) {
      document.getElementById('venue-image').value = '';
      document.getElementById('photo-preview').innerHTML = '<span>Picture will be removed</span>';
    } else {
      const venue = state.adminVenues.find(item => item.id === state.editVenue);
      document.getElementById('photo-preview').innerHTML = venue?.imagePath ? `<img src="${esc(venue.imagePath)}" alt="Current listing picture">` : '<span>Picture preview</span>';
    }
  }
  if (event.target.id === 'venue-image') {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = '';
      toast('Choose a JPG, PNG, or WebP picture up to 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('photo-preview').innerHTML = `<img src="${reader.result}" alt="New listing picture preview">`; };
    reader.readAsDataURL(file);
    if (document.getElementById('remove-photo')) document.getElementById('remove-photo').checked = false;
    const form = event.target.form;
    form.elements.photoCredit.value = 'Venue supplied photo';
    form.elements.photoCreditUrl.value = '';
  }
});
document.addEventListener('submit', async event => {
  const form = event.target; if (!['auth-form', 'booking-form', 'venue-form'].includes(form.id)) return;
  event.preventDefault(); const values = new FormData(form);
  try {
    if (form.id === 'auth-form') {
      const signup = state.authMode === 'signup';
      const setup = state.authMode === 'admin-setup' && state.setupAvailable;
      const payload = { email: values.get('email'), password: values.get('password') };
      if (signup || setup) payload.name = values.get('name');
      const result = await api(setup ? '/api/admin/setup' : signup ? '/api/signup' : '/api/login', { method: 'POST', body: JSON.stringify(payload) });
      state.user = result.user; state.guest = false; if (setup) state.setupAvailable = false; await refresh(); go(state.user.role === 'admin' ? 'admin' : state.afterAuth || 'browse'); state.afterAuth = null;
    } else if (form.id === 'booking-form') {
      if (!state.user) { state.authMode = 'signup'; go('auth'); toast('Create an account or sign in to request a booking.'); return; }
      const payload = { venueId: state.selectedVenue, date: values.get('date'), type: values.get('type'), guests: Number(values.get('guests')), note: values.get('note') };
      const result = await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
      await refresh(); go('bookings'); toast(`Request sent: ${result.booking.reference}.`);
    } else {
      const offers = ['entrance', 'seat', 'table'].filter(type => values.has(`offer-${type}`)).map(type => ({ type, price: Number(values.get(`price-${type}`)), capacity: Number(values.get(`capacity-${type}`)) }));
      if (values.has('partner') && !offers.length) throw new Error('Choose at least one booking option, or turn off booking partner for now.');
      const existing = state.adminVenues.find(item => item.id === state.editVenue);
      const imageFile = values.get('image');
      const saveButton = form.querySelector('[type="submit"]');
      saveButton.disabled = true; saveButton.textContent = 'Saving…';
      let imagePath = values.has('removePhoto') ? '' : existing?.imagePath || '';
      try {
        if (imageFile?.size) imagePath = await uploadImage(imageFile);
        const payload = { name: values.get('name'), area: values.get('area'), address: values.get('address'), vibe: values.get('vibe'), hours: values.get('hours'), accent: values.get('accent'), summary: values.get('summary'), sourceUrl: values.get('sourceUrl'), photoCredit: values.get('photoCredit'), photoCreditUrl: values.get('photoCreditUrl'), imagePath, partner: values.has('partner'), active: values.has('active'), offers };
        await api(state.editVenue ? `/api/admin/venues/${encodeURIComponent(state.editVenue)}` : '/api/admin/venues', { method: state.editVenue ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      } finally { saveButton.disabled = false; saveButton.textContent = existing ? 'Save changes' : 'Add club or business'; }
      state.editVenue = null; await refresh(); render(); toast('Venue saved.');
    }
  } catch (error) { if (form.id === 'auth-form') showError('auth-error', error); else toast(error.message); }
});

(async () => {
  try { const result = await api('/api/me'); state.user = result.user; state.setupAvailable = result.setupAvailable; if (state.setupAvailable && !state.user) state.authMode = 'admin-setup'; await refresh(); state.view = state.user?.role === 'admin' ? 'admin' : state.user ? 'browse' : 'auth'; render(); }
  catch (error) { app.innerHTML = `<div class="loading-screen"><span class="brand-mark">✦</span><p>The local server could not load the app. Try refreshing the page.</p></div>`; console.error(error); }
})();
