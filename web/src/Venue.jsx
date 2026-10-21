import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { dateAfter, manilaToday, mapLink, peso, SaveButton, typeName, VenueArt } from './shared.jsx';

export function ReservationForm({ venue, initial, user, onSaved, onAuth }) {
  const [date, setDate] = useState(initial?.date || '');
  const [type, setType] = useState(initial?.type || venue.offers[0]?.type || '');
  const [startTime, setStartTime] = useState(initial?.startTime || '');
  const [guests, setGuests] = useState(initial?.guests || 1);
  const [note, setNote] = useState(initial?.note || '');
  const [availability, setAvailability] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const offer = venue.offers.find(item => item.type === type);
  useEffect(() => {
    if (!date || !type) { setAvailability(null); return; }
    let active = true;
    setAvailability(null); setError('');
    api(`/api/venues/${encodeURIComponent(venue.id)}/availability?date=${date}&type=${type}`).then(result => {
      if (active) setAvailability(result);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [venue.id, date, type]);
  const amount = offer ? offer.type === 'table' ? offer.price : offer.price * Math.max(1, Number(guests) || 1) : 0;
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!user || user.role !== 'customer') { onAuth(); return; }
    if (!startTime) { setError('Choose an available arrival time.'); return; }
    setBusy(true);
    try {
      await api(initial ? `/api/reservations/${encodeURIComponent(initial.id)}` : '/api/reservations', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify({ venueId: venue.id, date, type, startTime, guests: Number(guests), note }) });
      onSaved(initial ? 'Reservation updated.' : 'Reservation request sent.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="reservation-form"><div className="field"><label htmlFor="booking-date">Date</label><input id="booking-date" type="date" min={manilaToday()} max={dateAfter(manilaToday(), 90)} required value={date} onChange={event => { setDate(event.target.value); setStartTime(''); }} /></div>
    <div className="field"><label htmlFor="booking-type">Booking type</label><select id="booking-type" value={type} onChange={event => { setType(event.target.value); setStartTime(''); }}>{venue.offers.map(item => <option key={item.type} value={item.type}>{typeName(item.type)} · {peso(item.price)} {item.type === 'table' ? 'per table' : 'per guest'}</option>)}</select></div>
    <div className="field"><label>Arrival time</label><div className="slot-list" role="group" aria-label="Available arrival times">{!date ? <span className="field-note">Choose a date to see times.</span> : !availability ? <span className="field-note">Loading times…</span> : availability.slots.map(slot => {
      const ownSlot = initial && initial.date === date && initial.type === type && initial.startTime === slot.time;
      const available = slot.remaining + (ownSlot ? Number(initial.guests) : 0) >= Number(guests);
      return <button key={slot.time} type="button" className={`slot-pill ${startTime === slot.time ? 'selected' : ''}`} disabled={!available} aria-pressed={startTime === slot.time} onClick={() => setStartTime(slot.time)}><strong>{slot.time}</strong><small>{ownSlot ? 'Your current slot' : available ? `${slot.remaining} spaces left` : 'Full'}</small></button>;
    })}</div><p className="field-note">Times are in Philippine time. Each option has a fixed duration and guest capacity.</p></div>
    <div className="field"><label htmlFor="booking-guests">Number of guests</label><input id="booking-guests" type="number" min="1" max="30" required value={guests} onChange={event => setGuests(event.target.value)} /></div>
    <div className="field"><label htmlFor="booking-note">Special request <span className="muted">(optional)</span></label><textarea id="booking-note" maxLength="300" value={note} onChange={event => setNote(event.target.value)} placeholder="Anything the venue should know?" /></div>
    <div className="price-preview"><span>Estimated amount<small>{offer?.type === 'table' ? 'Per table' : 'For your group'}</small></span><strong>{peso(amount)}</strong></div>
    {error && <div className="alert" role="alert">{error}</div>}
    <button className="primary-btn full" disabled={busy || user?.role === 'admin'}>{busy ? 'Please wait…' : initial ? 'Save reservation changes →' : user?.role === 'admin' ? 'Customer account required' : user ? 'Send reservation request →' : 'Sign in to request →'}</button><p className="booking-note">No payment is taken here. Your request stays Pending until an admin approves it.</p>
  </form>;
}

export default function Venue({ venue, user, saved, onSave, onBack, onAuth, onReserved }) {
  if (!venue) return <main className="shell dashboard"><p>Venue unavailable.</p><button className="outline-btn" onClick={onBack}>Back to venues</button></main>;
  return <main><div className="shell"><div className="page-header"><button className="back-btn" onClick={onBack}>← Back to venues</button><span className="eyebrow">{venue.area} / {venue.vibe}</span><h1>{venue.name}</h1><p>{venue.address}</p><div className="venue-quicklinks"><SaveButton venue={venue} saved={saved} onToggle={onSave} detail /><a className="outline-btn small-btn" href={mapLink(venue.address)} target="_blank" rel="noopener noreferrer">View map ↗</a>{venue.sourceUrl && <a className="outline-btn small-btn" href={venue.sourceUrl} target="_blank" rel="noopener noreferrer">Venue info ↗</a>}</div></div>
    <div className="detail-grid"><div><VenueArt venue={venue} detail /><div className="detail-summary"><span className="eyebrow">About the venue</span><h2>Your night starts here.</h2><p>{venue.summary}</p><div className="detail-facts"><div className="fact"><span>Neighborhood</span><strong>{venue.area}, Quezon City</strong></div><div className="fact"><span>Hours</span><strong>{venue.hours}</strong></div><div className="fact"><span>Booking choices</span><strong>{venue.partner ? venue.offers.map(item => typeName(item.type)).join(' · ') : 'Not available in app yet'}</strong></div><div className="fact"><span>Location</span><strong>{venue.address}</strong></div></div></div></div>
      {venue.partner && venue.offers.length ? <aside className="booking-panel"><span className="eyebrow">Save your spot</span><h2>Request a reservation</h2><p>Choose a date, arrival time, and booking type. An admin will review your request.</p><ReservationForm key={venue.id} venue={venue} user={user} onAuth={onAuth} onSaved={onReserved} /></aside> : <aside className="booking-panel"><span className="eyebrow">Discovery listing</span><h2>Bookings coming soon.</h2><p>{venue.name} has not been set up as a booking partner on QC After Dark. This site cannot reserve entrance, seats, or tables here yet.</p><div className="demo-notice"><strong>✦</strong><span>Contact the venue directly for current hours, prices, and reservations.</span></div></aside>}
    </div></div></main>;
}
