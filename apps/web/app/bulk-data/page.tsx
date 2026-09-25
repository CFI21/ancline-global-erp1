'use client';

import {useEffect,useMemo,useState} from 'react';
import WorkspaceShell,{fieldStyle,sectionTitle} from '../../components/WorkspaceShell';
import {api,currentUser,requireToken} from '../../lib/api';

type Kind='CUSTOMER'|'CARRIER'|'RATE'|'BOOKING';
type Mode='IMPORT'|'UPDATE'|'UPSERT';
type Template={required:string[];headers:string[];example:Record<string,any>};
type Templates={maxRows:number;importOrder:string[];privacyRule:string;templates:Record<Kind,Template>};

function csvEscape(v:any){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);
  if(rows.length<2)return [];
  const headers=rows[0].map(x=>x.trim());
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()])));
}

export default function BulkDataPage(){
  const [token,setToken]=useState('');
  const [kind,setKind]=useState<Kind>('CUSTOMER');
  const [mode,setMode]=useState<Mode>('UPSERT');
  const [templates,setTemplates]=useState<Templates|null>(null);
  const [rows,setRows]=useState<any[]>([]);
  const [validation,setValidation]=useState<any>(null);
  const [result,setResult]=useState<any>(null);
  const [history,setHistory]=useState<any[]>([]);
  const [testSummary,setTestSummary]=useState<any>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const admin=String(currentUser()?.role||'').toUpperCase()==='GLOBAL_ADMIN';

  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);void load(t);},[]);
  async function load(t=token){
    try{
      const [tpl,h,ts]=await Promise.all([api('/bulk-data/templates',t),api('/bulk-data/history',t).catch(()=>[]),api('/test-data/summary',t).catch(()=>null)]);
      setTemplates(tpl);setHistory(Array.isArray(h)?h:[]);setTestSummary(ts);
    }catch(e:any){setMessage(e?.message||'Unable to load bulk data workspace');}
  }

  const current=templates?.templates?.[kind];
  const preview=useMemo(()=>rows.slice(0,10),[rows]);

  function loadExample(){
    if(!current)return;
    setRows([current.example]);setValidation(null);setResult(null);setMessage('Loaded one synthetic example row. Add more rows by CSV upload as needed.');
  }
  function downloadTemplate(){
    if(!current)return;
    const csv=current.headers.map(csvEscape).join(',')+'\n'+current.headers.map(h=>csvEscape(current.example[h]??'')).join(',')+'\n';
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ancline-'+kind.toLowerCase()+'-bulk-template.csv';a.click();URL.revokeObjectURL(url);
  }
  async function fileSelected(file?:File){
    if(!file)return;const parsed=parseCsv(await file.text());setRows(parsed);setValidation(null);setResult(null);setMessage(parsed.length?parsed.length+' rows loaded from '+file.name:'No data rows found in CSV.');
  }
  async function validate(){
    if(!rows.length){setMessage('Load a CSV or example row first.');return;}setBusy(true);setMessage('');
    try{const r=await api('/bulk-data/validate',token,{method:'POST',body:JSON.stringify({type:kind,mode,rows})});setValidation(r);setMessage(r.invalid?('Validation found '+r.invalid+' invalid rows.'):'Validation passed for all '+r.valid+' rows.');}
    catch(e:any){setMessage(e?.message||'Validation failed');}finally{setBusy(false);}
  }
  async function importRows(){
    if(!rows.length){setMessage('Load data first.');return;}setBusy(true);setMessage('');
    try{const r=await api('/bulk-data/import',token,{method:'POST',body:JSON.stringify({type:kind,mode,rows})});setResult(r);setValidation(null);setMessage(r.committed?('Bulk '+String(r.mode||mode).toLowerCase()+' '+r.batchId+': '+r.succeeded+' succeeded, '+r.failed+' failed.'):(r.message||'Import was not committed.'));await load();}
    catch(e:any){setMessage(e?.message||'Import failed');}finally{setBusy(false);}
  }
  function downloadErrorReport(){
    const source=validation?.results||result?.results||[];
    if(!source.length){setMessage('No validation or execution report available to download.');return;}
    const csv=['row,state,errors,warnings,reference',...source.map((x:any)=>[
      x.row,
      x.status||(x.valid?'VALID':'INVALID'),
      (x.error||x.errors?.join('; ')||''),
      x.warnings?.join('; ')||'',
      x.value?.bookingNo||x.value?.quoteNo||x.value?.code||''
    ].map(csvEscape).join(','))].join('\n')+'\n';
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ancline-'+kind.toLowerCase()+'-'+mode.toLowerCase()+'-report.csv';a.click();URL.revokeObjectURL(url);
  }
  async function seedTest(){
    setBusy(true);setMessage('');
    try{const r=await api('/test-data/seed',token,{method:'POST'});setTestSummary(r);setMessage('Synthetic ANCLINE customer, carrier, rate and booking test pack seeded/refreshed.');await load();}
    catch(e:any){setMessage(e?.message||'Test-data seed failed');}finally{setBusy(false);}
  }

  return <WorkspaceShell title="Bulk Data Import & Update" subtitle="Controlled customer, carrier, rate and booking bulk import, update, validation and audit" active="/bulk-data"
    actions={<><button className="btn" onClick={()=>void load()}>Refresh</button><button className="btn" disabled={busy||!admin} onClick={seedTest}>Seed Synthetic Test Pack</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {!admin&&<div className="card" style={{marginBottom:12}}>Global Admin access is required for bulk imports.</div>}
    {templates&&<div className="card" style={{marginBottom:12,borderLeft:'4px solid #153a5d'}}>
      <b>Critical carrier privacy rule:</b> {templates.privacyRule}
      <div className="sub" style={{marginTop:5}}>Recommended dependency order: {templates.importOrder.join(' → ')}. Maximum {templates.maxRows} rows per batch.</div>
    </div>}

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>1. Select dataset and load CSV</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,alignItems:'end'}}>
        <label><span className="sub">Dataset</span><select style={fieldStyle} value={kind} onChange={e=>{setKind(e.target.value as Kind);setRows([]);setValidation(null);setResult(null);}}><option>CUSTOMER</option><option>CARRIER</option><option>RATE</option><option>BOOKING</option></select></label>
        <label><span className="sub">Mode</span><select style={fieldStyle} value={mode} onChange={e=>{setMode(e.target.value as Mode);setValidation(null);setResult(null);}}><option value="IMPORT">IMPORT — create only</option><option value="UPDATE">UPDATE — existing only</option><option value="UPSERT">UPSERT — create or update</option></select></label>
        <label><span className="sub">CSV file</span><input style={fieldStyle} type="file" accept=".csv,text/csv" onChange={e=>void fileSelected(e.target.files?.[0])}/></label>
        <button className="btn" onClick={downloadTemplate} disabled={!current}>Download CSV Template</button>
        <button className="btn" onClick={loadExample} disabled={!current}>Load Example Row</button>
      </div>
      {current&&<div className="sub" style={{marginTop:10}}>Required: {current.required.join(', ')}<br/>Headers: {current.headers.join(', ')}</div>}
    </div>

    <div className="card" style={{marginBottom:12}}>
      <h3 style={sectionTitle}>2. Preview and validate</h3>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:10}}><span className="status">{rows.length} rows loaded</span><button className="btn" disabled={busy||!rows.length||!admin} onClick={validate}>Validate</button><button className="btn" disabled={busy||!rows.length||!admin} onClick={importRows}>{mode==='IMPORT'?'Import New':mode==='UPDATE'?'Update Existing':'Import / Upsert'}</button><button className="btn" disabled={busy||(!validation&&!result)} onClick={downloadErrorReport}>Download Error Report</button></div>
      <div style={{overflowX:'auto'}}><table className="table"><thead><tr>{current?.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
        {preview.map((r,i)=><tr key={i}>{current?.headers.map(h=><td key={h}>{String(r[h]??'')}</td>)}</tr>)}
        {!rows.length&&<tr><td colSpan={Math.max(1,current?.headers.length||1)}>No rows loaded.</td></tr>}
      </tbody></table></div>
      {rows.length>10&&<div className="sub" style={{marginTop:6}}>Preview shows first 10 of {rows.length} rows.</div>}
    </div>

    {validation&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Validation Result</h3>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="status">Mode {validation.mode||mode}</span><span className="status">Valid {validation.valid}</span><span className="status">Invalid {validation.invalid}</span></div>
      <div style={{overflowX:'auto',marginTop:8}}><table className="table"><thead><tr><th>Row</th><th>State</th><th>Errors</th><th>Warnings</th></tr></thead><tbody>{validation.results?.map((x:any)=><tr key={x.row}><td>{x.row}</td><td>{x.valid?'VALID':'INVALID'}</td><td>{x.errors?.join('; ')||'-'}</td><td>{x.warnings?.join('; ')||'-'}</td></tr>)}</tbody></table></div>
    </div>}

    {result&&<div className="card" style={{marginBottom:12}}><h3 style={sectionTitle}>Import Result {result.batchId||''}</h3>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="status">Mode {result.mode||mode}</span><span className="status">Succeeded {result.succeeded||0}</span><span className="status">Failed {result.failed||0}</span><span className="status">Committed {String(Boolean(result.committed))}</span></div>
      <div style={{overflowX:'auto',marginTop:8}}><table className="table"><thead><tr><th>Row</th><th>Status</th><th>Reference</th><th>Error</th></tr></thead><tbody>{result.results?.map((x:any)=><tr key={x.row}><td>{x.row}</td><td>{x.status|| (x.valid?'VALID':'INVALID')}</td><td>{x.value?.bookingNo||x.value?.quoteNo||x.value?.code||'-'}</td><td>{x.error||x.errors?.join('; ')||'-'}</td></tr>)}</tbody></table></div>
    </div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12}}>
      <div className="card"><h3 style={sectionTitle}>Synthetic Test Pack</h3>
        <div className="sub">Uses the existing ANCLINE controlled synthetic dataset. It never uses real customer or carrier identities.</div>
        <div style={{marginTop:10}}><b>Customers:</b> {testSummary?.summary?.customers??'-'} &nbsp; <b>Carriers:</b> {testSummary?.summary?.carriers??'-'} &nbsp; <b>Bookings:</b> {testSummary?.summary?.bookings??'-'}</div>
      </div>
      <div className="card"><h3 style={sectionTitle}>Recent Bulk Imports</h3>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Batch</th><th>Type</th><th>Mode</th><th>Actor</th><th>Result</th></tr></thead><tbody>{history.slice(0,8).map((h:any)=><tr key={h.id}><td>{h.id}</td><td>{h.payload?.type||'-'}</td><td>{h.payload?.mode||'UPSERT'}</td><td>{h.payload?.actorId||'-'}</td><td>{h.payload?.succeeded||0}/{h.payload?.total||0}</td></tr>)}{!history.length&&<tr><td colSpan={5}>No bulk-data history yet.</td></tr>}</tbody></table></div>
      </div>
    </div>
  </WorkspaceShell>;
}
