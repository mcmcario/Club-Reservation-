import React, { useEffect, useMemo, useState } from 'react';
import { api, uploadPicture } from './api.js';
import { Calendar, manilaToday, Status, typeName } from './shared.jsx';
import { ReservationRows } from './Reservations.jsx';

const bookingTypes = ['entrance', 'seat', 'table'];
const emptyOffer = () => ({ enabled: false, price: '', capacity: '', durationMinutes: 120, startTimes: '' });
function VenueEditor({ venue, onClose, onSaved }) {
  const [form, setForm] = useState({ name: venue?.name || '', area: venue?.area || '', address: venue?.address || '', summary: venue?.summary || '', vibe: venue?.vibe || '', hours: venue?.hours || '', accent: venue?.accent || 'violet', sourceUrl: venue?.sourceUrl || '', photoCredit: venue?.photoCredit || '', photoCreditUrl: venue?.photoCreditUrl || '', imagePath: venue?.imagePath || '', partner: venue?.partner || false, active: venue?.active !== false });
  const [offers, setOffers] = useState(Object.fromEntries(bookingTypes.map(type => { const old = venue?.offers.find(item => item.type === type); return [type, old ? { enabled: true, price: old.price, capacity: old.capacity, durationMinutes: old.durationMinutes, startTimes: old.startTimes.join(', ') } : emptyOffer()]; })));
  const [picture, setPicture] = useState(null);
  const [preview, setPreview] = useState(venue?.imagePath || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(old => ({ ...old, [key]: value }));
  function choosePicture(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP picture up to 5 MB.'); return; }
    setPicture(file); setError('');
    setForm(old => ({ ...old, photoCredit: 'Venue supplied photo', photoCreditUrl: '' }));
    const reader = new FileReader(); reader.onload = () => setPreview(reader.result); reader.readAsDataURL(file);
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const chosen = bookingTypes.filter(type => offers[type].enabled).map(type => ({ type, price: Number(offers[type].price), capacity: Number(offers[type].capacity), durationMinutes: Number(offers[type].durationMinutes), startTimes: offers[type].startTimes.split(',').map(time => time.trim()).filter(Boolean) }));
      if (form.partner && !chosen.length) throw new Error('Choose at least one booking option with arrival times.');
      let imagePath = form.imagePath;
      if (picture) imagePath = (await uploadPicture(picture)).imagePath;
      const payload = { ...form, imagePath, offers: chosen };
      await api(venue ? `/api/admin/venues/${encodeURIComponent(venue.id)}` : '/api/admin/venues', { method: venue ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      onSaved(venue ? 'Venue updated.' : 'Club or business added.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="panel venue-editor" id="venue-form-panel"><span className="eyebrow">Partner directory</span><h2>{venue ? `Edit ${venue.name}` : 'Add club or business'}</h2><p className="field-note editor-intro">Enter what guests will see. Save a discovery listing first, then enable reservations when the venue confirms arrival times, prices, and capacity.</p><form onSubmit={submit}>
    <div className="form-grid"><div className="field"><label>Venue name</label><input required maxLength="80" value={form.name} onChange={event => set('name', event.target.value)} /></div><div className="field"><label>Area</label><select required value={form.area} onChange={event => set('area', event.target.value)}><option value="">Choose area</option>{['Katipunan', 'Timog', 'Tomas Morato'].map(item => <option key={item}>{item}</option>)}</select></div><div className="field"><label>Address</label><input required maxLength="160" value={form.address} onChange={event => set('address', event.target.value)} /></div><div className="field"><label>Vibe / category</label><input required maxLength="40" value={form.vibe} onChange={event => set('vibe', event.target.value)} placeholder="Cocktail bar, Dance club…" /></div><div className="field"><label>Opening hours</label><input required maxLength="60" value={form.hours} onChange={event => set('hours', event.target.value)} placeholder="Check with venue" /></div><div className="field"><label>Card color</label><select value={form.accent} onChange={event => set('accent', event.target.value)}>{['violet', 'rose', 'amber', 'blue'].map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></div></div>
    <div className="field"><label>Description</label><textarea required maxLength="300" value={form.summary} onChange={event => set('summary', event.target.value)} /></div><div className="field"><label>Official website or social page <span className="muted">(optional)</span></label><input type="url" value={form.sourceUrl} onChange={event => set('sourceUrl', event.target.value)} placeholder="https://www.instagram.com/yourvenue/" /></div>
    <div className="venue-photo-editor"><div><span className="eyebrow">Listing picture</span><p className="field-note">Upload a landscape photo for the guest card. JPG, PNG, or WebP, up to 5 MB. A 16:9 image works best.</p><div className="field"><label htmlFor="venue-image">Choose picture</label><input id="venue-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => choosePicture(event.target.files[0])} /></div>{preview && <button type="button" className="outline-btn small-btn" onClick={() => { setPicture(null); setPreview(''); set('imagePath', ''); }}>Remove picture</button>}<div className="field"><label>Photo credit <span className="muted">(optional)</span></label><input maxLength="100" value={form.photoCredit} onChange={event => set('photoCredit', event.target.value)} placeholder="Venue supplied photo" /></div><div className="field"><label>Photo source link <span className="muted">(optional)</span></label><input type="url" value={form.photoCreditUrl} onChange={event => set('photoCreditUrl', event.target.value)} /></div></div><div className="photo-preview">{preview ? <img src={preview} alt="Listing picture preview" /> : <span>Picture preview</span>}</div></div>
    <label className="checkbox-line"><input type="checkbox" checked={form.partner} onChange={event => set('partner', event.target.checked)} /> Booking partner · allow in-app reservation requests</label><span className="eyebrow">Booking options and arrival slots</span><p className="field-note" style={{ margin: '8px 0 16px' }}>Capacity is the total guests allowed in overlapping reservations for this option. Enter arrival times separated by commas, such as 20:00, 21:00, 22:00. Duration is in minutes.</p>
    <div className="offer-grid">{bookingTypes.map(type => <div className="offer-card" key={type}><label><input type="checkbox" checked={offers[type].enabled} onChange={event => setOffers(old => ({ ...old, [type]: { ...old[type], enabled: event.target.checked } }))} /> {typeName(type)}</label><div className="field"><label>Price (₱)</label><input type="number" min="0" max="1000000" value={offers[type].price} onChange={event => setOffers(old => ({ ...old, [type]: { ...old[type], price: event.target.value } }))} /></div><div className="field"><label>Guest capacity</label><input type="number" min="1" max="10000" value={offers[type].capacity} onChange={event => setOffers(old => ({ ...old, [type]: { ...old[type], capacity: event.target.value } }))} /></div><div className="field"><label>Duration (minutes)</label><input type="number" min="30" max="480" step="30" value={offers[type].durationMinutes} onChange={event => setOffers(old => ({ ...old, [type]: { ...old[type], durationMinutes: event.target.value } }))} /></div><div className="field"><label>Arrival times</label><input value={offers[type].startTimes} onChange={event => setOffers(old => ({ ...old, [type]: { ...old[type], startTimes: event.target.value } }))} placeholder="20:00, 21:00, 22:00" /></div></div>)}</div>
    <label className="checkbox-line"><input type="checkbox" checked={form.active} onChange={event => set('active', event.target.checked)} /> Visible in directory</label>{error && <div className="alert" role="alert">{error}</div>}<div className="row-actions" style={{ justifyContent: 'start' }}><button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : venue ? 'Save changes' : 'Add club or business'}</button><button type="button" className="outline-btn" onClick={onClose}>Cancel</button></div>
  </form></section>;
}

export default function Admin({ reservations, venues, users, onRefresh, onNotice }) {
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(undefined);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState(manilaToday().slice(0, 7));
  const shown = useMemo(() => reservations.filter(item => (status === 'all' || item.status === status) && (!day || item.date === day) && `${item.reference} ${item.venueName} ${item.customerName} ${item.customerEmail}`.toLowerCase().includes(search.toLowerCase())), [reservations, status, day, search]);
  useEffect(() => { if (tab === 'venues' && editing !== undefined) document.getElementById('venue-form-panel')?.scrollIntoView({ behavior: 'smooth' }); }, [tab, editing]);
  function openEditor(venue = null) { setEditing(venue); setTab('venues'); }
  async function toggleVenue(venue) {
    try { await api(`/api/admin/venues/${venue.id}`, { method: 'PATCH', body: JSON.stringify({ ...venue, active: !venue.active }) }); onNotice(`Venue ${venue.active ? 'hidden' : 'shown'}.`); await onRefresh(); }
    catch (error) { onNotice(error.message); }
  }
  async function toggleUser(user) {
    try { await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) }); onNotice(`Customer ${user.active ? 'disabled' : 'enabled'}.`); await onRefresh(); }
    catch (error) { onNotice(error.message); }
  }
  return <main className="shell dashboard"><div className="dash-top"><div><span className="eyebrow">Control room</span><h1>Admin dashboard</h1><p className="muted">Manage partner listings, arrival slots, reservation requests, and customers.</p></div><button className="pill-btn" onClick={() => openEditor(null)}>+ Add club or business</button></div>
    <div className="stat-grid"><div className="stat"><strong>{reservations.filter(item => item.status === 'pending').length}</strong><span>Pending requests</span></div><div className="stat"><strong>{venues.filter(item => item.active).length}</strong><span>Visible venues</span></div><div className="stat"><strong>{users.filter(item => item.role === 'customer').length}</strong><span>Customer accounts</span></div></div>
    <div className="dash-tabs">{[['overview', 'Overview'], ['reservations', 'Reservations'], ['calendar', 'Calendar'], ['venues', 'Venues'], ['users', 'Users']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setEditing(undefined); }}>{label}</button>)}</div>
    {tab === 'overview' && <><div className="section-heading"><div><span className="eyebrow">Needs attention</span><h2>Pending requests</h2></div><p>Approve or reject incoming reservations. Pending requests already hold capacity.</p></div><ReservationRows admin reservations={reservations.filter(item => item.status === 'pending')} venues={venues} onChanged={onRefresh} onNotice={onNotice} /></>}
    {tab === 'calendar' && <Calendar reservations={reservations} month={month} setMonth={setMonth} onDay={date => { setDay(date); setTab('reservations'); }} />}
    {tab === 'reservations' && <><div className="reservation-filters"><input className="search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, venue, or reference…" aria-label="Search reservations" /><select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter reservation status"><option value="all">All statuses</option>{['pending', 'approved', 'rejected', 'completed', 'cancelled'].map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>{day && <button className="outline-btn small-btn" onClick={() => setDay('')}>Clear date: {day} ×</button>}</div><ReservationRows admin reservations={shown} venues={venues} onChanged={onRefresh} onNotice={onNotice} /></>}
    {tab === 'venues' && <><div className="data-list">{venues.map(venue => <article className="data-row admin-venue-row" key={venue.id}><div className="admin-venue-main"><div className="admin-venue-thumb">{venue.imagePath ? <img src={venue.imagePath} alt="" /> : <span>✦</span>}</div><div><Status value={venue.active ? 'active' : 'disabled'} /><h3>{venue.name} · {venue.partner ? 'Booking partner' : 'Discovery only'}</h3><p>{venue.area} · {venue.address} · {venue.partner ? venue.offers.map(item => typeName(item.type)).join(', ') : 'No in-app bookings'}</p></div></div><div className="row-actions"><button className="outline-btn small-btn" onClick={() => openEditor(venue)}>Edit</button><button className={`${venue.active ? 'danger-btn' : 'pill-btn'} small-btn`} onClick={() => toggleVenue(venue)}>{venue.active ? 'Hide' : 'Show'}</button></div></article>)}</div>{editing !== undefined && <VenueEditor key={editing?.id || 'new'} venue={editing} onClose={() => setEditing(undefined)} onSaved={async message => { setEditing(undefined); onNotice(message); await onRefresh(); }} />}</>}
    {tab === 'users' && <div className="data-list">{users.map(user => <article className="data-row" key={user.id}><div><Status value={user.active ? 'active' : 'disabled'} /><h3>{user.name} {user.role === 'admin' ? '· Admin' : ''}</h3><p>{user.email} · Joined {String(user.createdAt).slice(0, 10)}</p></div><div className="row-actions">{user.role === 'customer' && <button className={`${user.active ? 'danger-btn' : 'pill-btn'} small-btn`} onClick={() => toggleUser(user)}>{user.active ? 'Disable' : 'Enable'}</button>}</div></article>)}</div>}
  </main>;
}
