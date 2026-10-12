import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, MapPin, Plus, Pencil, Power, Trash2, X } from 'lucide-react';
import BranchDashboard from './BranchDashboard';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const api = (path, token, opts = {}) => fetch(`${API}${path}`, {
  ...opts,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
}).then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Request failed'); return data; });

const emptyForm = { code:'', name:'', type:'OUTLET', address:'', city:'', state:'', country:'India', postal_code:'', timezone:'Asia/Kolkata' };

export default function BranchSelector({ adminToken }) {
  const [view,setView]=useState('home'), [selectedBranch,setSelectedBranch]=useState(null), [branches,setBranches]=useState([]), [status,setStatus]=useState('idle');
  const [form,setForm]=useState(emptyForm), [editing,setEditing]=useState(null), [formError,setFormError]=useState(''), [saving,setSaving]=useState(false), [actionId,setActionId]=useState(null);

  const loadBranches=()=>{setStatus('loading');api('/admin/branches',adminToken).then(d=>{setBranches(d.branches||[]);setStatus('ready')}).catch(e=>{setStatus('error');setFormError(e.message)})};
  useEffect(()=>{if(view==='existing')loadBranches()},[view]);
  const openCreate=()=>{setEditing(null);setForm(emptyForm);setFormError('');setView('create')};
  const openEdit=b=>{setEditing(b);setForm({code:b.code||'',name:b.name||'',type:b.type||'OUTLET',address:b.address||'',city:b.city||'',state:b.state||'',country:b.country||'India',postal_code:b.postal_code||'',timezone:b.timezone||'Asia/Kolkata'});setFormError('');setView('create')};
  const save=async e=>{e.preventDefault();setSaving(true);setFormError('');try{const result=await api(editing?'/admin/branches/'+editing.id:'/admin/branches',adminToken,{method:editing?'PATCH':'POST',body:JSON.stringify(form)});setSelectedBranch(result.branch);setView('existing');loadBranches()}catch(err){setFormError(err.message)}finally{setSaving(false)}};
  const changeStatus=async b=>{setActionId(b.id);setFormError('');try{await api(`/admin/branches/${b.id}/${b.is_active?'deactivate':'activate'}`,adminToken,{method:'PATCH'});loadBranches();if(selectedBranch?.id===b.id)setSelectedBranch({...b,is_active:!b.is_active})}catch(e){setFormError(e.message)}finally{setActionId(null)}};
  const remove=async b=>{if(!window.confirm(`Delete ${b.name}? This is allowed only when the branch has no dependent business data.`))return;setActionId(b.id);setFormError('');try{await api('/admin/branches/'+b.id,adminToken,{method:'DELETE'});loadBranches();setSelectedBranch(null)}catch(e){setFormError(e.message)}finally{setActionId(null)}};

  if(view==='create') return <section className="admin-branch-placeholder admin-branch-state admin-branch-form-page">
    <button className="admin-back-button" type="button" onClick={()=>setView('existing')}><ArrowLeft/> Back to Branches</button>
    <header className="admin-branch-form-heading">
      <span className="admin-panel-eyebrow">{editing?'EDIT BRANCH':'CREATE NEW BRANCH'}</span>
      <h1>{editing?'Edit branch':'Create a new branch'}</h1>
      <p>{editing?'Update the registered branch identity and location details.':'Create the branch identity that will be used by its operational systems.'}</p>
    </header>
    <form className="admin-branch-form" onSubmit={save}>
      {[
        ['code','Branch Code','e.g. SH-JU-001'],['name','Branch Name','e.g. Juhu'],['city','City','e.g. Mumbai'],['state','State','e.g. Maharashtra'],['country','Country','e.g. India'],['postal_code','Postal Code','e.g. 590001'],['timezone','Timezone','e.g. Asia/Kolkata'],['address','Address','Full branch address']
      ].map(([key,label,placeholder])=><label className="admin-branch-field" key={key}><span>{label}{['code','name','city','country','timezone'].includes(key)&&<i aria-hidden="true"> *</i>}</span><input value={form[key]||''} placeholder={placeholder} onChange={e=>setForm(x=>({...x,[key]:e.target.value}))} required={['code','name','city','country','timezone'].includes(key)} /></label>)}
      <label className="admin-branch-field"><span>Branch Type</span><select value={form.type} onChange={e=>setForm(x=>({...x,type:e.target.value}))}><option value="OUTLET">OUTLET</option><option value="FRANCHISE">FRANCHISE</option></select></label>
      {formError&&<div className="admin-branch-form-error" role="alert">{formError}</div>}
      <div className="admin-branch-form-actions"><button type="button" className="admin-branch-cancel" onClick={()=>setView('existing')}>Cancel</button><button className="admin-branch-submit" type="submit" disabled={saving}>{saving?'Saving...':editing?'Save Changes':'Create Branch'}</button></div>
    </form>
  </section>;

  if(view==='branch'&&selectedBranch)return <BranchDashboard branch={selectedBranch} adminToken={adminToken} onBack={()=>setView('existing')}/>;

  if(view==='existing') return <section className="admin-existing-branches">
    <button className="admin-back-button" type="button" onClick={()=>setView('home')}><ArrowLeft/> Back to Branch Management</button>
    <div className="admin-branch-heading"><span className="admin-panel-eyebrow">BRANCH REGISTRY</span><h1>All Branches</h1><p>Head Office controls the lifecycle of every outlet and franchise.</p></div>
    {formError&&<div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{formError}<button type="button" onClick={()=>setFormError('')}><X/></button></div>}
    {status==='loading'&&<div className="admin-branch-feedback">Loading branches...</div>}
    {status==='error'&&<div className="admin-branch-feedback admin-branch-feedback-error">Unable to load branches. <button type="button" onClick={loadBranches}>Retry</button></div>}
    {status==='ready'&&<div className="admin-branch-list">{branches.map(b=><article key={b.id} className="admin-existing-branch-card" style={{display:'flex',alignItems:'stretch',cursor:'default'}}>
      <button type="button" onClick={()=>{setSelectedBranch(b);setView('branch')}} style={{flex:1,textAlign:'left',background:'transparent',border:0,cursor:'pointer'}}><span className="admin-branch-card-icon"><Building2/></span><span className="admin-existing-branch-copy"><strong>{b.name}</strong><span className="admin-branch-type">{b.type}</span><small><MapPin/> {b.city}, {b.state||b.country}</small><small className="admin-branch-code">{b.code}</small><em>{b.is_active?'ACTIVE':'INACTIVE'} <ArrowRight/></em></span></button>
      <div style={{display:'flex',flexDirection:'column',gap:6,padding:12}}><button title="Edit branch" type="button" onClick={()=>openEdit(b)} disabled={actionId===b.id}><Pencil/></button><button title={b.is_active?'Deactivate':'Activate'} type="button" onClick={()=>changeStatus(b)} disabled={actionId===b.id}><Power/></button><button title="Delete branch" type="button" onClick={()=>remove(b)} disabled={actionId===b.id}><Trash2/></button></div>
    </article>)}</div>}
    {status==='ready'&&!branches.length&&<div className="admin-branch-feedback">No branches have been created yet.</div>}
  </section>;

  return <section className="admin-branch-management">
    <div className="admin-branch-heading"><span className="admin-panel-eyebrow">BRANCH MANAGEMENT</span><h1>Manage your Shawarmaholics branches</h1><p>Create, edit, activate, deactivate and safely retire branch locations from Head Office.</p></div>
    <div className="admin-branch-options">
      <button className="admin-branch-card" type="button" onClick={openCreate}><span className="admin-branch-card-icon"><Plus/></span><span className="admin-branch-card-copy"><strong>Create New Branch</strong><small>Register a new outlet or franchise with a permanent location identity.</small><em>CREATE BRANCH <ArrowRight/></em></span></button>
      <button className="admin-branch-card" type="button" onClick={()=>setView('existing')}><span className="admin-branch-card-icon"><Building2/></span><span className="admin-branch-card-copy"><strong>Branch Registry</strong><small>View and manage every active or inactive branch.</small><em>VIEW REGISTRY <ArrowRight/></em></span></button>
    </div>
  </section>;
}
