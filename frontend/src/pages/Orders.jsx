import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import JalaliDateInput from '../components/JalaliDateInput';
import Modal from '../components/Modal';
import {toJalali,todayISO} from '../jalali';
import OrderDrawer from '../components/OrderDrawer';
import ProductDetailModal from '../components/ProductDetailModal';

const blankPoleSpec=()=>({pole_type:'چندضلعی استاندارد',height:9,bottom_diameter:180,top_diameter:80,sheet_thickness:3,sides_count:8,section_count:1,bracket_type:'یک‌طرفه',bracket_count:1,bracket_length:1.2,bracket_angle:15,base_plate_dim:'350*350*20',anchor_bolt_spec:'4*M24*800',welding_spec:'زیرپودری پیوسته',surface_treatment:'گالوانیزه گرم',coating_thickness:80,drawing_number:'DWG-1001',drawing_revision:'Rev A'});
const blank=()=>({product_name:'',quantity:1,unit_price:0,paint_type:'',color:'',cable_status:'',projector_type:'',projector_brand:'',special_notes:'',galvanized:false,galvanized_notes:'',has_spec:false,pole_spec:blankPoleSpec()});
const fresh=()=>({customer_id:'',project_id:'',order_date:todayISO(),delivery_date:'',payment_due_date:'',registered_by:'',description:'',items:[blank()]});

