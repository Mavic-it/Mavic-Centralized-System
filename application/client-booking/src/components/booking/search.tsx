'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Users, MapPin, DoorOpen } from 'lucide-react';
import { SpaceVisual } from './space-visual';
import { api } from '@/lib/api';
import type { Branch, Space } from '@/types/booking';
import { useBooking } from './provider';
import { Field, Skeleton } from '../ui';
export function SpaceSearch() {
  const router = useRouter(), { choose } = useBooking();
  const [branches, setBranches] = useState<Branch[]>([]), [spaces, setSpaces] = useState<Space[]>([]);
  const [branch, setBranch] = useState(''), [type, setType] = useState('ALL');
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; api.branches().then(data => { if (active) { setBranches(data); setBranch(current => current || data[0]?.id || ''); if (!data.length) setBusy(false); } }).catch(e => { if (active) { setError(e.message); setBusy(false); } }); return () => { active = false; }; }, [retry]);
  useEffect(() => { if (!branch) return; let active = true;
    api.spaces(branch).then(data => { if (active) { setSpaces(data); setBusy(false); } }).catch(e => { if (active) { setError(e.message); setBusy(false); } }); return () => { active = false; }; }, [branch,retry]);
  const filtered = spaces.filter(s => type === 'ALL' || (type === 'MEETING' ? s.type !== 'COWORKING_DESK' : s.type === 'COWORKING_DESK'));
  return <><div className="search-bar"><Field label="Choose a branch"><select value={branch} onChange={e => { setBranch(e.target.value); setBusy(true); setError(''); }} disabled={!branches.length}>{!branches.length && <option value="">Select a branch</option>}{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><div className="type-tabs" role="group" aria-label="Space type">{[['ALL','All spaces'],['MEETING','Meeting rooms'],['COWORKING','Coworking']].map(([value,label]) => <button type="button" key={value} aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>)}</div></div>
  {error ? <div className="notice" role="alert"><p>{error}</p><button onClick={() => { setError(''); setBusy(true); setRetry(v => v+1); }}>Try again</button></div> : busy ? <Skeleton /> : !filtered.length ? <div className="panel empty"><DoorOpen size={32} aria-hidden="true" /><h3>No public spaces available here yet</h3><p>Try another branch or space type. The branch team can help with other reservation options.</p></div> : <><p className="result-count">{filtered.length} {filtered.length === 1 ? 'space' : 'spaces'} to make your own</p><div className="space-grid">{filtered.map((space,index) => <article className="space-card" key={space.id}><SpaceVisual space={space} index={index} /><div className="space-content"><p className="eyebrow">{space.type === 'COWORKING_DESK' ? 'COWORKING' : 'MEETING ROOM'}</p><h3>{space.name}</h3><p className="space-meta"><MapPin size={15} aria-hidden="true" />{space.branchName}<span>·</span><Users size={15} aria-hidden="true" />Up to {space.capacity}</p>{space.description && <p className="description">{space.description}</p>}<div className="amenities">{space.amenities.slice(0,4).map(a => <span key={a}>{a}</span>)}</div><button type="button" className="space-action" aria-label={`Check availability for ${space.name} at ${space.branchName}`} onClick={() => { choose(space); router.push('/book'); }}>Check availability <ArrowUpRight size={19} aria-hidden="true" /></button></div></article>)}</div></> }</>;
}
