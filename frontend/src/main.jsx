import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Banknote, Check, ChefHat, Clock3, Coffee, Flame, LayoutDashboard, Menu, Package, Plus, ShoppingBag, Smartphone, Sparkles, Utensils, X } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { io } from 'socket.io-client';
import { I18nProvider, languages, useI18n } from './i18n';
import { calculateCustomizationPrice } from './pricing.mjs';
import './styles.css';
import './dashboard.css';
import './order-type.css';
import './payment.css';
import KitchenDisplay from './kds/KitchenDisplay';
import AdminPanel from './admin/AdminPanel';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const food = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&q=85`;
const fallbackCategories = ['Featured', 'Shawarma Wraps', 'Platters', 'Loaded Fries', 'Sides & Bites', 'Beverages', 'Desserts', 'Combos'];
const demoMenu = [
    { id: 1, name: 'Classic Chicken Shawarma', description: 'Juicy chicken, garlic sauce, pickles & crisp veggies.', price: 199, category: 'Shawarma Wraps', bestseller: true, image_url: food('photo-1547592180-85f173990554') },
    { id: 2, name: 'Spicy Chicken Shawarma', description: 'Fire-grilled chicken with spicy garlic & fresh herbs.', price: 219, category: 'Shawarma Wraps', image_url: food('photo-1513639776629-7b61b0ac49cb') },
    { id: 3, name: 'Falafel Wrap', description: 'Golden falafel, tahini, salad and pickled turnip.', price: 189, category: 'Shawarma Wraps', veg: true, image_url: food('photo-1547056961-3c0d5a3d4f25') },
    { id: 4, name: 'Loaded Fries', description: 'Seasoned fries, cheese sauce & signature toppings.', price: 179, category: 'Loaded Fries', image_url: food('photo-1573080496219-bb080dd4f877') },
    { id: 5, name: 'Shawarma Platter', description: 'Chicken shawarma, rice, pita and three house dips.', price: 249, category: 'Platters', image_url: food('photo-1529042410759-befb1204b468') },
    { id: 6, name: 'Mint Cooler', description: 'Fresh mint, citrus & fizz.', price: 99, category: 'Beverages', veg: true, image_url: food('photo-1551024709-8f23befc6f87') }
];
const rupee = n => `₹${Number(n).toLocaleString('en-IN')}`;
function api(path, opts = {}) { return fetch(API + path, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts }).then(r => { if (!r.ok) throw Error('Request failed'); return r.json() }) }
function Brand({ light = false }) { return <div className={'brand ' + (light ? 'light' : '')}><span>SHAWARMA</span><b>HOLICS</b><small>WRAPS. LOADED. OBSESSED.</small></div> }
function Pill({ children, tone = '' }) { return <span className={'pill ' + tone}>{children}</span> }
function Kiosk() {
    const { language, setLanguage, t } = useI18n();
    const kioskBranchId = new URLSearchParams(window.location.search).get('branchId');
    const [screen, setScreen] = useState('welcome'), [type, setType] = useState('EAT HERE'), [menu, setMenu] = useState([]), [categories, setCategories] = useState([]), [settings, setSettings] = useState(null), [branch, setBranch] = useState(null), [cat, setCat] = useState('Featured'), [menuLoading, setMenuLoading] = useState(true), [menuError, setMenuError] = useState(''), [cart, setCart] = useState([]), [chosen, setChosen] = useState(null), [qty, setQty] = useState(1), [selections, setSelections] = useState({}), [specialRequest, setSpecialRequest] = useState(''), [submitting, setSubmitting] = useState(false), [order, setOrder] = useState(null), [orderTypeOpen, setOrderTypeOpen] = useState(false), [paymentMethod, setPaymentMethod] = useState(null), [paymentError, setPaymentError] = useState('');

    useEffect(() => {
        api('/settings/public' + (kioskBranchId ? `?locationType=BRANCH&branchId=${encodeURIComponent(kioskBranchId)}` : '?locationType=HEAD_OFFICE')).then(result => setSettings(result.settings || {})).catch(() => setSettings(null));
    }, []);

    useEffect(() => {
        const socket = io(API.replace('/api', ''));
        const matchesLocation = payload => kioskBranchId
            ? payload?.locationType === 'BRANCH' && String(payload.branchId || '') === String(kioskBranchId)
            : payload?.locationType === 'HEAD_OFFICE' && payload?.branchId == null;
        const handleSettingsUpdate = payload => {
            if (matchesLocation(payload)) setSettings(payload.settings || {});
        };
        socket.on('settings:updated', handleSettingsUpdate);
        return () => socket.disconnect();
    }, [kioskBranchId]);

    useEffect(() => {
        setMenuLoading(true);
        setMenuError('');
        api('/kiosk/menu' + (kioskBranchId ? `?branchId=${encodeURIComponent(kioskBranchId)}` : ''))
            .then(result => {
                setBranch(result.branch || null);
                setCategories(result.categories || []);
                setMenu((result.items || []).map(item => ({
                    ...item,
                    image_url: item.image_url || food('photo-1547592180-85f173990554'),
                    vegetarian: Boolean(item.vegetarian),
                    customizationGroups: item.customization_groups || []
                })));
            })
            .catch(() => setMenuError('Unable to load the menu. Please try again.'))
            .finally(() => setMenuLoading(false));
    }, [kioskBranchId]);

    const selectedGroups = (chosen?.customizationGroups || []).map(group => ({
        ...group,
        selectedOptions: (selections[group.id] || []).map(optionId => group.options.find(option => option.id === optionId)).filter(Boolean)
    }));
    const customizationTotal = selectedGroups.reduce((sum, group) => sum + group.selectedOptions.reduce((groupSum, option) => groupSum + Number(option.price || 0), 0), 0);
    const pricing = {
        baseTotal: Number(chosen?.price || 0) * qty,
        customizationTotal: customizationTotal * qty,
        finalTotal: (Number(chosen?.price || 0) + customizationTotal) * qty
    };
    const total = cart.reduce((sum, item) => sum + Number(item.finalTotal || 0), 0);

    const selectionValid = group => {
        const count = (selections[group.id] || []).length;
        return count >= Number(group.minSelections || 0) && count <= Number(group.maxSelections || 0);
    };
    const canAddToCart = chosen?.customizationGroups?.every(selectionValid) ?? true;

    const chooseOption = (group, option) => {
        setSelections(current => {
            const selected = current[group.id] || [];
            if (Number(group.maxSelections) <= 1) return { ...current, [group.id]: selected.includes(option.id) ? [] : [option.id] };
            if (selected.includes(option.id)) return { ...current, [group.id]: selected.filter(id => id !== option.id) };
            if (selected.length >= Number(group.maxSelections)) return current;
            return { ...current, [group.id]: [...selected, option.id] };
        });
    };

    const prepareChosenItem = item => {
        setChosen(item);
        setQty(1);
        setSelections(Object.fromEntries((item.customizationGroups || []).map(group => [group.id, []])));
        setSpecialRequest('');
        setScreen('customize');
    };

    const buildCartItem = () => {
        const sauceGroup = selectedGroups.find(group => group.type === 'SAUCE');
        const sauce = sauceGroup?.selectedOptions?.[0] ? { name: sauceGroup.selectedOptions[0].name, price: Number(sauceGroup.selectedOptions[0].price || 0) } : null;
        const extras = selectedGroups.filter(group => group.type === 'EXTRA' || group.type === 'ADD_ON').flatMap(group => group.selectedOptions.map(option => ({ name: option.name, price: Number(option.price || 0), groupId: group.id })));
        return {
            ...chosen,
            key: Date.now(),
            basePrice: Number(chosen.price || 0),
            customizationGroups: selectedGroups,
            sauce,
            extras,
            specialRequest,
            qty,
            ...pricing
        };
    };

    const add = () => {
        if (!canAddToCart) return;
        setCart(items => [...items, buildCartItem()]);
        setChosen(null);
        setScreen('menu');
    };

    const repriceCartItem = (item, quantity) => {
        const customizationPerUnit = Number(item.customizationTotal || 0) / Number(item.qty || 1);
        return {
            ...item,
            qty: quantity,
            baseTotal: Number(item.basePrice || 0) * quantity,
            customizationTotal: customizationPerUnit * quantity,
            finalTotal: (Number(item.basePrice || 0) + customizationPerUnit) * quantity
        };
    };

    const createOrder = async (method, paymentStatus, orderStatus) => {
        setSubmitting(true);
        setPaymentError('');
        try {
            const payload = {
                orderType: type,
                branchId: kioskBranchId ? Number(kioskBranchId) : undefined,
                paymentMethod: method,
                paymentStatus,
                orderStatus,
                items: cart.map(item => ({
                    menuItemId: item.id,
                    quantity: item.qty,
                    customizations: {
                        groups: (item.customizationGroups || []).map(group => ({
                            groupId: group.id,
                            optionIds: group.selectedOptions.map(option => option.id)
                        })),
                        specialRequest: item.specialRequest || ''
                    }
                }))
            };
            const result = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
            setOrder({ ...result.order, items: cart, total: Number(result.order.total), payment_method: method, payment_status: paymentStatus, status: orderStatus });
            return true;
        } catch {
            setPaymentError('Unable to create your order. Please try again.');
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const resetKioskSession = () => {
        setCart([]);
        setChosen(null);
        setQty(1);
        setSelections({});
        setSpecialRequest('');
        setSubmitting(false);
        setOrder(null);
        setOrderTypeOpen(false);
        setPaymentMethod(null);
        setPaymentError('');
        setType('EAT HERE');
        setCat('Featured');
        setScreen('welcome');
    };

    const typeLabel = type === 'EAT HERE' ? t.eat : t.parcel;
    const orderTypes = (settings?.['orders.eat_here_enabled'] === false ? [] : [[t.eat, 'EAT HERE']]).concat(settings?.['orders.take_parcel_enabled'] === false ? [] : [[t.parcel, 'TAKE PARCEL']]);
    useEffect(() => {
        if (!settings) return;
        if (type === 'EAT HERE' && settings['orders.eat_here_enabled'] === false) setType('TAKE PARCEL');
        if (type === 'TAKE PARCEL' && settings['orders.take_parcel_enabled'] === false) setType('EAT HERE');
    }, [settings, type]);
    const paymentOptions = [[t.payUpi, 'upi', Smartphone, t.upiHint]].filter(() => settings?.['orders.upi_enabled'] !== false).concat([[t.payCash, 'cash', Banknote, t.cashHint]].filter(() => settings?.['orders.cash_enabled'] !== false));
    const categoryNames = ['Featured', ...categories.map(category => category.name)];
    const visibleMenu = menu.filter(item => cat === 'Featured' || item.category_name === cat);
    const shell = (content, showActions = true) => <main className="kiosk"><header><Brand />{showActions && <div className="header-actions"><div className="order-type-control"><button className="text-btn" onClick={() => setOrderTypeOpen(open => !open)} aria-expanded={orderTypeOpen}>{typeLabel} · {t.change}</button>{orderTypeOpen && <div className="order-type-picker" role="menu">{orderTypes.map(([label, value]) => <button className={type === value ? 'selected' : ''} onClick={() => { setType(value); setOrderTypeOpen(false) }} role="menuitemradio" aria-checked={type === value} key={value}>{label}<Check /></button>)}</div>}</div><button className="cart-btn" onClick={() => setScreen('cart')}><ShoppingBag size={20} /> {t.cart} <b>{cart.length}</b></button></div>}</header>{content}</main>;

    if (settings?.['kiosk.enabled'] === false) return <main className="welcome"><div className="welcome-center"><Pill>{branch ? `${branch.name} · ${branch.code}` : t.location}</Pill><h1>Ordering is temporarily unavailable.</h1><p>Please see a team member for assistance.</p></div></main>;

    if (screen === 'welcome') return <main className={'welcome language-' + language}><div className="orb orb1" /><div className="orb orb2" /><div className="welcome-top"><Brand light /></div><div className="welcome-center"><Pill>{branch ? `${branch.name} · ${branch.code}` : t.location}</Pill><h1>{t.welcomeTitle[0]}<br /><em>{t.welcomeTitle[1]}</em></h1><p>{t.welcomeSubtitle}</p><button className="primary huge" onClick={() => setScreen('type')}>{t.startOrder} <ArrowRight /></button><div className="languages" aria-label="Choose language">{languages.map(x => <button onClick={() => setLanguage(x.code)} className={language === x.code ? 'selected' : ''} key={x.code} aria-pressed={language === x.code}><b>{x.short}</b><small>{x.label}</small></button>)}</div></div></main>;

    if (screen === 'type') return shell(<section className="type-screen"><button className="back" onClick={() => setScreen('welcome')}><ArrowLeft /> {t.back}</button><h1>{t.how}</h1><p>{t.choose}</p><div className="type-cards">{[[t.eat, Utensils, t.eatDesc, 'EAT HERE'], [t.parcel, ShoppingBag, t.parcelDesc, 'TAKE PARCEL']].filter(([, , , value]) => orderTypes.some(([, allowed]) => allowed === value)).map(([label, I, desc, value]) => <button onClick={() => { setType(value); setScreen('menu') }} className="type-card" key={value}><I /><h2>{label}</h2><p>{desc}</p><span>{t.chooseAction} <ArrowRight /></span></button>)}</div></section>, false);

    if (screen === 'customize' && chosen) return shell(<section className="customize"><button className="back" onClick={() => setScreen('menu')}><ArrowLeft /> {t.back}</button><div className="custom-grid"><div className="product-focus"><img src={chosen.image_url} />{settings?.['kiosk.show_vegetarian'] !== false && <Pill>{chosen.vegetarian ? t.vegetarian : t.signature}</Pill>}<h1>{chosen.name}</h1><p>{chosen.description}</p>{settings?.['kiosk.show_preparation_time'] !== false && Number(chosen.preparation_minutes) > 0 && <small>Preparation time: {chosen.preparation_minutes} min</small>}<b>{rupee(chosen.price)}</b></div><div className="custom-options"><Pill>{t.makeYours}</Pill><h2>{t.customize}</h2>{chosen.customizationGroups?.length ? chosen.customizationGroups.map(group => <div className="customization-group" key={group.id}><label>{group.name}{group.required ? ' *' : ''}</label><small>{group.minSelections || group.required ? 'Select ' + group.minSelections + (group.maxSelections > group.minSelections ? '–' + group.maxSelections : '') : 'Optional'} </small><div className="choices">{group.options.map(option => { const selected = (selections[group.id] || []).includes(option.id); return <button key={option.id} className={selected ? 'chosen' : ''} onClick={() => chooseOption(group, option)} disabled={!selected && (selections[group.id] || []).length >= group.maxSelections}><span>{option.name}</span>{Number(option.price) > 0 && <b>+{rupee(option.price)}</b>}</button> })}</div>{!selectionValid(group) && <small className="payment-error">{group.required ? 'Please make the required selection.' : 'Please select the allowed number of options.'}</small>}</div>) : <p>{t.customize}: No customization options are configured for this item.</p>}<label>{t.request}</label><input placeholder={t.requestPlaceholder} value={specialRequest} onChange={event => setSpecialRequest(event.target.value)} /><div className="addbar"><div className="quantity"><button onClick={() => setQty(Math.max(1, qty - 1))}>−</button><b>{qty}</b><button onClick={() => setQty(qty + 1)}>+</button></div><button className="primary" disabled={!canAddToCart} onClick={add}>{t.addCart} · {rupee(pricing.finalTotal)} <ArrowRight /></button></div></div></div></section>);

    if (screen === 'cart') return shell(<section className="cart-screen"><button className="back" onClick={() => setScreen('menu')}><ArrowLeft /> {t.back}</button><Pill>{t.yourOrder}</Pill><h1>{t.closer}</h1><div className="cart-layout"><div>{cart.length ? cart.map(item => <article className="cart-item" key={item.key}><img src={item.image_url} /><div><h3>{item.name}</h3><p>{item.customizationGroups?.flatMap(group => group.selectedOptions.map(option => option.name)).join(' · ')}{item.specialRequest ? ' · ' + item.specialRequest : ''}</p><div className="quantity"><button onClick={() => setCart(c => c.map(x => x.key === item.key ? repriceCartItem(x, Math.max(1, x.qty - 1)) : x))}>−</button><b>{item.qty}</b><button onClick={() => setCart(c => c.map(x => x.key === item.key ? repriceCartItem(x, x.qty + 1) : x))}>+</button></div></div><b>{rupee(item.finalTotal)}</b><button className="icon" onClick={() => setCart(c => c.filter(x => x.key !== item.key))}><X /></button></article>) : <div className="empty"><ShoppingBag /><h2>{t.emptyCart}</h2><p>{t.emptyCartDesc}</p></div>}</div><aside className="summary"><Pill>{type}</Pill><h2>{t.summary}</h2><div><span>{t.items}</span><b>{cart.reduce((s, x) => s + x.qty, 0)}</b></div><div><span>{t.subtotal}</span><b>{rupee(total)}</b></div><div className="total"><span>{t.total}</span><b>{rupee(total)}</b></div><button className="primary" disabled={!cart.length} onClick={() => setScreen('payment')}>{t.checkout} <ArrowRight /></button><button className="secondary" onClick={() => setScreen('menu')}>{t.continue}</button></aside></div></section>);

    if (screen === 'payment') return shell(<section className="payment-screen"><button className="back" onClick={() => setScreen('cart')}><ArrowLeft /> {t.backToCart}</button><div className="payment-layout"><div className="payment-intro"><Pill>{t.orderingFor} · {typeLabel}</Pill><h1>{t.choosePayment}</h1><p>{t.payQuestion}</p><div className="payment-total"><small>{t.totalToPay}</small><strong>{rupee(total)}</strong></div></div><div className="payment-options">{paymentOptions.map(([label, method, Icon, hint]) => method === 'upi' ? <button className="payment-card" key={method} onClick={() => { setPaymentMethod(method); setScreen('upi-payment') }}><span className="payment-icon"><Icon /></span><span><b>{label}</b><small>{hint}</small></span><ArrowRight /></button> : <button className="payment-card" key={method} onClick={async () => { setPaymentMethod(method); if (await createOrder(method, 'pending', 'awaiting_payment')) setScreen('cash-payment') }}><span className="payment-icon"><Icon /></span><span><b>{label}</b><small>{hint}</small></span><ArrowRight /></button>)}</div>{paymentError && <p className="payment-error">{paymentError}</p>}</div><p className="payment-trust"><Check /> <b>{t.securePayment}</b><span /> {t.paymentNotice}</p></section>);

    if (screen === 'upi-payment') return shell(<section className="payment-screen payment-pending"><button className="back" onClick={() => setScreen('payment')}><ArrowLeft /> {t.paymentBack}</button><div className="pending-card"><span className="payment-icon"><Smartphone /></span><Pill>{t.paymentReady}</Pill><h1>{t.payUpi}</h1><p>{t.upiReady}</p><strong>{rupee(total)}</strong><button className="primary" disabled={submitting} onClick={async () => { if (await createOrder('upi', 'paid', 'confirmed')) setScreen('confirmed') }}>{submitting ? t.placing : t.paymentDone + ' ✓'}</button>{paymentError && <p className="payment-error">{paymentError}</p>}</div></section>);

    if (screen === 'cash-payment') return shell(<section className="payment-screen payment-pending"><button className="back" onClick={() => setScreen('payment')}><ArrowLeft /> {t.paymentBack}</button><div className="pending-card"><span className="payment-icon"><Banknote /></span><Pill>{t.awaitingPayment}</Pill><h1>{t.payCash}</h1><p>{t.cashReady}</p><div className="cash-status"><span>{typeLabel}</span><span>{t.totalToPay}<b>{rupee(order?.total ?? total)}</b></span><span>{t.pending} · {t.awaitingPayment}</span></div><button className="primary new-order-cash" onClick={resetKioskSession}>{t.newOrder} <ArrowRight /></button></div></section>);

    if (screen === 'confirmed') return <main className="confirmation detailed-confirmation"><div className="check"><Check /></div><Pill>{t.payUpi} · {t.paid}</Pill><h1>{t.confirmedTitle[0]}<br /><em>{t.confirmedTitle[1]}</em></h1><p>{t.thankYou}</p><div className="order-number"><small>{t.orderNumber}</small><strong>#{order?.order_number}</strong><span>{typeLabel} · {t.confirmedStatus}</span></div><div className="confirmed-order"><div className="confirmed-breakdowns">{order?.items?.map(item => <article className="confirmed-item" key={item.key}><h3>{item.name}</h3><div className="confirmed-row"><span>{t.qty} {item.qty}</span><b>{rupee(item.basePrice)} × {item.qty}</b></div><div className="confirmed-row"><span>{t.baseItem}</span><b>{rupee(item.baseTotal)}</b></div><div className="confirmed-customization"><small>{t.customization}</small>{item.customizationGroups?.map(group => group.selectedOptions.length ? <div key={group.id}><small>{group.name}</small>{group.selectedOptions.map(option => <div className="confirmed-row" key={option.id}><span>{option.name}</span><b>{Number(option.price) ? '+' + rupee(option.price) : t.included}</b></div>)}</div> : null)}</div><div className="confirmed-row item-total"><span>{t.itemTotal}</span><b>{rupee(item.finalTotal)}</b></div></article>)}</div><div className="confirmed-total"><span>{t.totalToPay}</span><b>{rupee(order?.total)}</b></div></div><p className="confirmation-note"><b>{t.waitOrder}</b><br />{t.waitOrderDetail}<br />{t.sentKitchen}</p><button className="primary huge" onClick={() => { setCart([]); setOrder(null); setScreen('welcome') }}>{t.newOrder} <ArrowRight /></button></main>;

    return shell(<section className="menu-screen"><div className="category-rail">{categoryNames.map(name => <button key={name} className={cat === name ? 'active' : ''} onClick={() => setCat(name)}>{name}</button>)}</div><div className="menu-content"><Pill>{t.orderingFor} · {typeLabel}</Pill><h1>{t.loaded}</h1><p>{menuLoading ? 'Loading menu...' : menuError || t.fresh}</p>{menuError ? <button className="primary" onClick={() => window.location.reload()}>Retry</button> : <div className="menu-grid">{visibleMenu.map(item => <article className="food-card" key={item.id}><div className="food-image"><img src={item.image_url} />{settings?.['kiosk.show_bestseller'] !== false && item.bestseller && <Pill>{t.bestseller}</Pill>}</div><div><h3>{item.name}</h3><p>{item.description}</p><div className="card-bottom"><b>{rupee(item.price)}</b><button onClick={() => prepareChosenItem(item)} aria-label={t.customize + ' ' + item.name}><Plus /></button></div></div></article>)}{!menuLoading && !menuError && !visibleMenu.length && <div className="empty"><ShoppingBag /><h2>No menu items available</h2><p>Please check the menu configuration.</p></div>}</div>}</div></section>);
}

function KDS({ onMode }) { const [orders, setOrders] = useState([]); const [stock, setStock] = useState([]); useEffect(() => { api('/orders?status=new,preparing').then(x => setOrders(x.orders)).catch(() => setOrders([{ id: 1, order_number: 'A-104', order_type: 'TAKE PARCEL', created_at: new Date().toISOString(), items: [{ name: 'Classic Chicken Shawarma', quantity: 2 }, { name: 'Loaded Fries', quantity: 1 }], status: 'new' }])); api('/inventory').then(x => setStock(x.items)).catch(() => setStock([{ name: 'Chicken', quantity: 18, unit: 'kg', status: 'low' }, { name: 'Garlic Sauce', quantity: 6, unit: 'bottles', status: 'low' }, { name: 'Pita Bread', quantity: 0, unit: 'pcs', status: 'out' }])); const s = io(API.replace('/api', '')); s.on('order:new', o => setOrders(x => [o, ...x])); return () => s.disconnect() }, []); const advance = async o => { let status = o.status === 'new' ? 'preparing' : 'completed'; try { await api('/orders/' + o.id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }) } catch { } setOrders(x => status === 'completed' ? x.filter(z => z.id !== o.id) : x.map(z => z.id === o.id ? { ...z, status } : z)) }; const active = orders.filter(x => x.status === 'preparing'), waiting = orders.filter(x => x.status === 'new'); return <main className="staff-shell"><aside className="staff-nav"><Brand light /><Pill>ANDHERI WEST</Pill>{[['Orders', ChefHat], ['Stock Status', Package], ['Performance', Flame]].map(([x, I]) => <button className={x === 'Orders' ? 'active' : ''}><I />{x}</button>)}<div className="staff-summary"><small>TODAY'S SUMMARY</small><span><b>327</b> Orders today</span><span><b>301</b> Completed</span><span><b>08:42</b> Avg. prep time</span></div><button className="mode lightmode" onClick={onMode}>Open kiosk</button></aside><section className="kds-main"><header><div><Pill>LIVE WORKFLOW</Pill><h1>Kitchen <em>display</em></h1><p>Real-time orders · Smart queue · Efficient workflow</p></div><div className="kitchen-online"><span /> Kitchen online<br /><small>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div></header><div className="section-heading"><h2>Active orders <span>{active.length}/2</span></h2><small>MAX 2 ACTIVE ORDERS</small></div><div className="active-orders">{active.length ? active.map(o => <OrderCard o={o} done={() => advance(o)} />) : <div className="empty"><ChefHat /><h2>Ready for the next order</h2><p>New orders will move here automatically.</p></div>}</div><div className="section-heading"><h2>Waiting queue <span>{waiting.length}</span></h2></div><div className="queue">{waiting.map(o => <article className="queue-card"><b>#{o.order_number}</b><span>{o.items?.map(i => `${i.name} ×${i.quantity}`).join(' · ')}</span><button onClick={() => advance(o)}>Start <ArrowRight /></button></article>)}{!waiting.length && <p className="muted">No orders waiting.</p>}</div></section><aside className="stock-panel"><Pill>LIVE INVENTORY</Pill><h2>Stock status</h2><div className="stock-filter"><button>All</button><button>Low</button><button>Out</button></div>{stock.map(x => <article className="stock-item"><span className={'stock-dot ' + x.status} /><div><b>{x.name}</b><small>Qty: {x.quantity} {x.unit}</small></div><Pill tone={x.status}>{x.status === 'out' ? 'OUT OF STOCK' : x.status === 'low' ? 'LOW STOCK' : 'AVAILABLE'}</Pill></article>)}<button className="secondary">UPDATE STOCK STATUS</button></aside></main> }
function OrderCard({ o, done }) { return <article className="active-card"><div><Pill>{o.order_type}</Pill><h2>#{o.order_number}</h2><small><Clock3 /> {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><div className="order-lines">{o.items?.map(i => <p><b>{i.quantity}×</b> {i.name}</p>)}</div><div className="timer"><b>03:42</b><small>target 08:00</small></div><button className="primary" onClick={done}>{o.status === 'new' ? 'START PREPARING' : 'ORDER COMPLETED'} <Check /></button></article> }
function Admin({ onMode }) { const [metrics, setMetrics] = useState({ revenue: 48650, orders: 286, aov: 170, customers: 241 }); const [inventory, setInventory] = useState([]); useEffect(() => { api('/analytics/dashboard').then(x => setMetrics(x.metrics || metrics)).catch(() => { }); api('/inventory').then(x => setInventory(x.items)).catch(() => setInventory([{ name: 'Chicken', quantity: 18, unit: 'kg', status: 'low' }, { name: 'Garlic Sauce', quantity: 6, unit: 'bottles', status: 'low' }, { name: 'Pita Bread', quantity: 0, unit: 'pcs', status: 'out' }])) }, []); let chart = [{ d: 'Mon', r: 18000 }, { d: 'Tue', r: 26000 }, { d: 'Wed', r: 21300 }, { d: 'Thu', r: 31800 }, { d: 'Fri', r: 28600 }, { d: 'Sat', r: 48650 }, { d: 'Sun', r: 39400 }]; return <main className="admin"><aside className="admin-nav"><Brand light />{[['Dashboard', LayoutDashboard], ['Orders', ShoppingBag], ['Menu management', Menu], ['Inventory', Package], ['Staff', ChefHat], ['Analytics', Flame]].map(([x, I]) => <button className={x === 'Dashboard' ? 'active' : ''}><I />{x}</button>)}<div className="nav-bottom"><button className="mode lightmode" onClick={onMode}>Open kiosk</button><small>Single outlet · v1.0</small></div></aside><section className="admin-main"><header><div><Pill>SEPTEMBER 07, 2026</Pill><h1>Good morning, <em>team.</em></h1><p>Here’s how SHAWARMAHOLICS is performing today.</p></div><button className="primary"><Plus /> Add menu item</button></header><div className="metrics">{[['TODAY’S REVENUE', rupee(metrics.revenue), '↑ 12.5%'], ['TODAY’S ORDERS', metrics.orders, '↑ 8.2%'], ['AVG. ORDER VALUE', rupee(metrics.aov), '↑ 3.4%'], ['CUSTOMERS TODAY', metrics.customers, '↑ 6.1%']].map(([a, b, c]) => <article><small>{a}</small><b>{b}</b><span>{c} <small>vs yesterday</small></span></article>)}</div><div className="admin-grid"><article className="panel chart-panel"><div className="panel-head"><div><Pill>DAILY</Pill><h2>Revenue overview</h2></div><b>{rupee(metrics.revenue)}</b></div><ResponsiveContainer width="100%" height={235}><AreaChart data={chart}><defs><linearGradient id="gold" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#b98727" stopOpacity=".35" /><stop offset="1" stopColor="#b98727" stopOpacity="0" /></linearGradient></defs><Tooltip formatter={v => rupee(v)} /><Area type="monotone" dataKey="r" stroke="#8d1831" strokeWidth={3} fill="url(#gold)" /></AreaChart></ResponsiveContainer></article><article className="panel"><Pill>LIVE SNAPSHOT</Pill><h2>Order performance</h2><div className="donut"><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={[{ value: 72 }, { value: 18 }, { value: 10 }]} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={5}>{['#8d1831', '#d59c35', '#e6d9c6'].map(c => <Cell fill={c} />)}</Pie></PieChart></ResponsiveContainer><b>72%<small> completed</small></b></div><div className="legend"><span><i className="maroon" />Completed</span><span><i className="gold" />Preparing</span><span><i className="cream" />Pending</span></div></article><article className="panel top-items"><div className="panel-head"><div><Pill>TOP SELLERS</Pill><h2>People can’t get enough</h2></div><button className="text-btn">View all</button></div>{demoMenu.slice(0, 4).map((x, i) => <div><span>0{i + 1}</span><img src={x.image_url} /><b>{x.name}<small>{rupee(x.price)} · {92 - i * 11} sold</small></b></div>)}</article><article className="panel alerts"><div className="panel-head"><div><Pill tone="low">ACTION NEEDED</Pill><h2>Inventory alerts</h2></div><button className="text-btn">View inventory</button></div>{inventory.filter(x => x.status !== 'available').map(x => <div><span className={'stock-dot ' + x.status} /><b>{x.name}<small>{x.quantity} {x.unit} remaining</small></b><Pill tone={x.status}>{x.status === 'out' ? 'OUT' : 'LOW'}</Pill></div>)}{!inventory.length && <p className="muted">Everything is fully stocked.</p>}</article></div></section></main> }
function App() { const params = new URLSearchParams(window.location.search); const requested = params.get('view'); const branchId = params.get('branchId'); const locationType = (params.get('locationType') || (branchId ? 'BRANCH' : 'HEAD_OFFICE')).toUpperCase(); const [mode, setMode] = useState(['kds', 'admin'].includes(requested) ? requested : 'kiosk'); const openKiosk = () => { const suffix = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''; window.history.replaceState({}, '', `/${suffix}`); setMode('kiosk'); }; return mode === 'kiosk' ? <Kiosk /> : mode === 'admin' ? <AdminPanel onMode={openKiosk} /> : <KitchenDisplay onMode={openKiosk} locationType={locationType} branchId={branchId} /> }; createRoot(document.getElementById('root')).render(<I18nProvider><App /></I18nProvider>);
