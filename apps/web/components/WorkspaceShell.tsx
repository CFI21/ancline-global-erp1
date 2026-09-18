'use client';

import {useState} from 'react';
import type {ReactNode} from 'react';
import {signOut} from '../lib/api';

const menuGroups=[
  {
    id:'customer',
    step:'01',
    label:'Customer & Sales',
    items:[
      ['/organizations','Organizations'],
      ['/sales-crm','Sales Pipeline'],
      ['/customer-service','Customer Service'],
    ],
  },
  {
    id:'commercial',
    step:'02',
    label:'Rates & Quotes',
    items:[
      ['/commercial','Contracts & Tariffs'],
      ['/carrier-rates','Carrier Buy Rates'],
      ['/rates','ANC Quotes'],
      ['/commercial-guardrails','Commercial Controls'],
      ['/global-commerce','Global Commerce'],
    ],
  },
  {
    id:'booking',
    step:'03',
    label:'Booking & Carrier',
    items:[
      ['/bookings','Bookings'],
      ['/booking-control','Booking Control'],
      ['/carrier-operations','Carrier Space'],
      ['/carrier-payment','Carrier Payer Control'],
    ],
  },
  {
    id:'operations',
    step:'04',
    label:'Shipment Execution',
    items:[
      ['/shipment-control','Shipment Control'],
      ['/schedules','Vessel Schedules'],
      ['/routing','Routing Plan'],
      ['/container-control','Container Control'],
      ['/transport','Land Transport'],
      ['/customs','Customs'],
      ['/tracking','Tracking'],
      ['/exceptions','Exceptions'],
      ['/forwarding-amendments','Amendments'],
    ],
  },
  {
    id:'documents',
    step:'05',
    label:'Docs & Compliance',
    items:[
      ['/documents','Documents'],
      ['/document-automation','Document Automation'],
      ['/data-quality','Data Validation'],
      ['/enterprise-risk','Risk & Insurance'],
      ['/quality-management','Quality / CAPA'],
    ],
  },
  {
    id:'finance',
    step:'06',
    label:'Finance & Closeout',
    items:[
      ['/procurement','Procurement'],
      ['/vendor-control','Vendor / Margin Control'],
      ['/commercial-profitability','Profitability'],
      ['/finance','Job Costing'],
      ['/accounting','AR / AP & Invoicing'],
      ['/credit-control','Credit & Collections'],
      ['/general-ledger','General Ledger / Tax'],
      ['/finance-reporting','Financial Reporting'],
      ['/group-finance','Group Finance'],
      ['/statutory-finance','Statutory Finance'],
      ['/treasury','Treasury'],
      ['/month-end','Month-End'],
      ['/closeout','Job Closeout'],
    ],
  },
  {
    id:'automation',
    step:'07',
    label:'Work & Automation',
    items:[
      ['/tasks','My Work'],
      ['/approvals','Approvals'],
      ['/notifications','Notifications'],
      ['/workflow-automation','Workflow Automation'],
      ['/background-automation','Scheduled Automation'],
      ['/integrations','Integrations'],
      ['/connectivity','EDI / Connectivity'],
      ['/enterprise-reporting','Enterprise BI'],
    ],
  },
  {
    id:'admin',
    step:'08',
    label:'Admin & Testing',
    items:[
      ['/workforce','Workforce'],
      ['/governance','Master Data / Rules'],
      ['/administration','Administration'],
      ['/testing-lab','Testing Lab'],
      ['/bulk-data','Bulk Data Upload'],
    ],
  },
] as const;

export default function WorkspaceShell({title,subtitle,active,children,actions}:{title:string;subtitle:string;active:string;children:ReactNode;actions?:ReactNode}){
  const activeGroup=menuGroups.find(group=>group.items.some(([href])=>href===active))?.id??null;
  const [openGroup,setOpenGroup]=useState<string|null>(activeGroup);

  return <div className="shell">
    <aside className="side">
      <div className="brand">ANCLINE <span>WORLDWIDE</span></div>
      <div className="menu-caption">WORKFLOW NAVIGATION</div>
      <a className="menu-home" href="/" aria-current={active==='/'?'page':undefined}>
        <span className="menu-step">00</span><span>Control Tower</span>
      </a>
      <nav className="menu-nav" aria-label="ANCLINE workflow navigation">
        {menuGroups.map(group=>{
          const expanded=openGroup===group.id;
          const current=group.id===activeGroup;
          return <div className="menu-section" key={group.id}>
            <button
              type="button"
              className={'menu-group'+(current?' current':'')}
              aria-expanded={expanded}
              onClick={()=>setOpenGroup(expanded?null:group.id)}
            >
              <span className="menu-step">{group.step}</span>
              <span className="menu-group-label">{group.label}</span>
              <span className="menu-chevron" aria-hidden="true">{expanded?'−':'+'}</span>
            </button>
            {expanded&&<div className="submenu">
              {group.items.map(([href,label])=><a
                key={href}
                href={href}
                className={active===href?'active':''}
                aria-current={active===href?'page':undefined}
              >{label}</a>)}
            </div>}
          </div>;
        })}
      </nav>
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
