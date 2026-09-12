const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getHealth() {
  try {
    const r = await fetch(`${API}/health`, { cache: 'no-store' });
    return await r.json();
  } catch {
    return { status: 'offline' };
  }
}

async function getBookings() {
  try {
    const r = await fetch(`${API}/bookings`, { cache: 'no-store' });
    return await r.json();
  } catch {
    return [];
  }
}

export default async function Home() {
  const health = await getHealth();
  const bookings = await getBookings();
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
          <div className="status">API: {health.status}</div>
        </div>
        <div className="grid">
          <div className="card"><div className="sub">OPEN BOOKINGS</div><div className="kpi">{bookings.length}</div></div>
          <div className="card"><div className="sub">AWAITING APPROVAL</div><div className="kpi">0</div></div>
          <div className="card"><div className="sub">OPERATIONAL EXCEPTIONS</div><div className="kpi">0</div></div>
          <div className="card"><div className="sub">FINANCE BLOCKS</div><div className="kpi">0</div></div>
        </div>
        <div className="card" style={{marginTop:16}}>
          <h3>Recent Bookings</h3>
          <table className="table"><thead><tr><th>Booking</th><th>Status</th><th>Origin</th><th>Destination</th><th>Customer</th></tr></thead>
            <tbody>{bookings.map((b:any)=><tr key={b.id}><td>{b.bookingNo}</td><td><span className="status">{b.status}</span></td><td>{b.origin}</td><td>{b.destination}</td><td>{b.customer?.name || '-'}</td></tr>)}</tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
