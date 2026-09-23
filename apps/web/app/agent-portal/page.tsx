'use client';

import {useEffect,useState} from 'react';
import {currentUser,requireToken} from '../../lib/api';
import WorkspaceShell from '../../components/WorkspaceShell';
import ExternalPortalCommunications from '../../components/ExternalPortalCommunications';

export default function AgentPortal(){
  const [ready,setReady]=useState(false);
  const user=currentUser();
  const perms=Array.isArray(user?.permissions)?user.permissions:[];
  const forwardingAllowed=perms.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE')&&Boolean(user?.costCenterCode);
  useEffect(()=>{const t=requireToken();if(!t)return;if(String(currentUser()?.role||'')!=='AGENT'){location.replace('/');return;}setReady(true);},[]);
  if(!ready)return <WorkspaceShell title="Agent Portal" subtitle="Opening Agent workspace…" active="/nvocc-portal"><div className="card">Opening Agent workspace…</div></WorkspaceShell>;
  return <WorkspaceShell
    title="Liner Agency Workspace"
    subtitle={`ANCLINE AGENT ACCESS · ${user?.email||''} · Mode: ${user?.agentMode||'LINER_AGENCY_ONLY'} · Cost Center: ${user?.costCenterCode||'Not assigned'}`}
    active="/nvocc-portal"
  >
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14,marginTop:18}}>
      <div className="card">
        <div className="sub">PRIMARY AGENT MODE</div><h2>NVOCC Liner Agency</h2>
        <p>ANC NVOCC rates, bookings, documents and NVOCC operational handling.</p>
        <a className="btn" href="/nvocc-portal" style={{textDecoration:'none'}}>Open NVOCC Liner Agency</a>
      </div>
      <div className="card">
        <div className="sub">CONTROLLED EXCEPTION</div><h2>Forwarding Direct Co-load / Cross Trade</h2>
        <p>Available only when the dedicated Forwarding right and an Agent cost center are assigned. Standard Forwarding is not available to Agent users.</p>
        {forwardingAllowed?<a className="btn" href="/customer-portal" style={{textDecoration:'none'}}>Open Forwarding Exception</a>:<div><span className="status">Not Authorized</span><div className="sub" style={{marginTop:8}}>Admin must assign FORWARDING_DIRECT_COLOAD_CROSS_TRADE and a cost center.</div></div>}
      </div>
    </div>
    <ExternalPortalCommunications compact />
  </WorkspaceShell>;
}
