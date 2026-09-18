'use client';

import {useEffect,useState} from 'react';
import WorkspaceShell,{fieldStyle,labelStyle} from '../../components/WorkspaceShell';
import {api,requireToken} from '../../lib/api';

const GROUPS=[
  ['ORIGIN_PORT','Origin Port Charges'],
  ['SEA_FREIGHT','Sea Freight'],
  ['DESTINATION_PORT','Destination Port Charges'],
  ['ORIGIN_HAULAGE','Origin Haulage'],
  ['DESTINATION_HAULAGE','Destination Haulage']
] as const;

type Office={officeKey:string;code:string;name:string;countryCode:string;source:string};
type Row={term:string;payerOfficeKey:string;payerName:string;payerAddress:string;payerCountryCode:string;carrierPayerCode:string};
const blank=(required:boolean):Row=>({term:required?'':'NOT_APPLICABLE',payerOfficeKey:'',payerName:'',payerAddress:'',payerCountryCode:'',carrierPayerCode:''});

export default function CarrierPaymentPage(){
  const [token,setToken]=useState(''),[bookingId,setBookingId]=useState(''),[ctx,setCtx]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [rows,setRows]=useState<Record<string,Row>>(()=>Object.fromEntries(GROUPS.map(([g])=>[g,blank(['ORIGIN_PORT','SEA_FREIGHT','DESTINATION_PORT'].includes(g))])));
  useEffect(()=>{const t=requireToken();if(!t)return;setToken(t);const id=new URLSearchParams(window.location.search).get('bookingId')||'';setBookingId(id);if(id)void load(id,t);},[]);
  async function load(id=bookingId,t=token){
    try{
      const data=await api('/carrier-payment/booking/'+id,t);setCtx(data);
      if(data?.current?.instructions){
        const next:any={...rows};
        for(const x of data.current.instructions)next[x.chargeGroup]={term:x.term||'',payerOfficeKey:x.payerOfficeKey||'',payerName:x.payerName||'',payerAddress:x.payerAddress||'',payerCountryCode:x.payerCountryCode||'',carrierPayerCode:x.carrierPayerCode||''};
        setRows(next);
      }
    }catch(e:any){setMessage(e?.message||'Unable to load carrier payment control');}
  }
  function set(group:string,key:keyof Row,value:string){setRows(x=>({...x,[group]:{...x[group],[key]:value}}));}
  async function save(){
    setBusy(true);setMessage('');
    try{
      const instructions:any={};
      for(const [group] of GROUPS)instructions[group]=rows[group];
      await api('/carrier-payment/booking/'+bookingId,token,{method:'POST',body:JSON.stringify({instructions})});
      setMessage('ANC carrier payment and payer instructions validated and saved.');await load();
    }catch(e:any){setMessage(e?.message||'Could not save carrier payer instructions');}finally{setBusy(false);}
  }
  const offices:Office[]=ctx?.offices||[],countries:string[]=ctx?.registeredCountries||[];
  return <WorkspaceShell title="Carrier Payment / Payer Control" subtitle="FORWARDING ONLY · ANC-to-carrier settlement · customer commercial terms remain private to ANC" active="/carrier-payment" actions={<>{bookingId&&<a className="btn" href={'/bookings/'+bookingId} style={{textDecoration:'none'}}>Back to Booking</a>}<button className="btn" disabled={busy||!bookingId} onClick={save}>{busy?'Saving...':'Validate & Save'}</button></>}>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {!bookingId&&<div className="card">Open Carrier Payment / Payer Control from a Forwarding booking.</div>}
    {ctx&&<>
      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10}}>
          <div><div className="sub">ANC Booking</div><b>{ctx.booking.bookingNo}</b></div>
          <div><div className="sub">Carrier</div><b>{ctx.booking.carrier||'-'}</b></div>
          <div><div className="sub">Registered ANC Countries</div><b>{countries.join(', ')||'None configured'}</b></div>
          <div><div className="sub">Privacy Rule</div><b>ANC payer only · no customer/KYC/house data outbound</b></div>
        </div>
      </div>
      <div className="card">
        <div className="sub" style={{marginBottom:12}}>Origin Port, Sea Freight, Destination Port and applicable haulage are carrier-side settlement instructions. They are separate from the customer's ANC commercial Prepaid/Collect terms. “Prepaid Elsewhere” is accepted only where ANC has an active registered office country.</div>
        <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Charge Group</th><th>Payment Term</th><th>ANC Payer</th><th>Elsewhere Name / Address</th><th>Country</th><th>Carrier Payer Code</th></tr></thead><tbody>
          {GROUPS.map(([g,label])=>{const row=rows[g]||blank(false);const elsewhere=row.term==='PREPAID_ELSEWHERE',na=row.term==='NOT_APPLICABLE';return <tr key={g}>
            <td><b>{label}</b></td>
            <td><select style={fieldStyle} value={row.term} onChange={e=>set(g,'term',e.target.value)}><option value="">Select term</option><option value="PREPAID_ORIGIN">Prepaid (Origin)</option><option value="COLLECT">Collect</option><option value="PREPAID_ELSEWHERE">Prepaid (Elsewhere)</option>{!['ORIGIN_PORT','SEA_FREIGHT','DESTINATION_PORT'].includes(g)&&<option value="NOT_APPLICABLE">Not Applicable</option>}</select></td>
            <td>{!elsewhere&&!na?<select style={{...fieldStyle,minWidth:190}} value={row.payerOfficeKey} onChange={e=>set(g,'payerOfficeKey',e.target.value)}><option value="">Select ANC office</option>{offices.map(o=><option key={o.officeKey} value={o.officeKey}>{o.code} · {o.name} · {o.countryCode}</option>)}</select>:<span className="sub">{elsewhere?'Manual ANC office payer':'Not applicable'}</span>}</td>
            <td>{elsewhere?<div style={{display:'grid',gap:5,minWidth:220}}><input style={fieldStyle} value={row.payerName} onChange={e=>set(g,'payerName',e.target.value)} placeholder="ANC payer legal name"/><input style={fieldStyle} value={row.payerAddress} onChange={e=>set(g,'payerAddress',e.target.value)} placeholder="Registered office address"/></div>:<span className="sub">—</span>}</td>
            <td>{elsewhere?<select style={{...fieldStyle,minWidth:120}} value={row.payerCountryCode} onChange={e=>set(g,'payerCountryCode',e.target.value)}><option value="">Country</option>{countries.map(x=><option key={x}>{x}</option>)}</select>:<span className="sub">{row.payerOfficeKey?offices.find(o=>o.officeKey===row.payerOfficeKey)?.countryCode||'—':'—'}</span>}</td>
            <td>{!na?<input style={{...fieldStyle,minWidth:140}} value={row.carrierPayerCode} onChange={e=>set(g,'carrierPayerCode',e.target.value)} placeholder="If carrier assigns one"/>:<span className="sub">—</span>}</td>
          </tr>})}
        </tbody></table></div>
      </div>
    </>}
  </WorkspaceShell>;
}
