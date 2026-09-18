'use client';

import {useState} from 'react';
import {api} from '../../lib/api';

type Person={name:string;country:string;ownershipPct?:string;idRef?:string};
const blankPerson:Person={name:'',country:'',ownershipPct:'',idRef:''};

export default function CustomerRegistrationPage(){
  const [form,setForm]=useState({
    legalName:'',tradingName:'',countryCode:'',companyRegistrationNo:'',taxId:'',registeredAddress:'',operatingAddress:'',
    contactName:'',contactEmail:'',contactPhone:'',businessType:'SHIPPER',website:'',expectedTradeLanes:'',expectedMonthlyShipments:'',
    bankName:'',bankCountry:'',bankAccountName:'',bankAccountRef:'',dangerousGoods:false,
    sanctionsDeclaration:false,termsAccepted:false,privacyAccepted:false
  });
  const [ubos,setUbos]=useState<Person[]>([{...blankPerson}]),[directors,setDirectors]=useState<Person[]>([{...blankPerson}]);
  const [documents,setDocuments]=useState<string[]>([]);
  const [registrationRef,setRegistrationRef]=useState(''),[statusRef,setStatusRef]=useState(''),[status,setStatus]=useState<any>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const input:React.CSSProperties={width:'100%',padding:9,border:'1px solid #cfd9e2',borderRadius:6,background:'#fff'};
  const label:React.CSSProperties={fontSize:12,fontWeight:700,color:'#4c6072',display:'block',marginBottom:5};
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10};
  const requiredDocs=['Company registration certificate','Tax / VAT certificate','UBO identity document','Director / authorized signatory ID','Proof of registered address','Bank proof / account confirmation'];

  function updatePerson(kind:'ubo'|'director',idx:number,key:keyof Person,value:string){
    const setter=kind==='ubo'?setUbos:setDirectors;
    setter((rows)=>rows.map((r,i)=>i===idx?{...r,[key]:value}:r));
  }
  function addPerson(kind:'ubo'|'director'){(kind==='ubo'?setUbos:setDirectors)(rows=>[...rows,{...blankPerson}]);}
  function removePerson(kind:'ubo'|'director',idx:number){(kind==='ubo'?setUbos:setDirectors)(rows=>rows.filter((_,i)=>i!==idx));}

  async function submit(){
    setBusy(true);setMessage('');
    try{
      const payload={
        ...form,
        countryCode:form.countryCode.trim().toUpperCase(),
        beneficialOwners:ubos.filter(x=>x.name.trim()).map(x=>({name:x.name.trim(),country:x.country.trim().toUpperCase(),ownershipPct:Number(x.ownershipPct||0)||null,idRef:x.idRef.trim()||null})),
        directors:directors.filter(x=>x.name.trim()).map(x=>({name:x.name.trim(),country:x.country.trim().toUpperCase(),idRef:x.idRef.trim()||null})),
        bankDetails:{bankName:form.bankName.trim(),bankCountry:form.bankCountry.trim().toUpperCase(),accountName:form.bankAccountName.trim(),accountReference:form.bankAccountRef.trim()},
        expectedTradeLanes:form.expectedTradeLanes.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),
        expectedMonthlyShipments:Number(form.expectedMonthlyShipments||0)||null,
        documents
      };
      const r=await api('/organizations/register-customer',undefined,{method:'POST',body:JSON.stringify(payload)});
      setRegistrationRef(r.registrationRef);setStatusRef(r.registrationRef);setStatus(r);setMessage('KYC application submitted. Keep your ANC registration reference for status tracking.');
    }catch(e:any){setMessage(e.message||'Customer registration could not be submitted.');}
    finally{setBusy(false);}
  }

  async function checkStatus(){
    if(!statusRef.trim())return;setBusy(true);setMessage('');
    try{const r=await api('/organizations/registration/'+encodeURIComponent(statusRef.trim().toUpperCase()));setStatus(r);}
    catch(e:any){setMessage(e.message||'Registration status could not be found.');}
    finally{setBusy(false);}
  }

  return <main style={{maxWidth:1180,margin:'0 auto',padding:20}}>
    <div className="top"><div><div className="sub">GLOBAL ANCLINE FORWARDING</div><h1 style={{margin:'2px 0'}}>Customer Registration & KYC</h1><div className="sub">Registration is mandatory before Forwarding rates, ANC quotes or bookings can be used.</div></div><a className="btn" href="/login" style={{textDecoration:'none'}}>Sign in</a></div>
    {message&&<div className="card" style={{marginBottom:12}}>{message}</div>}
    {status&&<div className="card" style={{marginBottom:12}}>
      <div style={grid}>
        <div><span className="sub">REGISTRATION REF</span><div><b>{status.registrationRef||registrationRef}</b></div></div>
        <div><span className="sub">KYC STATUS</span><div><span className="status">{status.kycStatus||'-'}</span></div></div>
        <div><span className="sub">ANC CUSTOMER REF</span><div><b>{status.customerRef||'Issued after approval'}</b></div></div>
        <div><span className="sub">COMPANY</span><div>{status.companyName||form.legalName}</div></div>
      </div>
      {status.rejectionReason&&<div style={{marginTop:10}}><b>Review note:</b> {status.rejectionReason}</div>}
    </div>}

    {!registrationRef&&<div className="card" style={{marginBottom:12}}>
      <h3 style={{marginTop:0}}>1. Company & legal details</h3>
      <div style={grid}>
        <label><span style={label}>Legal Company Name *</span><input style={input} value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})}/></label>
        <label><span style={label}>Trading Name</span><input style={input} value={form.tradingName} onChange={e=>setForm({...form,tradingName:e.target.value})}/></label>
        <label><span style={label}>Country Code *</span><input maxLength={2} style={input} value={form.countryCode} onChange={e=>setForm({...form,countryCode:e.target.value})} placeholder="NL"/></label>
        <label><span style={label}>Company Registration No. *</span><input style={input} value={form.companyRegistrationNo} onChange={e=>setForm({...form,companyRegistrationNo:e.target.value})}/></label>
        <label><span style={label}>VAT / Tax ID</span><input style={input} value={form.taxId} onChange={e=>setForm({...form,taxId:e.target.value})}/></label>
        <label><span style={label}>Business Type *</span><select style={input} value={form.businessType} onChange={e=>setForm({...form,businessType:e.target.value})}><option>SHIPPER</option><option>CONSIGNEE</option><option>IMPORTER</option><option>EXPORTER</option><option>TRADER</option><option>MANUFACTURER</option><option>FORWARDING CUSTOMER</option></select></label>
        <label style={{gridColumn:'1/-1'}}><span style={label}>Registered Address *</span><input style={input} value={form.registeredAddress} onChange={e=>setForm({...form,registeredAddress:e.target.value})}/></label>
        <label style={{gridColumn:'1/-1'}}><span style={label}>Operating Address</span><input style={input} value={form.operatingAddress} onChange={e=>setForm({...form,operatingAddress:e.target.value})}/></label>
        <label><span style={label}>Website</span><input style={input} value={form.website} onChange={e=>setForm({...form,website:e.target.value})}/></label>
      </div>

      <h3>2. Primary contact</h3>
      <div style={grid}>
        <label><span style={label}>Contact Name *</span><input style={input} value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></label>
        <label><span style={label}>Email *</span><input type="email" style={input} value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})}/></label>
        <label><span style={label}>Phone *</span><input style={input} value={form.contactPhone} onChange={e=>setForm({...form,contactPhone:e.target.value})}/></label>
      </div>

      <h3>3. Beneficial owners / UBOs</h3>
      {ubos.map((p,i)=><div key={i} style={{...grid,marginBottom:8,padding:10,border:'1px solid #e2e8ee',borderRadius:7}}>
        <label><span style={label}>Full Name *</span><input style={input} value={p.name} onChange={e=>updatePerson('ubo',i,'name',e.target.value)}/></label>
        <label><span style={label}>Country *</span><input style={input} value={p.country} onChange={e=>updatePerson('ubo',i,'country',e.target.value)}/></label>
        <label><span style={label}>Ownership %</span><input type="number" style={input} value={p.ownershipPct} onChange={e=>updatePerson('ubo',i,'ownershipPct',e.target.value)}/></label>
        <label><span style={label}>ID / Passport Reference</span><input style={input} value={p.idRef} onChange={e=>updatePerson('ubo',i,'idRef',e.target.value)}/></label>
        {ubos.length>1&&<button className="btn" onClick={()=>removePerson('ubo',i)}>Remove</button>}
      </div>)}
      <button className="btn" onClick={()=>addPerson('ubo')}>Add UBO</button>

      <h3>4. Directors / authorized signatories</h3>
      {directors.map((p,i)=><div key={i} style={{...grid,marginBottom:8,padding:10,border:'1px solid #e2e8ee',borderRadius:7}}>
        <label><span style={label}>Full Name *</span><input style={input} value={p.name} onChange={e=>updatePerson('director',i,'name',e.target.value)}/></label>
        <label><span style={label}>Country *</span><input style={input} value={p.country} onChange={e=>updatePerson('director',i,'country',e.target.value)}/></label>
        <label><span style={label}>ID / Passport Reference</span><input style={input} value={p.idRef} onChange={e=>updatePerson('director',i,'idRef',e.target.value)}/></label>
        {directors.length>1&&<button className="btn" onClick={()=>removePerson('director',i)}>Remove</button>}
      </div>)}
      <button className="btn" onClick={()=>addPerson('director')}>Add Director / Signatory</button>

      <h3>5. Banking & expected forwarding activity</h3>
      <div style={grid}>
        <label><span style={label}>Bank Name</span><input style={input} value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})}/></label>
        <label><span style={label}>Bank Country</span><input maxLength={2} style={input} value={form.bankCountry} onChange={e=>setForm({...form,bankCountry:e.target.value})}/></label>
        <label><span style={label}>Account Name</span><input style={input} value={form.bankAccountName} onChange={e=>setForm({...form,bankAccountName:e.target.value})}/></label>
        <label><span style={label}>Bank / IBAN Reference</span><input style={input} value={form.bankAccountRef} onChange={e=>setForm({...form,bankAccountRef:e.target.value})}/></label>
        <label><span style={label}>Expected Trade Lanes</span><input style={input} value={form.expectedTradeLanes} onChange={e=>setForm({...form,expectedTradeLanes:e.target.value})} placeholder="NLRTM-AEJEA, CNSHA-NLRTM"/></label>
        <label><span style={label}>Expected Monthly Shipments</span><input type="number" min="0" style={input} value={form.expectedMonthlyShipments} onChange={e=>setForm({...form,expectedMonthlyShipments:e.target.value})}/></label>
      </div>
      <label style={{display:'flex',gap:8,marginTop:10}}><input type="checkbox" checked={form.dangerousGoods} onChange={e=>setForm({...form,dangerousGoods:e.target.checked})}/> We expect to ship dangerous goods / regulated cargo.</label>

      <h3>6. KYC document checklist</h3>
      <div style={{display:'grid',gap:7}}>
        {requiredDocs.map(d=><label key={d} style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={documents.includes(d)} onChange={e=>setDocuments(x=>e.target.checked?[...x,d]:x.filter(v=>v!==d))}/>{d}</label>)}
      </div>
      <div className="sub" style={{marginTop:7}}>This registration records the KYC document checklist. Secure document-file upload can be attached to the ANC document-storage workflow separately.</div>

      <h3>7. Declarations & terms</h3>
      <div style={{display:'grid',gap:8}}>
        <label style={{display:'flex',gap:8}}><input type="checkbox" checked={form.sanctionsDeclaration} onChange={e=>setForm({...form,sanctionsDeclaration:e.target.checked})}/> I confirm the company, directors and beneficial owners comply with sanctions / restricted-party declarations.</label>
        <label style={{display:'flex',gap:8}}><input type="checkbox" checked={form.termsAccepted} onChange={e=>setForm({...form,termsAccepted:e.target.checked})}/> I accept the ANC customer registration and Forwarding terms.</label>
        <label style={{display:'flex',gap:8}}><input type="checkbox" checked={form.privacyAccepted} onChange={e=>setForm({...form,privacyAccepted:e.target.checked})}/> I accept the privacy and KYC-data processing requirements.</label>
      </div>
      <div style={{textAlign:'right',marginTop:14}}><button className="btn" disabled={busy} onClick={submit}>{busy?'Submitting...':'Submit Customer Registration & KYC'}</button></div>
    </div>}

    <div className="card">
      <h3 style={{marginTop:0}}>Check Registration Status</h3>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input style={{...input,maxWidth:360}} value={statusRef} onChange={e=>setStatusRef(e.target.value)} placeholder="ANC-REG-..."/><button className="btn" disabled={busy||!statusRef.trim()} onClick={checkStatus}>Check Status</button></div>
      <div className="sub" style={{marginTop:8}}>After approval, ANC issues your permanent Customer Reference and provisions Forwarding access against that customer record.</div>
    </div>
  </main>;
}
