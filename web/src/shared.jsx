import React from 'react';

export const peso = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value || 0);
export const typeName = type => ({ entrance: 'Entrance', seat: 'Seat', table: 'Table' })[type] || type;
export function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = key => parts.find(part => part.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const dateAfter = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const mapLink = address => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const initials = name => (name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export function Brand({ onHome }) {
  return <a href="#venues" className="brand" onClick={event => { event.preventDefault(); onHome(); }}><span className="brand-mark">✦</span><span>QC After Dark<small>Quezon City nightlife</small></span></a>;
}
export function Header({ user, theme, onTheme, onGo, onLogout }) {
  return <header className="shell topbar"><Brand onHome={() => onGo('browse')} /><nav className="top-actions">
    {user?.role === 'admin' && <button className="nav-link" onClick={() => onGo('admin')}>Dashboard</button>}
    <button className="nav-link" onClick={() => onGo('browse')}>Explore</button>
    {user?.role === 'customer' && <button className="nav-link" onClick={() => onGo('reservations')}>My reservations</button>}
    <button className="theme-toggle" onClick={onTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><span className="theme-icon" aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span><span className="theme-label">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span></button>
    {user ? <><span className="user-chip"><span className="avatar">{initials(user.name)}</span><span>{user.name.split(' ')[0]}</span></span><button className="text-btn" onClick={onLogout}>Log out</button></> : <button className="pill-btn small-btn" onClick={() => onGo('auth')}>Sign in</button>}
  </nav></header>;
}
export function Footer({ onHome }) { return <footer className="footer"><div className="shell footer-inner"><Brand onHome={onHome} /><span>Made for nights out in Quezon City · Reservations require venue confirmation.</span></div></footer>; }

export function VenueArt({ venue, detail = false }) {
  const artStyle = ['venue-club-hype', 'venue-corte-ibiza'].includes(venue.id) ? 'identity-art' : venue.id === 'venue-radius-katipunan' ? 'portrait-art' : '';
  return <div className={`venue-art ${detail ? 'detail-art' : ''} ${venue.imagePath ? 'has-photo' : ''} ${artStyle} ${venue.accent || 'violet'}`}>
    {venue.imagePath && <img className="venue-photo" src={venue.imagePath} alt={`${venue.name} venue`} loading={detail ? 'eager' : 'lazy'} />}
    <span className="venue-badge">{venue.partner ? 'Booking partner' : 'Discover venue'}</span>
    {venue.photoCredit && (venue.photoCreditUrl ? <a className="photo-credit" href={venue.photoCreditUrl} target="_blank" rel="noopener noreferrer">Photo: {venue.photoCredit} ↗</a> : <span className="photo-credit">Photo: {venue.photoCredit}</span>)}
  </div>;
}
export function SaveButton({ venue, saved, onToggle, detail = false }) {
  return <button type="button" className={`save-venue ${detail ? 'save-detail' : ''} ${saved ? 'is-saved' : ''}`} onClick={() => onToggle(venue.id)} aria-pressed={saved} aria-label={`${saved ? 'Remove' : 'Save'} ${venue.name} ${saved ? 'from' : 'to'} saved venues`} title={saved ? 'Remove from saved' : 'Save venue'}>{detail ? saved ? '♥ Saved' : '♡ Save venue' : saved ? '♥' : '♡'}</button>;
}
export function Status({ value }) { return <span className={`status ${value}`}>{value}</span>; }

export function Calendar({ reservations, month, setMonth, onDay }) {
  const [year, number] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const label = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, number - 1, 1)));
  const move = offset => setMonth(new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7));
  return <section className="calendar panel"><div className="calendar-head"><div><span className="eyebrow">Reservation calendar</span><h2>{label}</h2></div><div className="row-actions"><button className="outline-btn small-btn" onClick={() => move(-1)} aria-label="Previous month">←</button><button className="outline-btn small-btn" onClick={() => move(1)} aria-label="Next month">→</button></div></div>
    <div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <strong key={day} className="calendar-weekday">{day}</strong>)}
      {cells.map((day, index) => { const date = day ? `${month}-${String(day).padStart(2, '0')}` : ''; const bookings = reservations.filter(item => item.date === date);
        return day ? <button key={date} type="button" className={`calendar-day ${date === manilaToday() ? 'is-today' : ''} ${bookings.length ? 'has-booking' : ''}`} onClick={() => onDay(date)}><span>{day}</span>{bookings.slice(0, 2).map(item => <small key={item.id} className={`calendar-tag ${item.status}`}>{item.venueName}</small>)}{bookings.length > 2 && <small>+{bookings.length - 2} more</small>}</button> : <span className="calendar-day is-blank" key={`blank-${index}`} />; })}
    </div><p className="field-note">Select a day to see its reservations.</p></section>;
}
