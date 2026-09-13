import Modal from './Modal';
import {toJalali} from '../jalali';
import {calcWeightedProgress} from '../progress';

const money=n=>Number(n||0).toLocaleString('fa-IR');
const progress=item=>calcWeightedProgress(item.stages);

export default function OrderDrawer({order,onClose,onNavigate,onProduct}){
  if(!order)return null;
  const total=(order.items||[]).reduce((sum,i)=>sum+Number(i.quantity||0),0),shipped=(order.items||[]).reduce((sum,i)=>sum+Number(i.shipped_quantity||0),0);
  const go=(page,productId)=>onNavigate?.(page,{orderId:order.id,productId});
  return <Modal title={`سفارش ${order.order_no}`} onClose={onClose} variant="drawer" className="order-drawer"><div className="drawer-order-title"><div><span>{order.customer_name}</span><h2>{order.order_no}</h2></div><b className={Number(order.balance)>0?'debt-text':''}>{money(order.balance)}<small>مانده وصول</small></b></div><div className="drawer-order-metrics"><div><span>موعد تحویل</span><b>{order.delivery_date?toJalali(order.delivery_date):'—'}</b></div><div><span>ارسال</span><b>{money(shipped)} از {money(total)}</b></div><div><span>محصول</span><b>{(order.items||[]).length} مورد</b></div></div><div className="drawer-section"><div className="drawer-section-head"><h4>محصولات سفارش</h4><span>برای دیدن مشخصات و تاریخچه، محصول را باز کنید.</span></div>{(order.items||[]).map(item=>{const value=progress(item);return <button type="button" className="drawer-product-row" key={item.id} onClick={()=>onProduct?.(order,item)}><span><b>{item.product_name}</b><small>{item.item_code||'بدون کد'} · {item.current_stage||'بدون مرحله'}</small></span><span className="drawer-product-progress"><b>{value}٪</b><i><em style={{width:`${value}%`}} /></i></span><span>{money(item.remaining_quantity)} مانده ارسال</span></button>})}</div><div className="drawer-section"><div className="drawer-section-head"><h4>آخرین پیگیری‌ها</h4></div>{(order.items||[]).filter(i=>i.last_note).length===0?<p className="drawer-empty">یادداشتی برای این سفارش ثبت نشده است.</p>:(order.items||[]).filter(i=>i.last_note).map(i=><div className="drawer-note" key={i.id}><b>{i.product_name}</b><span>{i.last_note.body}</span></div>)}</div><div className="drawer-links"><button onClick={()=>go('control')}>کنترل پروژه</button><button onClick={()=>go('purchase')}>خرید</button><button onClick={()=>go('production')}>تولید</button><button className="secondary" onClick={()=>go('reports')}>گزارش کامل</button></div></Modal>
}
