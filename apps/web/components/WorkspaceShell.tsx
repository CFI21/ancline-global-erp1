'use client';

import type {ReactNode} from 'react';
import {signOut} from '../lib/api';

const links=[
  ['/', 'Control Tower'],
  ['/bookings','Bookings'],
  ['/booking-control','Booking Control'],
  ['/shipment-control','Shipment / Consol Control'],
  ['/schedules','Vessel / Voyage Schedules'],
  ['/container-control','Container Control'],
  ['/transport','Land Transport / Delivery'],
  ['/customs','Customs Clearance'],
  ['/exceptions','Exceptions / Action Board'],
  ['/routing','Routing / Voyage Plan'],
  ['/tracking','Shipment Tracking'],
  ['/integrations','Integration Control'],
  ['/organizations','Organizations'],
  ['/rates','Commercial / Quotes'],
  ['/documents','Documents'],
  ['/finance','Finance'],
  ['/approvals','Approvals'],
  ['/tasks','My Work'],
  ['/closeout','Job Closeout'],
  ['/notifications','Notifications'],
  ['/administration','Administration'],
] as const;

export default function WorkspaceShell({title,subtitle,active,children,actions}:{title:string;subtitle:string;active:string;children:ReactNode;actions?:ReactNode}){
  return <div className="shell">
    <aside className="side">
      <div className="brand">ANCLINE WORLDWIDE</div>
      {links.map(([href,label])=><a key={href} href={href} style={active===href?{background:'#183a5c'}:undefined}>{label}</a>)}
    </aside>
    <main className="main">
      <div className="top">
        <div><h1 style={{margin:0}}>{title}</h1><div className="sub">{subtitle}</div></div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>{actions}<button className="btn" onClick={signOut}>Sign out</button></div>
      </div>
      {children}
    </main>
  </div>;
}

export const fieldStyle:React.CSSProperties={width:'100%',padding:'8px 9px',border:'1px solid #cfd9e2',borderRadius:6,background:'#fff',minHeight:36};
export const labelStyle:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};
export const sectionTitle:React.CSSProperties={fontSize:14,fontWeight:800,color:'#153a5d',margin:'0 0 12px',paddingBottom:8,borderBottom:'1px solid #e2e8ee'};
export const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:10};
