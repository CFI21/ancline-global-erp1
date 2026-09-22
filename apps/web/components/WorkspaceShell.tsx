'use client';

import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {currentUser,signOut} from '../lib/api';

const portalLinks=[
  ['/nvocc-portal','NVOCC Portal'],
  ['/customer-portal','Global Forwarding Portal'],
] as const;

const menuGroups=[
  {
    id:'customer',
    step:'01',
    label:'Customer & Sales',
    items:[
      ['/organizations','Organizations'],
      ['/sales-crm/leads','Sales Leads / Inquiries'],
      ['/sales-crm','Opportunities / Pipeline'],
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

export default function WorkspaceShell({title,subtitle,active,children,actions,hideHeader=false}:{title:string;subtitle:string;active:string;children:ReactNode;actions?:ReactNode;hideHeader?:boolean}){
  const activeGroup=menuGroups.find(group=>group.items.some(([href])=>href===active))?.id??null;
  const [openGroup,setOpenGroup]=useState<string|null>(activeGroup);
  const [menuQuery,setMenuQuery]=useState('');
  const [embedded,setEmbedded]=useState(false);
  const [session,setSession]=useState<any>({role:'',permissions:[]});
  useEffect(()=>{
    setSession(currentUser());
    const isEmbedded=new URLSearchParams(location.search).get('embed')==='1';
    setEmbedded(isEmbedded);
    document.body.classList.toggle('ancline-embed-mode',isEmbedded);
    return ()=>document.body.classList.remove('ancline-embed-mode');
  },[]);
  const query=menuQuery.trim().toLowerCase();
  const searching=query.length>0;
  const role=String(session?.role||'').toUpperCase();
  const permissions=Array.isArray(session?.permissions)?session.permissions:[];
  const internalRole=['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE'].includes(role);
  const portalAllowed=(href:string)=>{
    if(internalRole)return true;
    if(href==='/nvocc-portal')return role==='AGENT';
    if(href==='/customer-portal')return ['CUSTOMER','SHIPPER','CONSIGNEE'].includes(role)||(role==='AGENT'&&permissions.includes('FORWARDING_DIRECT_COLOAD_CROSS_TRADE'));
    return false;
  };

  const visiblePortals=portalLinks.filter(([href,label])=>
    portalAllowed(href)&&(!searching||label.toLowerCase().includes(query)||href.toLowerCase().includes(query))
  );

  const visibleGroups=(internalRole?menuGroups:[]).map(group=>{
    if(!searching)return group;
    const groupMatch=group.label.toLowerCase().includes(query);
    const items=groupMatch
      ? group.items
      : group.items.filter(([href,label])=>label.toLowerCase().includes(query)||href.toLowerCase().includes(query));
    return {...group,items};
  }).filter(group=>group.items.length>0);

  const noResults=searching&&visiblePortals.length===0&&visibleGroups.length===0;

  if(embedded)return <main className="main embedded-main">{children}</main>;

  return <div className="shell">
    <aside className="side">
      <div className="brand">ANCLINE <span>WORLDWIDE</span></div>

      <div className="menu-search-wrap">
        <span className="menu-search-icon" aria-hidden="true">⌕</span>
        <input
          className="menu-search"
          value={menuQuery}
          onChange={e=>setMenuQuery(e.target.value)}
          placeholder="Search menu..."
          aria-label="Search ANCLINE menu"
        />
        {menuQuery&&<button type="button" className="menu-search-clear" onClick={()=>setMenuQuery('')} aria-label="Clear menu search">×</button>}
      </div>

      <div className="menu-caption">QUICK ACCESS</div>
      {!searching&&<a className="menu-home" href="/" aria-current={active==='/'?'page':undefined}>
        <span className="menu-step">00</span><span>Control Tower</span>
      </a>}
      {visiblePortals.map(([href,label])=><a
        key={href}
        className={'menu-portal'+(active===href?' active':'')}
        href={href}
        aria-current={active===href?'page':undefined}
      >
        <span className="menu-portal-mark">↗</span><span>{label}</span>
      </a>)}

      <div className="menu-caption workflow-caption">WORKFLOW NAVIGATION</div>
      <nav className="menu-nav" aria-label="ANCLINE workflow navigation">
        {visibleGroups.map(group=>{
          const expanded=searching||openGroup===group.id;
          const current=group.id===activeGroup;
          return <div className="menu-section" key={group.id}>
            <button
              type="button"
              className={'menu-group'+(current?' current':'')}
              aria-expanded={expanded}
              onClick={()=>{if(!searching)setOpenGroup(expanded?null:group.id);}}
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
        {noResults&&<div className="menu-no-results">No menu items found for “{menuQuery}”.</div>}
      </nav>
    </aside>
    <main className="main">
      {!hideHeader&&<>
        <div className="top">
          <div className="top-title-wrap"><h1>{title}</h1><div className="sub">{subtitle}</div></div>
          <div className="top-actions">{actions}<button className="btn" onClick={signOut}>Sign out</button></div>
        </div>
        <div className="erp-commandbar" role="toolbar" aria-label="Workspace commands">
          <div className="erp-commandbar-left">
            <button type="button" onClick={()=>history.back()}>← Back</button>
            <button type="button" onClick={()=>location.reload()}>↻ Reload</button>
            <button type="button" onClick={()=>window.print()}>Print</button>
          </div>
          <div className="erp-commandbar-status">READY</div>
        </div>
      </>}
      {children}
    </main>
  </div>;
}

export const fieldStyle:React.CSSProperties={width:'100%',padding:'3px 6px',border:'1px solid #b8c3cc',borderRadius:2,background:'#fff',minHeight:27,height:27,fontSize:12,lineHeight:'19px',boxShadow:'none'};
export const labelStyle:React.CSSProperties={fontSize:11.5,fontWeight:700,color:'#31485a',display:'block',marginBottom:3,lineHeight:1.15};
export const sectionTitle:React.CSSProperties={fontSize:12,fontWeight:800,color:'#183a57',margin:'-1px -1px 8px',padding:'5px 8px',background:'#e3e8ec',borderBottom:'1px solid #aeb9c2'};
export const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',columnGap:8,rowGap:6};
