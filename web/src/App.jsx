import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Footer, Header } from './shared.jsx';
import Auth from './Auth.jsx';
import Browse from './Browse.jsx';
import Venue from './Venue.jsx';
import Reservations from './Reservations.jsx';
import Admin from './Admin.jsx';

const savedKey = 'qc-after-dark-saved-venues';
function storedSaved() {
  try { const items = JSON.parse(localStorage.getItem(savedKey) || '[]'); return new Set(Array.isArray(items) ? items.filter(id => typeof id === 'string') : []); }
  catch { return new Set(); }
}
export default function App() {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [user, setUser] = useState(null);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [setupTokenRequired, setSetupTokenRequired] = useState(false);
  const [view, setView] = useState('auth');
  const [venues, setVenues] = useState([]);
  const [adminVenues, setAdminVenues] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [saved, setSaved] = useState(storedSaved);
  const [notice, setNotice] = useState('');
  async function refresh(currentUser = user) {
    const [venueResult, reservationResult, adminVenueResult, userResult] = await Promise.all([
      api('/api/venues'), currentUser ? api('/api/reservations') : Promise.resolve({ reservations: [] }),
      currentUser?.role === 'admin' ? api('/api/admin/venues') : Promise.resolve({ venues: [] }),
      currentUser?.role === 'admin' ? api('/api/admin/users') : Promise.resolve({ users: [] })
    ]);
    setVenues(venueResult.venues); setReservations(reservationResult.reservations); setAdminVenues(adminVenueResult.venues); setUsers(userResult.users);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api('/api/me');
        if (!active) return;
        setUser(result.user); setSetupAvailable(result.setupAvailable); setSetupTokenRequired(result.setupTokenRequired);
        await refresh(result.user);
        if (active) { setView(result.user?.role === 'admin' ? 'admin' : result.user ? 'browse' : 'auth'); setReady(true); }
      } catch (error) { if (active) { setStartupError(error.message); setReady(true); } }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout); }, [notice]);
  function go(next) { setView(next); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); document.documentElement.dataset.theme = next;
    try { localStorage.setItem('qc-after-dark-theme', next); } catch { /* Keep this visit's choice. */ }
    document.cookie = `qc_theme=${next}; Max-Age=31536000; SameSite=Lax; Path=/`;
    document.querySelector('meta[name="theme-color"]').content = next === 'light' ? '#f7f5fb' : '#030307';
  }
  function toggleSaved(id) {
    setSaved(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); try { localStorage.setItem(savedKey, JSON.stringify([...next])); } catch { /* Keep this visit's choice. */ } return next; });
  }
  async function authenticated(nextUser) {
    setUser(nextUser); setSetupAvailable(false); await refresh(nextUser); go(nextUser.role === 'admin' ? 'admin' : 'browse'); setNotice('Signed in successfully.');
  }
  async function logout() {
    try { await api('/api/logout', { method: 'POST', body: '{}' }); setUser(null); setReservations([]); setAdminVenues([]); setUsers([]); go('auth'); }
    catch (error) { setNotice(error.message); }
  }
  function selectVenue(id) { setSelectedId(id); go('venue'); }
  async function reserved(message) { setNotice(message); await refresh(); go('reservations'); }
  if (!ready) return <div className="loading-screen"><span className="brand-mark">✦</span><p>Opening QC After Dark…</p></div>;
  if (startupError) return <div className="loading-screen"><span className="brand-mark">✦</span><p>Could not load the local server: {startupError}</p><button className="outline-btn" onClick={() => location.reload()}>Try again</button></div>;
  if (view === 'auth') return <Auth setupAvailable={setupAvailable} setupTokenRequired={setupTokenRequired} theme={theme} onTheme={toggleTheme} onAuth={authenticated} onGuest={() => go('browse')} />;
  return <><Header user={user} theme={theme} onTheme={toggleTheme} onGo={go} onLogout={logout} />
    {view === 'browse' && <Browse venues={venues} user={user} saved={saved} onSave={toggleSaved} onSelect={selectVenue} onAuth={() => go('auth')} onNotice={setNotice} />}
    {view === 'venue' && <Venue venue={venues.find(item => item.id === selectedId)} user={user} saved={saved.has(selectedId)} onSave={toggleSaved} onBack={() => go('browse')} onAuth={() => go('auth')} onReserved={reserved} />}
    {view === 'reservations' && <Reservations reservations={reservations} venues={venues} onRefresh={() => refresh()} onNotice={setNotice} onBack={() => go('browse')} />}
    {view === 'admin' && user?.role === 'admin' && <Admin reservations={reservations} venues={adminVenues} users={users} onRefresh={() => refresh()} onNotice={setNotice} />}
    <Footer onHome={() => go('browse')} />{notice && <div className="toast" role="status">{notice}</div>}
  </>;
}
