import React, { useMemo, useState } from 'react';
import { peso, SaveButton, VenueArt } from './shared.jsx';

function VenueCard({ venue, saved, onSave, onSelect, picked }) {
  const prices = venue.offers?.map(offer => offer.price) || [];
  return <article className={`venue-card ${picked ? 'is-picked' : ''}`} id={`card-${venue.id}`}><VenueArt venue={venue} /><SaveButton venue={venue} saved={saved} onToggle={onSave} /><div className="venue-body"><div className="venue-meta"><span>{venue.area}</span><span>{venue.vibe}</span></div><h3>{venue.name}</h3><p>{venue.summary}</p><div className="venue-bottom"><div><small>{venue.partner && prices.length ? 'Booking options from' : 'In-app booking'}</small><strong>{venue.partner && prices.length ? peso(Math.min(...prices)) : 'Coming soon'}</strong></div><button className="outline-btn small-btn" onClick={() => onSelect(venue.id)}>View venue →</button></div></div></article>;
}

export default function Browse({ venues, user, saved, onSave, onSelect, onAuth, onNotice }) {
  const [area, setArea] = useState('All');
  const [search, setSearch] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [picked, setPicked] = useState('');
  const visible = useMemo(() => venues.filter(venue => (area === 'All' || venue.area === area) && (!savedOnly || saved.has(venue.id)) && `${venue.name} ${venue.vibe} ${venue.area}`.toLowerCase().includes(search.toLowerCase())), [venues, area, search, savedOnly, saved]);
  const savedCount = venues.filter(venue => saved.has(venue.id)).length;
  function pickSpot() {
    if (!visible.length) { onNotice('No venues match your filters. Try another area or clear your search.'); return; }
    const choices = visible.length > 1 ? visible.filter(venue => venue.id !== picked) : visible;
    const choice = choices[Math.floor(Math.random() * choices.length)];
    setPicked(choice.id); onNotice(`Tonight's pick: ${choice.name}. View the venue for details.`);
    requestAnimationFrame(() => document.getElementById(`card-${choice.id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }));
  }
  return <main><section className="hero"><div className="shell hero-content"><div className="hero-copy"><span className="eyebrow">Your city, after hours</span><h1>Where will the <em>night</em> take you?</h1><p>Explore nightlife spots in Katipunan, Timog, and Tomas Morato. Request entrance, seats, or tables at booking partners.</p><div className="hero-cta"><a href="#venues" className="primary-btn">Explore venues ↓</a><button className="outline-btn surprise-btn" onClick={pickSpot}>✦ Pick my spot</button>{!user && <button className="hero-account-link" onClick={onAuth}>Create an account →</button>}</div><div className="hero-mini"><div><strong>03</strong><span>QC districts</span></div><div><strong>03</strong><span>Ways to book</span></div><div><strong>{String(venues.length).padStart(2, '0')}</strong><span>Places to explore</span></div></div></div><div className="hero-stage" aria-hidden="true"><div className="stage-halo" /><div className="stage-photo stage-photo-back"><img src="/assets/akai-1108.jpg" alt="" /></div><div className="stage-photo stage-photo-front"><img src="/assets/urbn-qc-interior.jpg" alt="" /></div><div className="stage-caption"><span className="stage-dot" /> Quezon City after dark</div></div></div></section>
    <section className="section shell" id="venues"><div className="section-heading"><div><span className="eyebrow">The directory</span><h2>Find your scene</h2></div><p>Browse Quezon City venues. Arrival slots and prices appear after an admin sets up a booking partner.</p></div><div className="demo-notice"><strong>✦</strong><span>Discovery listings do not mean a venue is partnered with this website. Check directly with the venue for current details.</span></div>
      <div className="filter-bar"><div className="filter-tabs">{['All', 'Katipunan', 'Timog', 'Tomas Morato'].map(item => <button key={item} className={area === item ? 'active' : ''} aria-pressed={area === item} onClick={() => { setArea(item); setPicked(''); }}>{item === 'All' ? 'All areas' : item}</button>)}</div><input className="search" type="search" value={search} onChange={event => { setSearch(event.target.value); setPicked(''); }} placeholder="Search a venue or vibe…" aria-label="Search venues" /></div>
      <div className="directory-tools"><span aria-live="polite">{visible.length} {visible.length === 1 ? 'venue' : 'venues'} shown</span><button className={`saved-filter ${savedOnly ? 'active' : ''}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>♡ Saved ({savedCount})</button><small>Saved venues stay on this browser.</small></div>
      <div className="venue-grid">{visible.length ? visible.map(venue => <VenueCard key={venue.id} venue={venue} saved={saved.has(venue.id)} onSave={onSave} onSelect={onSelect} picked={picked === venue.id} />) : <div className="empty">{savedOnly && !savedCount ? 'Save venues with the heart button to make your shortlist.' : 'No venues match these filters.'}</div>}</div>
    </section></main>;
}
