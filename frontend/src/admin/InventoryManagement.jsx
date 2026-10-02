import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, PackagePlus, RefreshCw, Search } from 'lucide-react';
import './inventory.css';

const API=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
async function request(path,token,options={}){const response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}),...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'Request failed');return data;}
const movementLabels={RECEIPT:'Receive stock',ADJUSTMENT_IN:'Adjustment in',ADJUSTMENT_OUT:'Adjustment out',WASTE:'Waste',RETURN:'Return'};
const displayQty=v=>Number(v).toFixed(3).replace(/\.000$/,'');
const locationKeyForBranch=id=>'BRANCH:'+id;

export default function InventoryManagement({adminToken,onBack}){
 const [branches,setBranches]=useState([]),[items,setItems]=useState([]),[stock,setStock]=useState([]),[movements,setMovements]=useState([]);
 const [locationKey,setLocationKey]=useState('HEAD_OFFICE'),[itemId,setItemId]=useState(''),[search,setSearch]=useState(''),[lowStock,setLowStock]=useState(false);
 const [showItemForm,setShowItemForm]=useState(false),[showMovementForm,setShowMovementForm]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [itemForm,setItemForm]=useState({name:'',sku:'',unit:'kg',lowStockThreshold:'0'});
 const isHeadOffice=locationKey==='HEAD_OFFICE';
 const selectedBranchId=isHeadOffice?'':locationKey.replace('BRANCH:','');
 const selectedBranch=branches.find(b=>String(b.id)===selectedBranchId);
 const locationLabel=isHeadOffice?'Head Office':(selectedBranch?.name||'Branch');

 const load=async()=>{
  setLoading(true);setError('');
  try{
   const b=await request('/branches',adminToken),i=await request('/admin/inventory/items',adminToken);
   const locationParams=new URLSearchParams({locationType:isHeadOffice?'HEAD_OFFICE':'BRANCH'});
   if(!isHeadOffice)locationParams.set('branchId',selectedBranchId);
   if(search.trim())locationParams.set('search',search.trim());
   if(lowStock)locationParams.set('lowStock','true');
   const s=await request('/admin/inventory?'+locationParams.toString(),adminToken);
   const movementParams=new URLSearchParams({locationType:isHeadOffice?'HEAD_OFFICE':'BRANCH',limit:'80'});
   if(!isHeadOffice)movementParams.set('branchId',selectedBranchId);
   const m=await request('/admin/inventory/movements?'+movementParams.toString(),adminToken);
   setBranches(b.branches||[]);setItems(i.items||[]);setStock(s.items||[]);setMovements(m.movements||[]);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 };

 useEffect(()=>{load()},[locationKey,lowStock]);
 const filteredStock=useMemo(()=>stock.filter(r=>!itemId||String(r.id)===String(itemId)),[stock,itemId]);
 const lowCount=stock.filter(r=>Number(r.quantity)<=Number(r.low_stock_threshold)).length;

 const changeLocation=e=>{setLocationKey(e.target.value);setItemId('');setShowMovementForm(false);setError('');setMessage('');};
 const createItem=async e=>{e.preventDefault();setError('');setMessage('');try{await request('/admin/inventory/items',adminToken,{method:'POST',body:JSON.stringify({name:itemForm.name,sku:itemForm.sku,unit:itemForm.unit,lowStockThreshold:Number(itemForm.lowStockThreshold)})});setItemForm({name:'',sku:'',unit:'kg',lowStockThreshold:'0'});setShowItemForm(false);setMessage('Inventory item created.');await load()}catch(e){setError(e.message)}};
 const postMovement=async e=>{
  e.preventDefault();setError('');setMessage('');
  try{
   await request('/admin/inventory/movements',adminToken,{method:'POST',body:JSON.stringify({locationType:isHeadOffice?'HEAD_OFFICE':'BRANCH',branchId:isHeadOffice?null:Number(selectedBranchId),inventoryItemId:Number(e.currentTarget.inventoryItemId.value),movementType:e.currentTarget.movementType.value,quantity:Number(e.currentTarget.quantity.value),unitCost:e.currentTarget.unitCost.value===''?null:Number(e.currentTarget.unitCost.value),reason:e.currentTarget.reason.value})});
   setShowMovementForm(false);setMessage('Stock movement posted.');await load();
  }catch(e){setError(e.message)}
 };

 return <section className="admin-inventory-page">
  <header className="admin-inventory-header">
   <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft/> Back to Head Office</button>
   <div className="admin-inventory-heading"><span className="admin-panel-eyebrow">INVENTORY • {isHeadOffice?'HEAD OFFICE':'BRANCH'}</span><h1>{locationLabel} Inventory</h1><p>View and control stock only for the selected inventory location.</p></div>
   <div className="admin-inventory-actions"><button className="admin-secondary-action" type="button" onClick={load}><RefreshCw/> Refresh</button><button className="admin-primary-action" type="button" onClick={()=>setShowMovementForm(v=>!v)}><PackagePlus/> Stock movement</button><button className="admin-primary-action" type="button" onClick={()=>setShowItemForm(v=>!v)}><ClipboardList/> New item</button></div>
  </header>

  <div className="admin-inventory-location-bar">
   <label><span>Inventory location</span><select value={locationKey} onChange={changeLocation}><option value="HEAD_OFFICE">Head Office</option>{branches.map(b=><option key={b.id} value={locationKeyForBranch(b.id)}>{b.name}</option>)}</select></label>
   <div><strong>{locationLabel}</strong><small>{isHeadOffice?'Central stock held by Head Office':'Branch-specific stock and movements'}</small></div>
  </div>

  <div className="admin-inventory-stats"><article><span>Tracked items</span><strong>{items.length}</strong></article><article><span>Visible stock items</span><strong>{filteredStock.length}</strong></article><article className={lowCount?'warning':''}><span>Low stock</span><strong>{lowCount}</strong></article><article><span>Recent movements</span><strong>{movements.length}</strong></article></div>

  {showItemForm&&<form className="admin-inventory-form" onSubmit={createItem}><div><span className="admin-panel-eyebrow">ITEM MASTER</span><h2>Add inventory item</h2><p className="admin-inventory-form-note">This creates a master inventory item. Stock is added separately to the selected location.</p></div><label>Name<input value={itemForm.name} onChange={e=>setItemForm(v=>({...v,name:e.target.value}))} placeholder="Chicken breast" required/></label><label>SKU<input value={itemForm.sku} onChange={e=>setItemForm(v=>({...v,sku:e.target.value}))} placeholder="Auto-generated if blank"/></label><label>Unit<select value={itemForm.unit} onChange={e=>setItemForm(v=>({...v,unit:e.target.value}))}><option>kg</option><option>g</option><option>ltr</option><option>ml</option><option>pcs</option><option>pack</option><option>box</option></select></label><label>Low-stock threshold<input type="number" min="0" step="0.001" value={itemForm.lowStockThreshold} onChange={e=>setItemForm(v=>({...v,lowStockThreshold:e.target.value}))}/></label><div className="admin-inventory-form-actions"><button className="admin-secondary-action" type="button" onClick={()=>setShowItemForm(false)}>Cancel</button><button className="admin-primary-action" type="submit">Create item</button></div></form>}

  {showMovementForm&&<form className="admin-inventory-form" onSubmit={postMovement}><div><span className="admin-panel-eyebrow">STOCK LEDGER • {locationLabel.toUpperCase()}</span><h2>Post stock movement</h2><p className="admin-inventory-form-note">This movement will affect <strong>{locationLabel}</strong> only.</p></div><label>Inventory item<select name="inventoryItemId" defaultValue="" required><option value="">Select item</option>{items.filter(i=>i.is_active).map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></label><label>Movement<select name="movementType" defaultValue="RECEIPT">{Object.entries(movementLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" required/></label><label>Unit cost<input name="unitCost" type="number" min="0" step="0.01" placeholder="Optional"/></label><label>Reason<input name="reason" placeholder="Required for adjustments/waste"/></label><div className="admin-inventory-form-actions"><button className="admin-secondary-action" type="button" onClick={()=>setShowMovementForm(false)}>Cancel</button><button className="admin-primary-action" type="submit">Post movement</button></div></form>}

  {error&&<div className="admin-inventory-alert error">{error}</div>}{message&&<div className="admin-inventory-alert success">{message}</div>}

  <div className="admin-inventory-toolbar"><label><span>Item</span><select value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">All items</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label className="admin-inventory-search"><span>Search</span><Search/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} placeholder="Search item or SKU"/></label><label className="admin-inventory-checkbox"><input type="checkbox" checked={lowStock} onChange={e=>setLowStock(e.target.checked)}/><span>Low stock only</span></label></div>

  <div className="admin-inventory-table-wrap">{loading?<p className="admin-inventory-empty">Loading {locationLabel.toLowerCase()} inventory…</p>:filteredStock.length?<table className="admin-inventory-table"><thead><tr><th>Item</th><th>SKU</th><th>On hand</th><th>Threshold</th><th>Status</th></tr></thead><tbody>{filteredStock.map(r=>{const low=Number(r.quantity)<=Number(r.low_stock_threshold);return <tr key={r.id}><td><strong>{r.name}</strong><small>{r.unit}</small></td><td>{r.sku}</td><td><strong>{displayQty(r.quantity)}</strong> {r.unit}</td><td>{displayQty(r.low_stock_threshold)} {r.unit}</td><td><span className={'admin-inventory-status '+(low?'low':'ok')}>{low?'LOW':'OK'}</span></td></tr>})}</tbody></table>:<p className="admin-inventory-empty">No inventory items match the current filters.</p>}</div>

  <section className="admin-inventory-history"><div className="admin-inventory-section-heading"><div><span className="admin-panel-eyebrow">AUDIT TRAIL • {locationLabel.toUpperCase()}</span><h2>Recent stock movements</h2></div></div><div className="admin-inventory-table-wrap">{movements.length?<table className="admin-inventory-table"><thead><tr><th>When</th><th>Item</th><th>Movement</th><th>Qty</th><th>Reason</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString()}</td><td><strong>{m.item_name}</strong><small>{m.sku}</small></td><td>{movementLabels[m.movement_type]||m.movement_type}</td><td>{displayQty(m.quantity)} {m.unit}</td><td>{m.reason||'—'}</td></tr>)}</tbody></table>:<p className="admin-inventory-empty">No stock movements for {locationLabel} yet.</p>}</div></section>
 </section>;
}
