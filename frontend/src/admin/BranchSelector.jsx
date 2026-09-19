import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Building2,MapPin,Plus} from 'lucide-react';
import BranchDashboard from './BranchDashboard';

const API=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
const api=path=>fetch(`${API}${path}`).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'Request failed');return data});

export default function BranchSelector() {
  const [view,setView]=useState('home'),[selectedBranch,setSelectedBranch]=useState(null),[branches,setBranches]=useState([]),[branchStatus,setBranchStatus]=useState('idle');
  const loadBranches=()=>{setBranchStatus('loading');api('/branches').then(data=>{setBranches(data.branches||[]);setBranchStatus('ready')}).catch(()=>setBranchStatus('error'))};
  useEffect(()=>{if(view==='existing'&&branchStatus==='idle')loadBranches()},[view,branchStatus]);
  if(view==='create')return <section className="admin-branch-placeholder admin-branch-state" aria-live="polite">
    <button className="admin-back-button" type="button" onClick={()=>setView('home')}><ArrowLeft/> Back to Branch Management</button>
    <span className="admin-panel-eyebrow">CREATE NEW BRANCH</span><div className="admin-state-icon"><Plus/></div>
    <h1>Branch creation is coming soon</h1><p>The branch onboarding setup will be available in the next step.</p>
  </section>;
  if(view==='branch'&&selectedBranch)return <BranchDashboard branch={selectedBranch} onBack={()=>setView('existing')}/>;
  if(view==='existing')return <section className="admin-existing-branches" aria-labelledby="admin-existing-title">
    <button className="admin-back-button" type="button" onClick={()=>setView('home')}><ArrowLeft/> Back to Branch Management</button>
    <div className="admin-branch-heading"><span className="admin-panel-eyebrow">EXISTING BRANCHES</span><h1 id="admin-existing-title">Your Branches</h1><p>Select a Shawarmaholics branch to view and manage its operations.</p></div>
    {branchStatus==='loading'&&<div className="admin-branch-feedback" role="status">Loading branches...</div>}
    {branchStatus==='error'&&<div className="admin-branch-feedback admin-branch-feedback-error" role="alert"><p>Unable to load branches.</p><button className="admin-retry-button" type="button" onClick={loadBranches}>Retry</button></div>}
    {branchStatus==='ready'&&!branches.length&&<div className="admin-branch-feedback" role="status">No active branches found.</div>}
    {branchStatus==='ready'&&branches.length>0&&<div className="admin-branch-list">{branches.map(branch=><button className="admin-existing-branch-card" type="button" key={branch.id} onClick={()=>{setSelectedBranch(branch);setView('branch')}}><span className="admin-branch-card-icon"><Building2/></span><span className="admin-existing-branch-copy"><strong>{branch.name}</strong><span className="admin-branch-type">{branch.type}</span><small><MapPin/> {branch.city}, {branch.state}</small><small className="admin-branch-code">{branch.code}</small><em>OPEN BRANCH <ArrowRight/></em></span></button>)}</div>}
  </section>;
  return <section className="admin-branch-management" aria-labelledby="admin-branches-title">
    <div className="admin-branch-heading">
      <span className="admin-panel-eyebrow">BRANCH MANAGEMENT</span>
      <h1 id="admin-branches-title">Manage your Shawarmaholics branches</h1>
      <p>Manage all your Shawarmaholics outlets and franchises from one central place.</p>
    </div>
    <div className="admin-branch-options">
      <button className="admin-branch-card" type="button" onClick={()=>setView('create')}>
        <span className="admin-branch-card-icon"><Plus/></span>
        <span className="admin-branch-card-copy"><strong>Create New Branch</strong><small>Add a new Shawarmaholics outlet or franchise.</small><em>CREATE BRANCH <ArrowRight/></em></span>
      </button>
      <button className="admin-branch-card" type="button" onClick={()=>setView('existing')}>
        <span className="admin-branch-card-icon"><Building2/></span>
        <span className="admin-branch-card-copy"><strong>Select Existing Branch</strong><small>View and manage an existing Shawarmaholics branch.</small><em>VIEW BRANCHES <ArrowRight/></em></span>
      </button>
    </div>
  </section>;
}
