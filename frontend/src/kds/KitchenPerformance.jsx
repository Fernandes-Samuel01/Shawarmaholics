import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Target } from 'lucide-react';
import { kitchenStatus } from './performanceUtils';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function MetricCard({ label, value, detail, icon: Icon, tone = '' }) {
  return <article className={`performance-metric ${tone}`}><div className="performance-metric-icon"><Icon /></div><div><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div></article>;
}

export default function KitchenPerformance() {
  const [state, setState] = useState({ status: 'loading', data: null });
  const load = useCallback(async () => {
    setState({ status: 'loading', data: null });
    try { const response = await fetch(`${API}/kitchen/performance?period=today`); if (!response.ok) throw new Error('Request failed'); setState({ status: 'ready', data: await response.json() }); }
    catch { setState({ status: 'error', data: null }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (state.status !== 'ready') return; const id = setInterval(load, 60000); return () => clearInterval(id); }, [load, state.status]);

  if (state.status === 'loading') return <div className="kds-performance"><div className="performance-state"><RefreshCw className="spin" /><h1>Kitchen performance</h1><p>Loading kitchen performance...</p></div></div>;
  if (state.status === 'error') return <div className="kds-performance"><div className="performance-state"><AlertTriangle /><h1>Unable to load kitchen performance</h1><p>Check the kitchen connection and try again.</p><button className="primary" onClick={load}><RefreshCw /> RETRY</button></div></div>;

  const data = state.data || {}; const completed = Number(data.completed_orders) || 0; const status = kitchenStatus(data); const empty = completed === 0;
  return <div className="kds-performance"><header className="performance-header"><div><span className="performance-eyebrow">LIVE KITCHEN OPERATIONS</span><h1>Kitchen <em>performance</em></h1><p>Today · Real preparation metrics from completed orders</p></div><button className="performance-refresh" onClick={load} aria-label="Refresh kitchen performance"><RefreshCw /> Refresh</button></header>{empty ? <section className="performance-empty"><Clock3 /><h2>No completed orders yet today.</h2><p>Performance metrics will appear once orders are completed.</p></section> : <><section className="performance-metrics" aria-label="Today's kitchen metrics"><MetricCard label="COMPLETED TODAY" value={data.completed_orders} detail="Kitchen output" icon={CheckCircle2} /><MetricCard label="AVG PREP TIME" value={data.average_prep_time_formatted || '—'} detail={`Target: ${data.target_prep_time_formatted || '08:00'}`} icon={Clock3} /><MetricCard label="ON-TIME RATE" value={`${data.on_time_percentage || 0}%`} detail={`${data.on_time_orders || 0} orders completed within target`} icon={Target} tone={Number(data.on_time_percentage) >= 90 ? 'positive' : 'attention'} /><MetricCard label="DELAYED TODAY" value={data.delayed_orders || 0} detail="Orders exceeded target time" icon={AlertTriangle} tone={Number(data.delayed_orders) > 0 ? 'attention' : 'positive'} /></section><section className={`performance-status ${status.key}`}><div className="performance-status-icon">{status.icon}</div><div><span className="performance-eyebrow">TODAY'S KITCHEN STATUS</span><h2>{status.label}</h2><p>{status.message}</p><small>Target preparation time: {data.target_prep_time_formatted || '08:00'}</small></div></section></>}</div>;
}
