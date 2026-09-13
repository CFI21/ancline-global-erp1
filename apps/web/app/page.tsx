'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type Health = { status?: string };
type Booking = {
  id: string;
  bookingNo?: string;
  status?: string;
  origin?: string;
  destination?: string;
  customer?: { name?: string } | null;
};

export default function Home() {
  const [health, setHealth] = useState<Health>({ status: 'checking' });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('ancline_token');
    if (!token) {
      window.location.replace('/login');
      return;
    }

    async function load() {
      try {
        const healthResponse = await fetch(`${API}/health`, { cache: 'no-store' });
        const healthJson = healthResponse.ok ? await healthResponse.json() : { status: 'offline' };
        setHealth(healthJson && typeof healthJson === 'object' ? healthJson : { status: 'offline' });

        const bookingsResponse = await fetch(`${API}/bookings`, {
          cache: 'no-store',
          headers: { authorization: `Bearer ${token}` }
        });

        if (bookingsResponse.status === 401 || bookingsResponse.status === 403) {
          localStorage.removeItem('ancline_token');
          localStorage.removeItem('ancline_user');
          window.location.replace('/login');
          return;
        }

        if (!bookingsResponse.ok) throw new Error(`Bookings API returned ${bookingsResponse.status}`);

        const bookingsJson = await bookingsResponse.json();
        setBookings(Array.isArray(bookingsJson) ? bookingsJson : []);
      } catch (e) {
        setBookings([]);
        setError(e instanceof Error ? e.message : 'Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function logout() {
    localStorage.removeItem('ancline_token');
    localStorage.removeItem('ancline_user');
    window.location.href = '/login';
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">ANCLINE WORLDWIDE</div>
        <a href="/">Control Tower</a>
        <a href="/bookings">Bookings</a>
        <a href="/organizations">Organizations</a>
        <a href="/rates">Rates / Quotes</a>
        <a href="/documents">Documents</a>
        <a href="/finance">Finance</a>
        <a href="/approvals">Approvals</a>
        <a href="/tasks">My Work</a>
      </aside>
      <main className="main">
        <div className="top">
          <div><h1 style={{margin:0}}>Global Control Tower</h1><div className="sub">Production Phase 1</div></div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <div className="status">API: {health.status || 'unknown'}</div>
            <button className="btn" onClick={logout}>Sign out</button>
          </div>
        </div>
        {error ? <div className="card" style={{marginBottom:16}}>Dashboard notice: {error}</div> : null}
        <div className="grid">
          <div className="card"><div className="sub">OPEN BOOKINGS</div><div className="kpi">{loading ? '…' : bookings.length}</div></div>
          <div className="card"><div className="sub">AWAITING APPROVAL</div><div className="kpi">0</div></div>
          <div className="card"><div className="sub">OPERATIONAL EXCEPTIONS</div><div className="kpi">0</div></div>
          <div className="card"><div className="sub">FINANCE BLOCKS</div><div className="kpi">0</div></div>
        </div>
        <div className="card" style={{marginTop:16}}>
          <h3>Recent Bookings</h3>
          <table className="table"><thead><tr><th>Booking</th><th>Status</th><th>Origin</th><th>Destination</th><th>Customer</th></tr></thead>
            <tbody>
              {bookings.map((b)=><tr key={b.id}><td>{b.bookingNo || '-'}</td><td><span className="status">{b.status || '-'}</span></td><td>{b.origin || '-'}</td><td>{b.destination || '-'}</td><td>{b.customer?.name || '-'}</td></tr>)}
              {!loading && bookings.length===0 ? <tr><td colSpan={5}>No bookings to display.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
