import React, { useMemo, useState } from 'react';
import { api } from './api.js';
import { Calendar, manilaToday, peso, Status, typeName } from './shared.jsx';
import { ReservationForm } from './Venue.jsx';

export function ReservationRows({ reservations, admin = false, venues, onChanged, onNotice }) {
  const [editing, setEditing] = useState('');
  const [busy, setBusy] = useState('');
  async function change(id, action, status) {
    setBusy(id);
    try {
      await api(admin ? `/api/admin/reservations/${id}/status` : `/api/reservations/${id}/cancel`, { method: admin ? 'PATCH' : 'POST', body: JSON.stringify(admin ? { status } : {}) });
      onNotice(admin ? `Reservation ${status}.` : 'Reservation cancelled.'); await onChanged();
    } catch (error) { onNotice(error.message); }
    finally { setBusy(''); }
  }
  if (!reservations.length) return <div className="empty">No reservations match this view.</div>;
  return <div className="data-list">{reservations.map(item => <React.Fragment key={item.id}><article className="data-row reservation-row"><div><Status value={item.status} /><h3>{item.venueName} · {typeName(item.type)}</h3><p>{item.reference} · {item.date} at {item.startTime || 'time not set'} · {item.guests} guest{item.guests === 1 ? '' : 's'} · {peso(item.total)}{admin ? ` · ${item.customerName}` : ''}</p>{item.note && <p>Note: {item.note}</p>}</div><div className="row-actions">{admin ? <>{item.status === 'pending' && <><button className="pill-btn small-btn" disabled={busy === item.id} onClick={() => change(item.id, 'status', 'approved')}>Approve</button><button className="danger-btn small-btn" disabled={busy === item.id} onClick={() => change(item.id, 'status', 'rejected')}>Reject</button></>}{item.status === 'approved' && <button className="pill-btn small-btn" disabled={busy === item.id} onClick={() => change(item.id, 'status', 'completed')}>Mark completed</button>}</> : <>{item.status === 'pending' && <button className="outline-btn small-btn" onClick={() => setEditing(editing === item.id ? '' : item.id)}>Edit</button>}{['pending', 'approved'].includes(item.status) && <button className="danger-btn small-btn" disabled={busy === item.id} onClick={() => change(item.id, 'cancel')}>Cancel</button>}</>}</div></article>
    {!admin && editing === item.id && <div className="panel edit-reservation"><h2>Edit reservation</h2><p className="field-note">You can change a request while it is Pending. Availability is checked again when you save.</p>{venues.find(venue => venue.id === item.venueId) ? <ReservationForm key={item.id} venue={venues.find(venue => venue.id === item.venueId)} initial={item} user={{ role: 'customer' }} onSaved={async message => { setEditing(''); onNotice(message); await onChanged(); }} onAuth={() => {}} /> : <p>This venue is no longer visible. Contact the admin about this request.</p>}</div>}</React.Fragment>)}</div>;
}

export default function Reservations({ reservations, venues, onRefresh, onNotice, onBack }) {
  const [mode, setMode] = useState('list');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState(manilaToday().slice(0, 7));
  const shown = useMemo(() => reservations.filter(item => (status === 'all' || item.status === status) && (!day || item.date === day) && `${item.reference} ${item.venueName} ${item.type}`.toLowerCase().includes(search.toLowerCase())), [reservations, status, day, search]);
  return <main className="shell dashboard"><button className="back-btn" onClick={onBack}>← Explore venues</button><div className="dash-top"><div><span className="eyebrow">Your plans</span><h1>My reservations</h1><p className="muted">Follow every request from Pending through its final status.</p></div><button className="pill-btn" onClick={onBack}>Find a venue →</button></div>
    <div className="dash-tabs"><button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>History</button><button className={mode === 'calendar' ? 'active' : ''} onClick={() => setMode('calendar')}>Calendar</button></div>
    {mode === 'calendar' && <Calendar reservations={reservations} month={month} setMonth={setMonth} onDay={date => { setDay(date); setMode('list'); }} />}
    <div className="reservation-filters"><input className="search" type="search" placeholder="Search venue or reference…" aria-label="Search reservations" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter reservation status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{['pending', 'approved', 'rejected', 'completed', 'cancelled'].map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>{day && <button className="outline-btn small-btn" onClick={() => setDay('')}>Clear date: {day} ×</button>}</div>
    <ReservationRows reservations={shown} venues={venues} onChanged={onRefresh} onNotice={onNotice} />
  </main>;
}
