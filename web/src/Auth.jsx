import React, { useState } from 'react';
import { api } from './api.js';
import { Brand } from './shared.jsx';

export default function Auth({ setupAvailable, setupTokenRequired, theme, onTheme, onAuth, onGuest, notice }) {
  const [mode, setMode] = useState(setupAvailable ? 'setup' : 'login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup', setup = mode === 'setup' && setupAvailable;
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const values = new FormData(event.currentTarget);
    const payload = { email: values.get('email'), password: values.get('password') };
    if (signup || setup) payload.name = values.get('name');
    if (setup && setupTokenRequired) payload.setupToken = values.get('setupToken');
    try {
      const result = await api(setup ? '/api/admin/setup' : signup ? '/api/signup' : '/api/login', { method: 'POST', body: JSON.stringify(payload) });
      onAuth(result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout"><section className="auth-art"><Brand onHome={onGuest} /><div className="auth-copy"><span className="eyebrow">Quezon City nights, made easy</span><h1>Find your <em>next night</em> out.</h1><p>Explore bars and clubs around Katipunan, Timog, and Tomas Morato. Request entrance, seats, or tables at partner venues.</p></div><div className="auth-foot"><span>01 — Discover</span><span>02 — Request</span><span>03 — Get confirmed</span></div></section>
    <section className="auth-panel"><div className="auth-theme"><button className="theme-toggle" onClick={onTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><span className="theme-icon">{theme === 'light' ? '☾' : '☀'}</span><span className="theme-label">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span></button></div><div className="auth-card"><span className="eyebrow">Welcome to QC After Dark</span><h2>{setup ? 'Set up your site.' : signup ? 'Join the night.' : 'Good to see you.'}</h2><p>{setup ? 'Create the first admin account to manage venues, arrival slots, and reservations.' : signup ? 'Create a customer account to request reservations and track them.' : 'Sign in to plan your next night. Admins use this same sign-in.'}</p>
      <div className="tabs"><button className={!signup && !setup ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={signup ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>{setupAvailable && <button className={setup ? 'active' : ''} onClick={() => { setMode('setup'); setError(''); }}>Set up admin</button>}</div>
      <form onSubmit={submit}>{(signup || setup) && <div className="field"><label htmlFor="auth-name">Full name</label><input id="auth-name" name="name" required autoComplete="name" placeholder="Your name" /></div>}
        <div className="field"><label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></div>
        <div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" required minLength={signup || setup ? 8 : 1} autoComplete={signup || setup ? 'new-password' : 'current-password'} placeholder={signup || setup ? 'At least 8 characters' : 'Your password'} /></div>
        {setup && setupTokenRequired && <div className="field"><label htmlFor="setup-token">Admin setup code</label><input id="setup-token" name="setupToken" required type="password" placeholder="From your Render environment settings" /></div>}
        {error && <div className="alert" role="alert">{error}</div>}{notice && <div className="alert">{notice}</div>}
        <button className="primary-btn full" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create admin account →' : signup ? 'Create account →' : 'Sign in →'}</button>
      </form><div className="divider">or</div><button className="outline-btn full" onClick={onGuest}>Explore as guest</button><p className="fineprint">Guests can browse venues. Create an account to make a reservation request.</p>
    </div></section></main>;
}
