import React, { useEffect } from 'react';
import { AlertTriangle, Bell, CheckCircle2, PackageX, X } from 'lucide-react';
import { ALERT_TTL } from './kitchenAlerts';

const icons = { newOrder: Bell, lowStock: AlertTriangle, outOfStock: PackageX, delayed: AlertTriangle };
const labels = { newOrder: 'NEW ORDER', lowStock: 'LOW STOCK', outOfStock: 'OUT OF STOCK', delayed: 'ORDER DELAYED' };

function AlertToast({ alert, onDismiss }) {
  useEffect(() => { const id = setTimeout(() => onDismiss(alert.id), ALERT_TTL[alert.type] || 7000); return () => clearTimeout(id) }, [alert.id, alert.type, onDismiss]);
  const Icon = icons[alert.type] || Bell;
  return <article className={`kitchen-alert-toast ${alert.type}`} role="alert" aria-live={alert.type === 'newOrder' ? 'polite' : 'assertive'}><div className="kitchen-alert-icon"><Icon /></div><div><b>{labels[alert.type]}</b><strong>{alert.title}</strong><p>{alert.message}</p></div><button className="kitchen-alert-close" onClick={() => onDismiss(alert.id)} aria-label={`Dismiss ${labels[alert.type].toLowerCase()} alert`}><X /></button></article>;
}

export default function KitchenAlerts({ alerts, onDismiss, attention }) {
  const hasAttention = attention.delayed > 0 || attention.out > 0;
  return <>{hasAttention && <div className="kitchen-attention" role="status"><AlertTriangle /><div><b>KITCHEN ATTENTION</b><span>{attention.delayed > 0 && `${attention.delayed} Delayed Order${attention.delayed > 1 ? 's' : ''}`}{attention.delayed > 0 && attention.out > 0 ? ' · ' : ''}{attention.out > 0 && `${attention.out} Out of Stock`}</span></div></div>}<div className="kitchen-alerts" aria-label="Kitchen alerts">{alerts.map(alert => <AlertToast key={alert.id} alert={alert} onDismiss={onDismiss} />)}</div></>;
}
