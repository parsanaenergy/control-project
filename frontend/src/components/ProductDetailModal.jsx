import {useEffect,useState} from 'react';
import Modal from './Modal';
import BOMEditorModal from './BOMEditorModal';
import {api} from '../api';
import {toJalali,toJalaliDateTime} from '../jalali';
import {calcWeightedProgress} from '../progress';

const money=n=>Number(n||0).toLocaleString('fa-IR');
const taskLabel={TODO:'باز',IN_PROGRESS:'در حال انجام',DONE:'تکمیل',BLOCKED:'متوقف (مانع)'};
const Spec=({label,value})=>value!==undefined&&value!==null&&value!==''?<span className="product-spec"><b>{label}</b>{value===true?'دارد':value===false?'ندارد':String(value)}</span>:null;

export default function ProductDetailModal({order,item,onClose,onNavigate}){
  const [extra,setExtra]=useState({tasks:[],shipments:[],notes:[]});
  const [qcData,setQcData]=useState({inspections:[],ncrs:[]});
  const [bomData,setBomData]=useState(null);
  const [showBOM,setShowBOM]=useState(false);
  const [spec,setSpec]=useState(item.pole_spec||null);

  const fetchBOM = () => {
    if (item.id) {
      api.get(`/items/${item.id}/bom`).then(setBomData).catch(()=>{});
    }
  };

  useEffect(()=>{
    let live=true;
    Promise.all([
      api.get(`/tasks?order_id=${order.id}`),
      api.get(`/shipments?order_id=${order.id}`),
      api.get(`/notes?order_id=${order.id}&order_item_id=${item.id}`),
      api.get(`/qc/inspections?order_item_id=${item.id}`),
      api.get(`/qc/ncrs?order_item_id=${item.id}`),
      api.get(`/items/${item.id}/bom`)
    ]).then(([tasks,shipments,notes,inspections,ncrs,bom])=>{
      if(!live)return;
      setExtra({
        tasks:tasks.filter(t=>!t.order_item_id||String(t.order_item_id)===String(item.id)),
        shipments:shipments.filter(s=>String(s.order_item_id)===String(item.id)),
        notes
      });
      setQcData({
        inspections:inspections||[],
        ncrs:ncrs||[]
      });
      setBomData(bom);
    }).catch(()=>{});

    if(!item.pole_spec && item.id){
      api.get(`/items/${item.id}/spec`).then(res=>{if(live)setSpec(res)}).catch(()=>{});
    }else if(item.pole_spec){
      setSpec(item.pole_spec);
    }
    return()=>{live=false};
  },[order.id,item.id,item.pole_spec]);

  const value=calcWeightedProgress(item.stages);
  const go=page=>onNavigate?.(page,{orderId:order.id,productId:item.id});

  return <Modal title="جزئیات محصول و شناسنامه سازه" onClose={onClose} variant="dialog" className="product-detail-modal">
    <div className="product-modal-hero">
      <div>
        <span>{order.project_code?`${order.project_code} · `:''}{order.order_no} · {order.customer_name}</span>
        <h2>{item.product_name}</h2>
        <small>{item.item_code||'بدون کد محصول'} · تعداد {money(item.quantity)} اصله</small>
      </div>
      <b>{value}٪<small>پیشرفت</small></b>
    </div>

    <div className="product-facts">
      <div><span>ارسال‌شده</span><b>{money(item.shipped_quantity)}</b></div>
      <div><span>مانده ارسال</span><b>{money(item.remaining_quantity)}</b></div>
      <div><span>موعد تحویل</span><b>{order.delivery_date?toJalali(order.delivery_date):'—'}</b></div>
      <div><span>مانده وصول سفارش</span><b className={Number(order.balance)>0?'debt-text':''}>{money(order.balance)}</b></div>
    </div>

    {spec&&(
      <section className="product-modal-section">
        <h4>مشخصات مهندسی سازه پایه‌چراغ</h4>
        <div className="product-specs">
          <Spec label="تیپ سازه" value={spec.pole_type}/>
          <Spec label="ارتفاع مفید" value={spec.height?`${spec.height} متر`:null}/>
          <Spec label="ضخامت ورق" value={spec.sheet_thickness?`${spec.sheet_thickness} mm`:null}/>
          <Spec label="قطر مقطع" value={spec.bottom_diameter&&spec.top_diameter?`${spec.bottom_diameter} به ${spec.top_diameter} mm`:null}/>
          <Spec label="اضلاع" value={spec.sides_count?`${spec.sides_count} وجهی`:'گرد (لوله‌ای)'}/>
          <Spec label="تعداد قطعات" value={spec.section_count?`${spec.section_count} تکه`:null}/>
          <Spec label="دستک / براکت" value={spec.bracket_type?`${spec.bracket_type} (${spec.bracket_count||0} شاخه)`:null}/>
          <Spec label="طول/زاویه دستک" value={spec.bracket_length?`${spec.bracket_length} متر / ${spec.bracket_angle||0}°`:null}/>
          <Spec label="بیس‌پلیت" value={spec.base_plate_dim}/>
          <Spec label="انکربولت" value={spec.anchor_bolt_spec}/>
          <Spec label="نوع جوش" value={spec.welding_spec}/>
          <Spec label="پوشش سطحی" value={spec.surface_treatment}/>
          <Spec label="ضخامت پوشش" value={spec.coating_thickness?`${spec.coating_thickness} میکرون`:null}/>
          <Spec label="نقشه ساخت" value={spec.drawing_number?`${spec.drawing_number} (${spec.drawing_revision||'Rev A'})`:null}/>
        </div>
      </section>
    )}

    {bomData && (
      <section className="product-modal-section">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
          <h4>ساختار شکست مواد و متریال (BOM)</h4>
          <button className="secondary" style={{fontSize:'10px',padding:'3px 8px'}} onClick={()=>setShowBOM(true)}>
            مشاهده ریز متریال و وضعیت تأمین
          </button>
        </div>
        <div className="product-facts" style={{gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',marginBottom:'4px'}}>
          <div>
            <span>وزن فولاد هر اصله</span>
            <b>{money(bomData.summary?.steel_weight_per_pole_kg)} <small style={{fontSize:'10px'}}>kg</small></b>
          </div>
          <div>
            <span>وزن کل فولاد سفارش</span>
            <b style={{color:'#2d806b'}}>{money(bomData.summary?.total_steel_weight_order_kg)} <small style={{fontSize:'10px'}}>kg</small></b>
          </div>
          <div>
            <span>وضعیت تأمین متریال</span>
            <b style={{color: bomData.summary?.has_shortage ? '#c44d4d' : '#2d806b'}}>
              {bomData.summary?.has_shortage ? `کسری: ${bomData.summary?.status_counts?.PURCHASE_REQUIRED} قلم` : 'کامل در انبار'}
            </b>
          </div>
          <div>
            <span>برآورد هزینه متریال</span>
            <b>{money(bomData.summary?.total_estimated_cost)} <small style={{fontSize:'10px'}}>ریال</small></b>
          </div>
        </div>
      </section>
    )}

    <section className="product-modal-section">
      <h4>مشخصات بازرگانی و الکتریکال</h4>
      <div className="product-specs">
        <Spec label="رنگ" value={item.color}/>
        <Spec label="رنگ‌آمیزی" value={item.paint_type}/>
        <Spec label="کابل" value={item.cable_status}/>
        <Spec label="پروژکتور" value={[item.projector_type,item.projector_brand].filter(Boolean).join(' ')}/>
        <Spec label="گالوانیزه" value={item.galvanized}/>
        <Spec label="توضیح ویژه" value={item.special_notes}/>
      </div>
    </section>

    <section className="product-modal-section">
      <h4>مراحل پروژه و اوزان فیزیکی ساخت</h4>
      <div className="product-stages">
        {(item.stages||[]).map(stage=>{
          const isBlocked = stage.status === 'BLOCKED';
          const weightPct = Math.round((stage.weight ?? 0.14) * 100);
          return (
            <div key={stage.id} style={isBlocked ? {borderRightColor: '#c44d4d', background: '#fff5f5'} : {}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <b>{stage.stage_name_fa}</b>
                  <span className="stage-weight-tag">وزن {weightPct}٪</span>
                </div>
                <span>{stage.progress}٪ · {stage.due_date ? toJalali(stage.due_date) : 'بدون موعد'}</span>
              </div>
              <i><em style={{width: `${stage.progress}%`, background: isBlocked ? '#c44d4d' : undefined}} /></i>
              {isBlocked && (
                <div style={{marginTop: '4px'}}>
                  <small className="blocker-badge">مانع: {stage.block_reason || 'متوقف'}</small>
                </div>
              )}
              {stage.note && <small>{stage.note}</small>}
            </div>
          );
        })}
      </div>
    </section>

    <section className="product-modal-section">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
        <h4>ایستگاه‌های کنترل کیفیت (QC Gates) و آزمون‌ها</h4>
        <button className="secondary" style={{fontSize:'10px',padding:'3px 8px'}} onClick={()=>go('qc')}>میز کار QC</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:'8px',marginBottom:'12px'}}>
        {[
          {key:'INCOMING_FORMING',label:'گیت ۱: متریال و خم'},
          {key:'WELDING',label:'گیت ۲: بازرسی جوش'},
          {key:'COATING',label:'گیت ۳: پوشش گالوانیزه'},
          {key:'FINAL_ASSEMBLY',label:'گیت ۴: مونتاژ نهایی'}
        ].map(g => {
          const match = qcData.inspections.find(i => i.gate_type === g.key);
          const isPassed = match?.result === 'PASSED';
          const isFailed = match?.result === 'FAILED';
          return (
            <div key={g.key} style={{
              border: '1px solid #dce5e2',
              borderRadius: '6px',
              padding: '8px 10px',
              background: isPassed ? '#f3faf6' : isFailed ? '#fff5f5' : '#fafbfa'
            }}>
              <b style={{fontSize:'11px',display:'block'}}>{g.label}</b>
              <span style={{
                fontSize:'10px',
                fontWeight:'bold',
                color: isPassed ? '#2d806b' : isFailed ? '#c44d4d' : '#889993'
              }}>
                {isPassed ? '✔ تأیید شد' : isFailed ? '✖ مردود (NCR)' : '⏳ در انتظار بازرسی'}
              </span>
            </div>
          );
        })}
      </div>

      {qcData.ncrs.length > 0 && (
        <div style={{border:'1px solid #f7c5c5',background:'#fff7f7',borderRadius:'6px',padding:'10px',marginTop:'8px'}}>
          <b style={{fontSize:'11px',color:'#b63838',display:'block',marginBottom:'6px'}}>
            گزارش‌های عدم انطباق کیفی ثبت‌شده ({qcData.ncrs.length}):
          </b>
          {qcData.ncrs.map(n => (
            <div key={n.id} style={{fontSize:'11px',marginBottom:'4px',display:'flex',justifyContent:'space-between',gap:'6px'}}>
              <span><b>{n.ncr_number}:</b> {n.defect_title}</span>
              <span style={{color: n.status === 'RESOLVED' || n.status === 'CLOSED' ? '#2d806b' : '#b63838', fontWeight:'bold'}}>
                {n.status === 'OPEN' ? 'باز (قفل کیفی)' : n.status === 'IN_REWORK' ? 'در حال اصلاح' : 'حل‌شده'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>

    <div className="product-modal-grid">
      <section>
        <h4>کارهای خرید و تولید</h4>
        {extra.tasks.length===0?<p>کاری ثبت نشده است.</p>:extra.tasks.map(t=><div className="product-mini-row" key={t.id}>
          <b>{t.department==='PURCHASE'?'خرید':'تولید'} · {t.title}</b>
          <span>{taskLabel[t.status]||t.status}{t.due_date?` · ${toJalali(t.due_date)}`:''}</span>
        </div>)}
      </section>
      <section>
        <h4>ارسال‌ها</h4>
        {extra.shipments.length===0?<p>ارسالی ثبت نشده است.</p>:extra.shipments.map(s=><div className="product-mini-row" key={s.id}>
          <b>{money(s.quantity)} واحد</b>
          <span>{toJalali(s.shipment_date)} · {s.destination||'بدون مقصد'}</span>
        </div>)}
      </section>
    </div>

    <section className="product-modal-section">
      <h4>تاریخچه پیگیری</h4>
      {extra.notes.length===0?<p>یادداشتی ثبت نشده است.</p>:extra.notes.map(n=><div className="product-note" key={n.id}>
        <b>{n.author||'کاربر'} · {toJalaliDateTime(n.created_at)}</b>
        <span>{n.body}</span>
      </div>)}
    </section>

    <div className="product-modal-actions">
      <button onClick={()=>go('control')}>کنترل پروژه</button>
      <button onClick={()=>setShowBOM(true)}>مدیریت متریال (BOM)</button>
      <button onClick={()=>go('purchase')}>خرید</button>
      <button onClick={()=>go('production')}>تولید</button>
      <button onClick={()=>go('qc')}>کنترل کیفیت (QC)</button>
      <button className="secondary" onClick={()=>go('reports')}>گزارش کامل</button>
    </div>

    {showBOM && (
      <BOMEditorModal
        orderItemId={item.id}
        productName={item.product_name}
        orderNo={order.order_no}
        onClose={()=>setShowBOM(false)}
        onUpdated={fetchBOM}
      />
    )}
  </Modal>;
}
