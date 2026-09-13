import {useEffect,useState} from 'react';
import {api} from '../api';
import JalaliDateInput from '../components/JalaliDateInput';
import Modal from '../components/Modal';
import OrderDrawer from '../components/OrderDrawer';
import {toJalali,todayISO} from '../jalali';

const blank=()=>({order_id:'',payment_type:'واریز',amount:'',payment_date:todayISO(),description:'',registered_by:''});

export default function Payments({onNavigate}){
  const [orders,setOrders]=useState([]),[rows,setRows]=useState([]),[query,setQuery]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[open,setOpen]=useState(false),[selectedOrder,setSelectedOrder]=useState(null),[archiveOrder,setArchiveOrder]=useState(null),[error,setError]=useState(''),[f,setF]=useState(blank);
  const load=()=>api.get('/payments').then(setRows).catch(e=>setError(e.message));
  useEffect(()=>{api.get('/orders').then(setOrders).catch(e=>setError(e.message));load()},[]);
  useEffect(()=>{if(!f.order_id){setSelectedOrder(null);return}api.get(`/orders/${f.order_id}`).then(setSelectedOrder).catch(()=>setSelectedOrder(null))},[f.order_id]);
  const save=async()=>{setError('');if(!f.order_id||Number(f.amount)<=0){setError('سفارش و مبلغ وصول را کامل کنید.');return}try{await api.post('/payments',{...f,order_id:Number(f.order_id),amount:Number(f.amount)});setF(blank());setOpen(false);load()}catch(e){setError(e.message)}};
  const filteredRows=rows.filter(row=>{const text=[row.order_no,row.customer_name,row.payment_type,row.description].join(' ').toLowerCase();return (!query||text.includes(query.trim().toLowerCase()))&&(!dateFrom||row.payment_date>=dateFrom)&&(!dateTo||row.payment_date<=dateTo)});
  const close=()=>{setOpen(false);setError('');setF(blank())};
  const openOrder=id=>api.get(`/orders/${id}`).then(setArchiveOrder).catch(e=>setError(e.message));
  return <div className="page operational-page">
    <div className="page-head"><div><div className="eyebrow">وصول و نقدینگی</div><h1>پرداخت‌ها</h1><p>ثبت وصول در یک مرحله؛ سابقه در پایین صفحه باقی می‌ماند.</p></div><button onClick={()=>setOpen(true)}>ثبت وصول جدید</button></div>
    {error&&!open&&<div className="error">{error}</div>}
    <section className="card operational-table"><div className="section-title"><div><div className="eyebrow">سابقه مالی</div><h2>پرداخت‌های ثبت‌شده</h2></div><span>{filteredRows.length} پرداخت در این بازه</span></div><div className="archive-date-filter no-print"><label className="archive-search"><span>جست‌وجو</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="سفارش، مشتری یا شرح"/></label><JalaliDateInput label="پرداخت از" value={dateFrom} onChange={setDateFrom}/><JalaliDateInput label="پرداخت تا" value={dateTo} onChange={setDateTo}/>{(query||dateFrom||dateTo)&&<button className="secondary" onClick={()=>{setQuery('');setDateFrom('');setDateTo('')}}>پاک کردن</button>}</div><div className="table-wrap"><table><thead><tr><th>سفارش</th><th>مشتری</th><th>نوع</th><th>مبلغ</th><th>تاریخ</th><th>شرح</th></tr></thead><tbody>{filteredRows.map(r=><tr key={r.id}><td><button className="order-no-link" onClick={()=>openOrder(r.order_id)}>{r.order_no}</button></td><td>{r.customer_name}</td><td>{r.payment_type}</td><td><b>{Number(r.amount).toLocaleString('fa-IR')}</b></td><td>{toJalali(r.payment_date)}</td><td>{r.description||'—'}</td></tr>)}</tbody></table></div>{filteredRows.length===0&&<div className="empty">پرداختی در این بازه ثبت نشده است.</div>}</section>
    {open&&<Modal title="ثبت وصول جدید" onClose={close} actions={<><button className="secondary" onClick={close}>انصراف</button><button onClick={save}>ثبت پرداخت</button></>}><div className="form-grid compact-form"><label className="field"><span>سفارش *</span><select value={f.order_id} onChange={e=>setF({...f,order_id:e.target.value})}><option value="">انتخاب سفارش</option>{orders.map(o=><option key={o.id} value={o.id}>{o.customer_name} — {o.order_no}</option>)}</select></label><label className="field"><span>نوع پرداخت</span><input value={f.payment_type} onChange={e=>setF({...f,payment_type:e.target.value})}/></label><label className="field"><span>مبلغ *</span><input type="number" min="0" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><JalaliDateInput label="تاریخ پرداخت" value={f.payment_date} onChange={value=>setF({...f,payment_date:value})}/><label className="field wide"><span>شرح</span><input value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></label></div>{selectedOrder&&<div className="payment-order-context"><span>وضعیت سفارش انتخاب‌شده</span><b>{selectedOrder.order_no} · {selectedOrder.customer_name}</b><div><small>مبلغ کل {Number(selectedOrder.total_amount||0).toLocaleString('fa-IR')}</small><small className={Number(selectedOrder.balance)>0?'debt-text':''}>مانده وصول {Number(selectedOrder.balance||0).toLocaleString('fa-IR')}</small></div></div>}{error&&<div className="error">{error}</div>}</Modal>}
    {archiveOrder&&<OrderDrawer order={archiveOrder} onClose={()=>setArchiveOrder(null)} onNavigate={onNavigate} onProduct={(order,item)=>onNavigate?.('reports',{orderId:order.id,productId:item.id})}/>} 
  </div>
}