export default function Orders({onNavigate,initialCustomerId,initialProjectId}){
  const [customers,setCustomers]=useState([]),[projects,setProjects]=useState([]),[orders,setOrders]=useState([]),[open,setOpen]=useState(false),[form,setForm]=useState(fresh),[msg,setMsg]=useState(''),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[selectedOrder,setSelectedOrder]=useState(null),[selectedProduct,setSelectedProduct]=useState(null);
  const load=()=>api.get('/orders').then(setOrders);
  useEffect(()=>{api.get('/customers').then(setCustomers);api.get('/projects').then(setProjects);load()},[]);
  useEffect(()=>{
    if(initialCustomerId)setForm(current=>({...current,customer_id:String(initialCustomerId)}));
    if(initialProjectId)setForm(current=>({...current,project_id:String(initialProjectId)}));
    if(initialCustomerId||initialProjectId)setOpen(true);
  },[initialCustomerId,initialProjectId]);

  const setItem=(index,key,value)=>setForm({...form,items:form.items.map((item,i)=>i===index?{...item,[key]:value}:item)});
  const setSpec=(index,key,value)=>setForm({...form,items:form.items.map((item,i)=>i===index?{...item,pole_spec:{...item.pole_spec,[key]:value}}:item)});
  const add=()=>setForm({...form,items:[...form.items,blank()]}),remove=index=>setForm({...form,items:form.items.filter((_,i)=>i!==index)});
  const setStatus=async(id,status)=>{await api.patch(`/orders/${id}/status`,{status});load()};

  const save=async()=>{
    setMsg('');
    if(!form.customer_id){setMsg('ابتدا مشتری سفارش را انتخاب کنید.');return}
    if(form.items.some(item=>!item.product_name.trim()||Number(item.quantity)<=0||Number(item.unit_price)<0)){
      setMsg('نام، تعداد و قیمت هر محصول را کامل کنید.');
      return;
    }
    try{
      const payload={
        ...form,
        customer_id:Number(form.customer_id),
        project_id:form.project_id?Number(form.project_id):undefined,
        items:form.items.map(item=>({
          ...item,
          quantity:Number(item.quantity),
          unit_price:Number(item.unit_price),
          pole_spec:item.has_spec?{
            ...item.pole_spec,
            height:Number(item.pole_spec.height||0),
            bottom_diameter:Number(item.pole_spec.bottom_diameter||0),
            top_diameter:Number(item.pole_spec.top_diameter||0),
            sheet_thickness:Number(item.pole_spec.sheet_thickness||0),
            sides_count:Number(item.pole_spec.sides_count||0),
            section_count:Number(item.pole_spec.section_count||1),
            bracket_count:Number(item.pole_spec.bracket_count||0),
            bracket_length:Number(item.pole_spec.bracket_length||0),
            bracket_angle:Number(item.pole_spec.bracket_angle||0),
            coating_thickness:Number(item.pole_spec.coating_thickness||0),
          }:undefined
        }))
      };
      const result=await api.post('/orders',payload);
      setMsg(`سفارش ${result.order_no} با موفقیت ثبت شد.`);
      setForm(fresh());
      setOpen(false);
      load();
      api.get('/projects').then(setProjects);
    }catch(e){setMsg(e.message)}
  };

  const customerProjects=useMemo(()=>form.customer_id?projects.filter(p=>String(p.customer_id)===String(form.customer_id)):projects,[projects,form.customer_id]);
  const filteredOrders=useMemo(()=>orders.filter(order=>{
    const text=[order.order_no,order.customer_name,order.project_code,order.project_name].filter(Boolean).join(' ').toLowerCase();
    return (!query||text.includes(query.trim().toLowerCase()))&&(!statusFilter||order.status===statusFilter)&&(!dateFrom||order.order_date>=dateFrom)&&(!dateTo||order.order_date<=dateTo)
  }),[orders,query,statusFilter,dateFrom,dateTo]);
  const openDetail=id=>api.get(`/orders/${id}`).then(setSelectedOrder).catch(e=>setMsg(e.message));

  return <div className="page operational-page orders-page">
    <div className="page-head">
      <div>
        <div className="eyebrow">فروش و برنامه‌ریزی</div>
        <h1>سفارش‌ها و پارت‌های تولید</h1>
        <p>ثبت سفارش متصل به پروژه؛ با امکان ثبت پارامترهای مهندسی سازه پایه‌چراغ.</p>
      </div>
      <button onClick={()=>setOpen(true)}>ثبت سفارش جدید</button>
    </div>
    {msg&&<div className={msg.includes('ثبت شد')?'success':'error'}>{msg}</div>}
    <section className="card operational-table">
      <div className="section-title">
        <div>
          <div className="eyebrow">فهرست سفارش‌ها</div>
          <h2>سفارش‌های ثبت‌شده</h2>
        </div>
        <span>{filteredOrders.length} از {orders.length} سفارش</span>
      </div>
      <div className="order-archive-filter no-print">
        <label><span>جست‌وجو</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="مشتری، شماره سفارش یا پروژه..."/></label>
        <label><span>وضعیت</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">همه وضعیت‌ها</option><option value="ACTIVE">فعال</option><option value="COMPLETED">تمام‌شده</option><option value="CANCELLED">لغوشده</option></select></label>
        <JalaliDateInput label="ثبت از" value={dateFrom} onChange={setDateFrom}/>
        <JalaliDateInput label="ثبت تا" value={dateTo} onChange={setDateTo}/>
        {(query||statusFilter||dateFrom||dateTo)&&<button className="secondary" onClick={()=>{setQuery('');setStatusFilter('');setDateFrom('');setDateTo('')}}>پاک کردن</button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>سفارش</th>
              <th>پروژه مادر</th>
              <th>مشتری</th>
              <th>تاریخ</th>
              <th>مبلغ کل</th>
              <th>مانده وصول</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(order=><tr key={order.id}>
              <td><button className="order-no-link" onClick={()=>openDetail(order.id)}>{order.order_no}</button></td>
              <td>{order.project_code?<span className="spec-chip" title={order.project_name}><b>پروژه:</b> {order.project_code}</span>:<span className="muted">بدون پروژه</span>}</td>
              <td>{order.customer_name}</td>
              <td>{toJalali(order.order_date)}</td>
              <td>{Number(order.total_amount).toLocaleString('fa-IR')}</td>
              <td className={Number(order.balance)>0?'debt-text':''}>{Number(order.balance).toLocaleString('fa-IR')}</td>
              <td><span className={`order-status ${String(order.status).toLowerCase()}`}>{order.status==='ACTIVE'?'فعال':order.status==='COMPLETED'?'تمام‌شده':'لغو‌شده'}</span></td>
              <td>
                <div className="order-row-actions">
                  <button className="secondary" onClick={()=>openDetail(order.id)}>جزئیات</button>
                  {order.status==='ACTIVE'?<button className="secondary" onClick={()=>setStatus(order.id,'COMPLETED')}>اتمام</button>:<button className="secondary" onClick={()=>setStatus(order.id,'ACTIVE')}>بازگشایی</button>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {filteredOrders.length===0&&<div className="empty">سفارشی مطابق فیلتر انتخاب‌شده وجود ندارد.</div>}
    </section>

    {open&&<Modal title="ثبت سفارش جدید" onClose={()=>setOpen(false)} className="order-entry-modal" actions={<><button className="secondary" onClick={()=>setOpen(false)}>انصراف</button><button onClick={save}>ثبت سفارش</button></>}>
      <section className="order-entry-section">
        <div className="order-entry-title"><span>۱</span><div><h3>اطلاعات سفارش و پروژه</h3><p>مشتری، پروژه مادر و تاریخ‌های کلیدی را مشخص کنید.</p></div></div>
        <div className="form-grid compact-form">
          <label className="field"><span>مشتری *</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value,project_id:''})}><option value="">انتخاب مشتری</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name} — شماره بعدی {customer.prefix}{customer.next_order_counter}</option>)}</select></label>
          <label className="field"><span>پروژه مادر</span><select value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value})}><option value="">ایجاد خودکار پروژه جدید</option>{customerProjects.map(p=><option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}</select></label>
          <JalaliDateInput label="تاریخ سفارش" value={form.order_date} onChange={value=>setForm({...form,order_date:value})}/>
          <JalaliDateInput label="تاریخ تحویل" value={form.delivery_date} onChange={value=>setForm({...form,delivery_date:value})}/>
          <JalaliDateInput label="سررسید پرداخت" value={form.payment_due_date} onChange={value=>setForm({...form,payment_due_date:value})}/>
          <label className="field"><span>ثبت‌کننده</span><input value={form.registered_by} onChange={e=>setForm({...form,registered_by:e.target.value})}/></label>
          <label className="field wide"><span>توضیحات سفارش</span><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        </div>
      </section>

      <section className="order-entry-section">
        <div className="order-entry-title"><span>۲</span><div><h3>محصولات و مشخصات مهندسی سازه</h3><p>هر محصول دارای مشخصات بازرگانی و پارامترهای فنی سازه پایه چراغ است.</p></div><button className="secondary" onClick={add}>+ افزودن محصول</button></div>
        <div className="order-item-stack">
          {form.items.map((item,index)=><article className="order-item-form" key={index}>
            <div className="order-item-head">
              <b>محصول {index+1}</b>
              {form.items.length>1&&<button className="danger-btn" onClick={()=>remove(index)}>حذف</button>}
            </div>
            <div className="order-item-grid">
              <label className="field wide"><span>نام محصول *</span><input value={item.product_name} onChange={e=>setItem(index,'product_name',e.target.value)} placeholder="مثلاً پایه چراغ چندضلعی ۹ متری"/></label>
              <label className="field"><span>تعداد (اصله) *</span><input type="number" min="1" value={item.quantity} onChange={e=>setItem(index,'quantity',e.target.value)}/></label>
              <label className="field"><span>قیمت واحد *</span><input type="number" min="0" value={item.unit_price} onChange={e=>setItem(index,'unit_price',e.target.value)}/></label>
              <label className="field"><span>نوع رنگ</span><input value={item.paint_type} onChange={e=>setItem(index,'paint_type',e.target.value)} placeholder="پودری / مایع / بدون رنگ"/></label>
              <label className="field"><span>کد / رنگ</span><input value={item.color} onChange={e=>setItem(index,'color',e.target.value)} placeholder="مثلاً RAL 7035"/></label>
              <label className="field"><span>وضعیت کابل</span><input value={item.cable_status} onChange={e=>setItem(index,'cable_status',e.target.value)}/></label>
              <label className="field"><span>نوع پروژکتور</span><input value={item.projector_type} onChange={e=>setItem(index,'projector_type',e.target.value)}/></label>
              <label className="field"><span>برند پروژکتور</span><input value={item.projector_brand} onChange={e=>setItem(index,'projector_brand',e.target.value)}/></label>
              <label className="field"><span>پوشش گالوانیزه</span><select value={item.galvanized?'1':'0'} onChange={e=>setItem(index,'galvanized',e.target.value==='1')}><option value="0">ندارد</option><option value="1">دارد</option></select></label>
              <label className="field"><span>توضیح گالوانیزه</span><input disabled={!item.galvanized} value={item.galvanized_notes} onChange={e=>setItem(index,'galvanized_notes',e.target.value)}/></label>
              <label className="field wide"><span>توضیح ویژه</span><input value={item.special_notes} onChange={e=>setItem(index,'special_notes',e.target.value)}/></label>
            </div>

            <div style={{marginTop:'0.8rem',borderTop:'1px dashed var(--border,#ddd)',paddingTop:'0.6rem'}}>
              <button type="button" className="secondary" style={{fontSize:'0.82rem',padding:'0.3rem 0.6rem'}} onClick={()=>setItem(index,'has_spec',!item.has_spec)}>
                {item.has_spec?'▲ بستن مشخصات سازه پایه':'▼ ثبت مشخصات فنی سازه پایه چراغ (مهندسی)'}
              </button>
              {item.has_spec&&<div className="order-item-grid" style={{marginTop:'0.6rem',backgroundColor:'rgba(0,0,0,0.02)',padding:'0.6rem',borderRadius:'6px'}}>
                <label className="field"><span>تیپ سازه</span><input value={item.pole_spec.pole_type} onChange={e=>setSpec(index,'pole_type',e.target.value)} placeholder="چندضلعی / لوله‌ای / دکوراتیو"/></label>
                <label className="field"><span>ارتفاع (متر)</span><input type="number" step="0.5" value={item.pole_spec.height} onChange={e=>setSpec(index,'height',e.target.value)}/></label>
                <label className="field"><span>ضخامت ورق (mm)</span><input type="number" step="0.5" value={item.pole_spec.sheet_thickness} onChange={e=>setSpec(index,'sheet_thickness',e.target.value)}/></label>
                <label className="field"><span>قطر پایین (mm)</span><input type="number" value={item.pole_spec.bottom_diameter} onChange={e=>setSpec(index,'bottom_diameter',e.target.value)}/></label>
                <label className="field"><span>قطر بالا (mm)</span><input type="number" value={item.pole_spec.top_diameter} onChange={e=>setSpec(index,'top_diameter',e.target.value)}/></label>
                <label className="field"><span>تعداد اضلاع</span><select value={item.pole_spec.sides_count} onChange={e=>setSpec(index,'sides_count',Number(e.target.value))}><option value="0">گرد (لوله‌ای)</option><option value="6">۶ وجهی</option><option value="8">۸ وجهی</option><option value="12">۱۲ وجهی</option><option value="14">۱۴ وجهی</option><option value="16">۱۶ وجهی</option></select></label>
                <label className="field"><span>تعداد قطعات (تکه)</span><input type="number" min="1" value={item.pole_spec.section_count} onChange={e=>setSpec(index,'section_count',Number(e.target.value))}/></label>
                <label className="field"><span>نوع دستک/براکت</span><input value={item.pole_spec.bracket_type} onChange={e=>setSpec(index,'bracket_type',e.target.value)} placeholder="یک‌طرفه، دوطرفه، صلیبی"/></label>
                <label className="field"><span>تعداد دستک</span><input type="number" value={item.pole_spec.bracket_count} onChange={e=>setSpec(index,'bracket_count',Number(e.target.value))}/></label>
                <label className="field"><span>ابعاد بیس‌پلیت</span><input value={item.pole_spec.base_plate_dim} onChange={e=>setSpec(index,'base_plate_dim',e.target.value)} placeholder="مثلاً 350*350*20"/></label>
                <label className="field"><span>مشخصات انکربولت</span><input value={item.pole_spec.anchor_bolt_spec} onChange={e=>setSpec(index,'anchor_bolt_spec',e.target.value)} placeholder="مثلاً 4*M24*800"/></label>
                <label className="field"><span>نوع جوش</span><input value={item.pole_spec.welding_spec} onChange={e=>setSpec(index,'welding_spec',e.target.value)} placeholder="زیرپودری / CO2"/></label>
                <label className="field"><span>شماره نقشه</span><input value={item.pole_spec.drawing_number} onChange={e=>setSpec(index,'drawing_number',e.target.value)} placeholder="مثلاً DWG-1001"/></label>
                <label className="field"><span>نسخه نقشه</span><input value={item.pole_spec.drawing_revision} onChange={e=>setSpec(index,'drawing_revision',e.target.value)} placeholder="Rev A"/></label>
              </div>}
            </div>
          </article>)}
        </div>
      </section>
      {msg&&!msg.includes('ثبت شد')&&<div className="error">{msg}</div>}
    </Modal>}

    {selectedOrder&&<OrderDrawer order={selectedOrder} onClose={()=>setSelectedOrder(null)} onNavigate={onNavigate} onProduct={(order,item)=>{setSelectedOrder(null);setSelectedProduct({order,item})}}/>}
    {selectedProduct&&<ProductDetailModal order={selectedProduct.order} item={selectedProduct.item} onClose={()=>setSelectedProduct(null)} onNavigate={onNavigate}/>}
  </div>
}
