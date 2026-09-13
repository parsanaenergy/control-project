import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import JalaliDateInput from '../components/JalaliDateInput';
import Modal from '../components/Modal';
import {toJalali,todayISO} from '../jalali';

const money=n=>Number(n||0).toLocaleString('fa-IR');

const statusLabels={
  DRAFT:'پیش‌نویس',
  ENGINEERING:'طراحی و مهندسی',
  WAITING_APPROVAL:'در انتظار تأیید نقشه',
  READY_FOR_PRODUCTION:'آماده ساخت',
  IN_PRODUCTION:'در حال تولید',
  QC:'کنترل کیفیت',
  READY_FOR_DELIVERY:'آماده تحویل',
  DELIVERED:'تحویل‌شده',
  CLOSED:'خاتمه‌یافته',
  ON_HOLD:'متوقف / تعلیق',
  CANCELLED:'لغوشده'
};

const priorityLabels={
  LOW:'پایین',
  NORMAL:'عادی',
  HIGH:'بالا',
  CRITICAL:'بحرانی'
};

const riskLabels={
  LOW:'پایین',
  MEDIUM:'متوسط',
  HIGH:'بالا',
  CRITICAL:'بحرانی'
};

const milestoneStatusLabels={
  PLANNED:'برنامه‌ریزی‌شده',
  IN_PROGRESS:'در حال انجام',
  ACHIEVED:'محقق‌شده (پاس شد)',
  DELAYED:'دارای تأخیر'
};

const stageKeyLabels={
  DESIGN:'طراحی و مهندسی',
  PURCHASE:'تأمین متریال',
  PRODUCTION:'ساخت و مونتاژ',
  QC:'کنترل کیفیت',
  PACKAGING:'بسته‌بندی',
  DELIVERY:'تحویل و ارسال'
};

const freshProject=()=>({
  customer_id:'',
  project_name:'',
  project_code:'',
  site_location:'',
  project_manager:'',
  priority:'NORMAL',
  status:'ENGINEERING',
  risk_level:'LOW',
  contract_no:'',
  contract_date:todayISO(),
  contract_value:'',
  planned_start:todayISO(),
  planned_finish:'',
  committed_delivery_date:'',
  description:''
});

export default function Projects({onNavigate,initialProjectId}){
  const [projects,setProjects]=useState([]),
        [customers,setCustomers]=useState([]),
        [query,setQuery]=useState(''),
        [statusFilter,setStatusFilter]=useState(''),
        [priorityFilter,setPriorityFilter]=useState(''),
        [customerFilter,setCustomerFilter]=useState(''),
        [openNew,setOpenNew]=useState(false),
        [form,setForm]=useState(freshProject),
        [selectedProject,setSelectedProject]=useState(null),
        [drawerTab,setDrawerTab]=useState('overview'),
        [openBaselineModal,setOpenBaselineModal]=useState(false),
        [baselineForm,setBaselineForm]=useState({baseline_name:'',planned_finish:'',approved_by:'',notes:''}),
        [openMilestoneModal,setOpenMilestoneModal]=useState(false),
        [milestoneForm,setMilestoneForm]=useState({milestone_code:'',title:'',stage_key:'PRODUCTION',baseline_date:todayISO(),notes:''}),
        [loading,setLoading]=useState(true),
        [error,setError]=useState(''),
        [msg,setMsg]=useState('');

  const load=()=>{
    setLoading(true);
    return api.get('/projects')
      .then(setProjects)
      .catch(e=>setError(e.message||'خطا در بارگذاری پروژه‌ها'))
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{
    api.get('/customers').then(setCustomers).catch(()=>{});
    load();
  },[]);

  useEffect(()=>{
    if(initialProjectId){
      openDetail(initialProjectId);
    }
  },[initialProjectId]);

  const openDetail=id=>{
    api.get(`/projects/${id}`)
      .then(res=>{
        setSelectedProject(res);
      })
      .catch(e=>setError(e.message));
  };

  const saveBaselineSnapshot=async()=>{
    if(!baselineForm.baseline_name.trim())return;
    try{
      await api.post(`/projects/${selectedProject.id}/baselines`,{
        ...baselineForm,
        planned_start:selectedProject.planned_start,
        planned_finish:baselineForm.planned_finish||selectedProject.committed_delivery_date,
        contract_value:selectedProject.contract_value,
        is_active:true
      });
      setOpenBaselineModal(false);
      setBaselineForm({baseline_name:'',planned_finish:'',approved_by:'',notes:''});
      openDetail(selectedProject.id);
      load();
      setMsg('خط مبنای جدید با موفقیت ثبت شد.');
    }catch(e){
      setMsg(e.message);
    }
  };

  const saveCustomMilestone=async()=>{
    if(!milestoneForm.title.trim())return;
    try{
      await api.post(`/projects/${selectedProject.id}/milestones`,milestoneForm);
      setOpenMilestoneModal(false);
      setMilestoneForm({milestone_code:'',title:'',stage_key:'PRODUCTION',baseline_date:todayISO(),notes:''});
      openDetail(selectedProject.id);
      setMsg('نقطه عطف جدید با موفقیت ثبت شد.');
    }catch(e){
      setMsg(e.message);
    }
  };

  const updateMilestoneStatus=async(mid,status)=>{
    try{
      await api.patch(`/milestones/${mid}`,{status});
      openDetail(selectedProject.id);
    }catch(e){
      setError(e.message);
    }
  };

  const deleteMilestone=async(mid)=>{
    if(!window.confirm('آیا از حذف این نقطه عطف اطمینان دارید؟'))return;
    try{
      await api.delete(`/milestones/${mid}`);
      openDetail(selectedProject.id);
    }catch(e){
      setError(e.message);
    }
  };

  const saveProject=async()=>{
    setMsg('');
    if(!form.customer_id||!form.project_name.trim()){
      setMsg('مشتری و نام پروژه الزامی هستند.');
      return;
    }
    try{
      const payload={
        ...form,
        customer_id:Number(form.customer_id),
        contract_value:Number(form.contract_value||0)
      };
      const res=await api.post('/projects',payload);
      setOpenNew(false);
      setForm(freshProject());
      load();
      setMsg(`پروژه ${res.project_code} با موفقیت ثبت شد.`);
    }catch(e){
      setMsg(e.message);
    }
  };

  const updateStatus=async(id,status)=>{
    try{
      await api.patch(`/projects/${id}`,{status});
      load();
      if(selectedProject&&selectedProject.id===id){
        openDetail(id);
      }
    }catch(e){
      setError(e.message);
    }
  };

  const filtered=useMemo(()=>projects.filter(p=>{
    const text=[p.project_code,p.project_name,p.customer_name,p.site_location,p.project_manager].join(' ').toLowerCase();
    if(query&&!text.includes(query.trim().toLowerCase()))return false;
    if(statusFilter&&p.status!==statusFilter)return false;
    if(priorityFilter&&p.priority!==priorityFilter)return false;
    if(customerFilter&&String(p.customer_id)!==String(customerFilter))return false;
    return true;
  }),[projects,query,statusFilter,priorityFilter,customerFilter]);

  const stats=useMemo(()=>{
    const active=projects.filter(p=>!['CLOSED','CANCELLED'].includes(p.status));
    const inProd=projects.filter(p=>p.status==='IN_PRODUCTION');
    const critical=projects.filter(p=>['CRITICAL','HIGH'].includes(p.priority)&&!['CLOSED','CANCELLED'].includes(p.status));
    const totalVal=projects.reduce((sum,p)=>sum+Number(p.total_value||p.contract_value||0),0);
    return {total:projects.length,active:active.length,inProd:inProd.length,critical:critical.length,totalVal};
  },[projects]);

  return (
    <div className="page operational-page projects-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">مرکز راهبری پروژه‌های سازه</div>
          <h1>پروژه‌ها (Project Master)</h1>
          <p>تفکیک پروژه از سفارش؛ مدیریت متمرکز قرارداد، مهندسی، محل نصب و بچ‌های ساخت پایه چراغ.</p>
        </div>
        <button onClick={()=>setOpenNew(true)}>+ تعریف پروژه جدید</button>
      </div>

      {msg&&<div className={msg.includes('موفقیت')?'success':'error'}>{msg}</div>}
      {error&&<div className="error">{error}</div>}

      <section className="report-kpis">
        <div>
          <span>کل پروژه‌ها</span>
          <b>{stats.total}</b>
          <small>{stats.active} پروژه در جریان</small>
        </div>
        <div>
          <span>در حال ساخت و تولید</span>
          <b>{stats.inProd}</b>
          <small>پروژه روی خط تولید</small>
        </div>
        <div className={stats.critical?'report-warning':''}>
          <span>اولویت بحرانی / بالا</span>
          <b>{stats.critical}</b>
          <small>نیازمند ورود مستقیم</small>
        </div>
        <div>
          <span>مجموع ارزش قراردادها</span>
          <b>{money(stats.totalVal)}</b>
          <small>ریال</small>
        </div>
      </section>

      <section className="card operational-table">
        <div className="section-title">
          <div>
            <div className="eyebrow">فهرست کلان</div>
            <h2>شناسنامه پروژه‌ها</h2>
          </div>
          <span>{filtered.length} از {projects.length} پروژه</span>
        </div>

        <div className="order-archive-filter no-print">
          <label>
            <span>جست‌وجو</span>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="کد، نام پروژه، مشتری، سایت یا مدیر..."
            />
          </label>
          <label>
            <span>مشتری</span>
            <select value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)}>
              <option value="">همه مشتریان</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            <span>وضعیت پروژه</span>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>
            <span>اولویت</span>
            <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}>
              <option value="">همه اولویت‌ها</option>
              {Object.entries(priorityLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {(query||statusFilter||priorityFilter||customerFilter)&&(
            <button className="secondary" onClick={()=>{setQuery('');setStatusFilter('');setPriorityFilter('');setCustomerFilter('');}}>پاک کردن</button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد پروژه</th>
                <th>نام پروژه / محل نصب</th>
                <th>مشتری</th>
                <th>مدیر پروژه</th>
                <th>اولویت</th>
                <th>وضعیت</th>
                <th>پیشرفت</th>
                <th>تعهد تحویل / خط مبنا</th>
                <th>انحراف زمان (SV)</th>
                <th>ارزش (ریال)</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>(
                <tr key={p.id}>
                  <td>
                    <button className="order-no-link" onClick={()=>openDetail(p.id)}>
                      {p.project_code}
                    </button>
                  </td>
                  <td>
                    <b>{p.project_name}</b>
                    {p.site_location&&<small className="block-muted">{p.site_location}</small>}
                  </td>
                  <td>{p.customer_name}</td>
                  <td>{p.project_manager||'—'}</td>
                  <td>
                    <span className={`pill priority-${String(p.priority||'normal').toLowerCase()}`}>
                      {priorityLabels[p.priority]||p.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`order-status ${String(p.status).toLowerCase()}`}>
                      {statusLabels[p.status]||p.status}
                    </span>
                  </td>
                  <td>
                    <div className="table-progress">
                      <b>{p.progress||0}٪</b>
                      <div className="progress-track">
                        <i style={{width:`${p.progress||0}%`}} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{p.committed_delivery_date?toJalali(p.committed_delivery_date):'—'}</div>
                    {p.active_baseline&&<small className="block-muted">{p.active_baseline.baseline_name}</small>}
                  </td>
                  <td>
                    <span className={`pill schedule-${String(p.schedule_status||'on_track').toLowerCase()}`}>
                      {p.schedule_status==='ON_TRACK'?'طبق برنامه':
                       p.schedule_status==='AT_RISK'?`+${p.schedule_variance} روز (هشدار)`:
                       `+${p.schedule_variance} روز (تأخیر)`}
                    </span>
                  </td>
                  <td>{money(p.total_value||p.contract_value)}</td>
                  <td>
                    <div className="order-row-actions">
                      <button className="secondary" onClick={()=>openDetail(p.id)}>جزئیات</button>
                      <button className="secondary" onClick={()=>onNavigate?.('orders',{customerId:p.customer_id,projectId:p.id})}>+ پارت</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length===0&&<div className="empty">پروژه‌ای مطابق با فیلترهای انتخابی یافت نشد.</div>}
      </section>

      {/* مدال ثبت پروژه جدید */}
      {openNew&&(
        <Modal
          title="تعریف پروژه جدید"
          onClose={()=>setOpenNew(false)}
          className="order-entry-modal"
          actions={<><button className="secondary" onClick={()=>setOpenNew(false)}>انصراف</button><button onClick={saveProject}>ثبت و ایجاد پروژه</button></>}
        >
          <div className="form-grid compact-form">
            <label className="field">
              <span>مشتری طرف قرارداد *</span>
              <select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}>
                <option value="">انتخاب مشتری</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name} ({c.prefix})</option>)}
              </select>
            </label>
            <label className="field wide">
              <span>نام پروژه *</span>
              <input
                value={form.project_name}
                onChange={e=>setForm({...form,project_name:e.target.value})}
                placeholder="مثلاً روشنایی کمربندی شمالی یا پایه پرچم استادیوم..."
              />
            </label>
            <label className="field">
              <span>کد اختصاصی پروژه (اختیاری)</span>
              <input
                value={form.project_code}
                onChange={e=>setForm({...form,project_code:e.target.value})}
                placeholder="خالی بگذارید تا خودکار ایجاد شود"
              />
            </label>
            <label className="field">
              <span>محل نصب / سایت پروژه</span>
              <input
                value={form.site_location}
                onChange={e=>setForm({...form,site_location:e.target.value})}
                placeholder="مثلاً اصفهان - اتوبان فرودگاه"
              />
            </label>
            <label className="field">
              <span>مدیر پروژه</span>
              <input
                value={form.project_manager}
                onChange={e=>setForm({...form,project_manager:e.target.value})}
                placeholder="نام مدیر یا مسئول پروژه"
              />
            </label>
            <label className="field">
              <span>اولویت ساخت</span>
              <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>
                {Object.entries(priorityLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>وضعیت اولیه</span>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>ارزش قرارداد (ریال)</span>
              <input
                type="number"
                min="0"
                value={form.contract_value}
                onChange={e=>setForm({...form,contract_value:e.target.value})}
                placeholder="مبلغ برآوردی یا قطعی"
              />
            </label>
            <JalaliDateInput label="تاریخ عقد قرارداد" value={form.contract_date} onChange={v=>setForm({...form,contract_date:v})}/>
            <JalaliDateInput label="تاریخ تعهد تحویل" value={form.committed_delivery_date} onChange={v=>setForm({...form,committed_delivery_date:v})}/>
            <label className="field wide">
              <span>توضیحات و الزامات فنی پروژه</span>
              <textarea
                value={form.description}
                onChange={e=>setForm({...form,description:e.target.value})}
                placeholder="استانداردها، الزامات تست جوش، نقشه مصوب یا نکات خاص کارفرما..."
              />
            </label>
          </div>
          {msg&&<div className="error">{msg}</div>}
        </Modal>
      )}

      {/* دراور / مدال مشاهده شناسنامه کامل پروژه */}
      {selectedProject&&(
        <Modal
          title={`شناسنامه پروژه ${selectedProject.project_code}`}
          onClose={()=>setSelectedProject(null)}
          variant="drawer"
          className="order-drawer"
        >
          <div className="drawer-order-title">
            <div>
              <span>{selectedProject.customer_name}</span>
              <h2>{selectedProject.project_name}</h2>
              <small className="block-muted">{selectedProject.site_location||'بدون ثبت محل نصب'}</small>
            </div>
            <b className="debt-text">
              {money(selectedProject.total_value||selectedProject.contract_value)}
              <small>ارزش پروژه (ریال)</small>
            </b>
          </div>

          <div className="drawer-order-metrics">
            <div>
              <span>مدیر پروژه</span>
              <b>{selectedProject.project_manager||'تعیین‌نشده'}</b>
            </div>
            <div>
              <span>اولویت / ریسک</span>
              <b>{priorityLabels[selectedProject.priority]||selectedProject.priority}</b>
            </div>
            <div>
              <span>تعهد تحویل</span>
              <b>{selectedProject.committed_delivery_date?toJalali(selectedProject.committed_delivery_date):'—'}</b>
            </div>
            <div>
              <span>پیشرفت ساخت</span>
              <b>{selectedProject.progress||0}٪</b>
            </div>
          </div>

          {/* تب‌های داخلی دراور */}
          <div className="qc-tabs" style={{marginBottom:'1rem',marginTop:'0.5rem'}}>
            <button
              className={`qc-tab ${drawerTab==='overview'?'active':''}`}
              onClick={()=>setDrawerTab('overview')}
            >
              اطلاعات و بچ‌های ساخت ({selectedProject.orders?.length||0})
            </button>
            <button
              className={`qc-tab ${drawerTab==='schedule'?'active':''}`}
              onClick={()=>setDrawerTab('schedule')}
            >
              زمان‌بندی و خط مبنا ({selectedProject.milestones?.length||0} نقطه عطف)
            </button>
          </div>

          {drawerTab==='overview' && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-head">
                  <h4>تغییر وضعیت پروژه</h4>
                </div>
                <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                  <select
                    value={selectedProject.status}
                    onChange={e=>updateStatus(selectedProject.id,e.target.value)}
                    style={{flex:1,padding:'0.5rem'}}
                  >
                    {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-head">
                  <h4>سفارش‌ها و بچ‌های ساخت ({selectedProject.orders?.length||0} پارت)</h4>
                  <button className="secondary" onClick={()=>{
                    const cid=selectedProject.customer_id, pid=selectedProject.id;
                    setSelectedProject(null);
                    onNavigate?.('orders',{customerId:cid,projectId:pid});
                  }}>+ ثبت پارت جدید</button>
                </div>
                {(selectedProject.orders||[]).length===0?<p className="drawer-empty">هنوز سفارش یا پارتی برای این پروژه ثبت نشده است.</p>:(
                  selectedProject.orders.map(ord=>(
                    <div key={ord.id} className="drawer-product-row" style={{cursor:'default'}}>
                      <span>
                        <b>سفارش {ord.order_no}</b>
                        <small>ثبت: {toJalali(ord.order_date)} · تحویل: {ord.delivery_date?toJalali(ord.delivery_date):'—'}</small>
                      </span>
                      <span>{ord.items?.length||0} قلم کالا</span>
                      <b>{money(ord.total_amount)} ریال</b>
                    </div>
                  ))
                )}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-head">
                  <h4>محصولات و مشخصات فنی سازه</h4>
                </div>
                {(selectedProject.items||[]).length===0?<p className="drawer-empty">محصولی در این پروژه وجود ندارد.</p>:(
                  selectedProject.items.map(it=>(
                    <div key={it.id} className="drawer-product-row" style={{flexDirection:'column',alignItems:'flex-start',gap:'0.4rem'}}>
                      <div style={{display:'flex',justifyContent:'space-between',width:'100%'}}>
                        <b>{it.product_name} ({it.quantity} اصله)</b>
                        <small>پیشرفت: {it.progress||0}٪</small>
                      </div>
                      {it.pole_spec&&(
                        <div className="spec-chips" style={{marginTop:'0.2rem'}}>
                          <span className="spec-chip"><b>تیپ:</b> {it.pole_spec.pole_type||'چندضلعی'}</span>
                          <span className="spec-chip"><b>ارتفاع:</b> {it.pole_spec.height} متر</span>
                          <span className="spec-chip"><b>ورق:</b> {it.pole_spec.sheet_thickness} mm</span>
                          <span className="spec-chip"><b>قطر:</b> {it.pole_spec.bottom_diameter} به {it.pole_spec.top_diameter}</span>
                          <span className="spec-chip"><b>اضلاع:</b> {it.pole_spec.sides_count||'گرد'}</span>
                          <span className="spec-chip"><b>پوشش:</b> {it.pole_spec.surface_treatment}</span>
                          <span className="spec-chip"><b>نقشه:</b> {it.pole_spec.drawing_number} ({it.pole_spec.drawing_revision})</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {drawerTab==='schedule' && (
            <div className="drawer-schedule-surface">
              {/* خلاصه شاخص‌های زمان‌بندی و خط مبنا */}
              <div className="schedule-kpi-grid">
                <div className="schedule-kpi-card">
                  <span>خط مبنای فعال</span>
                  <b>{selectedProject.active_baseline?.baseline_name || 'Rev 0'}</b>
                  <small>موعد مبنا: {selectedProject.active_baseline?.planned_finish ? toJalali(selectedProject.active_baseline.planned_finish) : '—'}</small>
                </div>
                <div className="schedule-kpi-card">
                  <span>تعهد / پیش‌بینی تحویل</span>
                  <b>{selectedProject.committed_delivery_date ? toJalali(selectedProject.committed_delivery_date) : '—'}</b>
                  <small>شروع: {selectedProject.planned_start ? toJalali(selectedProject.planned_start) : '—'}</small>
                </div>
                <div className={`schedule-kpi-card ${selectedProject.schedule_variance > 7 ? 'is-danger' : selectedProject.schedule_variance > 0 ? 'is-warning' : 'is-success'}`}>
                  <span>انحراف زمان (Schedule Variance)</span>
                  <b>
                    {selectedProject.schedule_variance === 0 ? '۰ روز' :
                     selectedProject.schedule_variance > 0 ? `+${selectedProject.schedule_variance} روز` :
                     `${selectedProject.schedule_variance} روز`}
                  </b>
                  <small>وضعیت: {selectedProject.schedule_status_label || 'طبق برنامه'}</small>
                </div>
                <div className="schedule-kpi-card">
                  <span>تحقق نقاط عطف</span>
                  <b>{selectedProject.milestones_summary?.achieved || 0} از {selectedProject.milestones_summary?.total || 0}</b>
                  <small>{selectedProject.milestones_summary?.delayed ? `${selectedProject.milestones_summary.delayed} مورد معوق` : 'تمام نقاط طبق برنامه'}</small>
                </div>
              </div>

              {/* دکمه‌های اقدام زمان‌بندی */}
              <div className="schedule-actions-bar">
                <button
                  className="secondary"
                  onClick={()=>{
                    setBaselineForm({
                      baseline_name:`Rev ${(selectedProject.baselines?.length||1)} - اصلاح زمان‌بندی`,
                      planned_finish:selectedProject.committed_delivery_date||todayISO(),
                      approved_by:selectedProject.project_manager||'مدیریت پروژه',
                      notes:''
                    });
                    setOpenBaselineModal(true);
                  }}
                >
                  📸 ثبت نسخه جدید خط مبنا (Snapshot Rev N)
                </button>
                <button
                  className="secondary"
                  onClick={()=>{
                    setMilestoneForm({
                      milestone_code:`M${(selectedProject.milestones?.length||0)+1}`,
                      title:'',
                      stage_key:'PRODUCTION',
                      baseline_date:todayISO(),
                      notes:''
                    });
                    setOpenMilestoneModal(true);
                  }}
                >
                  + افزودن نقطه عطف سازه
                </button>
              </div>

              {/* فهرست نقاط عطف کلیدی سازه */}
              <div className="drawer-section" style={{marginTop:'1rem'}}>
                <div className="drawer-section-head">
                  <h4>نقاط عطف مهندسی و ساخت ({selectedProject.milestones?.length||0} مرحله تعهدشده)</h4>
                </div>
                {(selectedProject.milestones||[]).length===0?(
                  <p className="drawer-empty">نقطه عطفی برای این پروژه ثبت نشده است.</p>
                ):(
                  <div className="milestones-timeline-list">
                    {selectedProject.milestones.map(m=>{
                      const isAchieved = m.status === 'ACHIEVED';
                      const isDelayed = m.status === 'DELAYED' || m.is_delayed;
                      return (
                        <div key={m.id} className={`milestone-card-row ${isAchieved ? 'is-achieved' : isDelayed ? 'is-delayed' : ''}`}>
                          <div className="milestone-badge-code">{m.milestone_code || 'M'}</div>
                          <div className="milestone-main-info">
                            <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'wrap'}}>
                              <b>{m.title}</b>
                              <span className="spec-chip">رکن: {stageKeyLabels[m.stage_key] || m.stage_key || 'عمومی'}</span>
                            </div>
                            <div className="milestone-dates-line">
                              <span>خط مبنا: <b>{m.baseline_date ? toJalali(m.baseline_date) : '—'}</b></span>
                              {m.actual_date ? (
                                <span className="text-success">تحقق واقعی: <b>{toJalali(m.actual_date)}</b></span>
                              ) : (
                                <span>پیش‌بینی: <b>{m.forecast_date ? toJalali(m.forecast_date) : '—'}</b></span>
                              )}
                              {m.variance_days > 0 && !isAchieved && (
                                <span className="pill-delayed-alert">+{m.variance_days} روز انحراف</span>
                              )}
                            </div>
                            {m.notes && <small className="block-muted">{m.notes}</small>}
                          </div>
                          <div className="milestone-controls">
                            <select
                              value={m.status}
                              onChange={e=>updateMilestoneStatus(m.id, e.target.value)}
                              className="milestone-status-select"
                            >
                              {Object.entries(milestoneStatusLabels).map(([k,v])=>(
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            {!isAchieved && (
                              <button
                                className="small-action-btn success-btn"
                                title="ثبت تحقق و تکمیل این نقطه عطف"
                                onClick={()=>updateMilestoneStatus(m.id, 'ACHIEVED')}
                              >
                                ✓ پاس شد
                              </button>
                            )}
                            <button
                              className="small-action-btn delete-btn"
                              title="حذف نقطه عطف"
                              onClick={()=>deleteMilestone(m.id)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* تاریخچه خطوط مبنای قبلی (در صورت وجود بیش از یک نسخه) */}
              {(selectedProject.baselines||[]).length > 1 && (
                <div className="drawer-section" style={{marginTop:'1rem'}}>
                  <div className="drawer-section-head">
                    <h4>تاریخچه نسخه‌های خط مبنا ({selectedProject.baselines.length} نسخه)</h4>
                  </div>
                  <div className="baseline-history-list">
                    {selectedProject.baselines.map(b=>(
                      <div key={b.id} className={`baseline-history-row ${b.is_active ? 'is-active-baseline' : ''}`}>
                        <div>
                          <b>{b.baseline_name}</b>
                          {b.is_active ? <span className="pill schedule-on_track" style={{marginRight:'0.5rem'}}>نسخه فعال</span> : null}
                          <small className="block-muted">ثبت: {toJalali(b.baseline_date)} · پایان تعهد: {b.planned_finish ? toJalali(b.planned_finish) : '—'}</small>
                        </div>
                        <small>{b.approved_by || 'مصوب مدیریت'}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="drawer-links">
            <button onClick={()=>{
              const pid=selectedProject.id;
              setSelectedProject(null);
              onNavigate?.('reports',{projectId:pid});
            }}>مشاهده گزارش کامل</button>
            <button className="secondary" onClick={()=>setSelectedProject(null)}>بستن</button>
          </div>
        </Modal>
      )}

      {/* مدال ثبت اسنپ‌شات خط مبنای جدید */}
      {openBaselineModal && selectedProject && (
        <Modal
          title={`ثبت خط مبنای جدید برای پروژه ${selectedProject.project_code}`}
          onClose={()=>setOpenBaselineModal(false)}
          className="order-entry-modal"
          actions={
            <>
              <button className="secondary" onClick={()=>setOpenBaselineModal(false)}>انصراف</button>
              <button onClick={saveBaselineSnapshot}>ثبت و اعمال به عنوان خط مبنای فعال</button>
            </>
          }
        >
          <div className="form-grid compact-form">
            <label className="field wide">
              <span>عنوان نسخه خط مبنا *</span>
              <input
                value={baselineForm.baseline_name}
                onChange={e=>setBaselineForm({...baselineForm,baseline_name:e.target.value})}
                placeholder="مثلاً: Rev 1 - تمدید قرارداد و اصلاح زمان‌بندی"
              />
            </label>
            <JalaliDateInput
              label="تاریخ موعد تحویل جدید در خط مبنا *"
              value={baselineForm.planned_finish}
              onChange={v=>setBaselineForm({...baselineForm,planned_finish:v})}
            />
            <label className="field">
              <span>تصویب‌کننده / مرجع تأیید</span>
              <input
                value={baselineForm.approved_by}
                onChange={e=>setBaselineForm({...baselineForm,approved_by:e.target.value})}
                placeholder="مثلاً مهندس رضوانی / کارفرما"
              />
            </label>
            <label className="field wide">
              <span>علت و یادداشت تغییر خط مبنا</span>
              <textarea
                value={baselineForm.notes}
                onChange={e=>setBaselineForm({...baselineForm,notes:e.target.value})}
                placeholder="علت بازنگری در خط مبنا (الحاقیه قرارداد، تاخیر مجاز تدارکات، تغییر نقشه...)"
              />
            </label>
          </div>
        </Modal>
      )}

      {/* مدال افزودن نقطه عطف سفارشی */}
      {openMilestoneModal && selectedProject && (
        <Modal
          title="افزودن نقطه عطف مهندسی / ساخت"
          onClose={()=>setOpenMilestoneModal(false)}
          className="order-entry-modal"
          actions={
            <>
              <button className="secondary" onClick={()=>setOpenMilestoneModal(false)}>انصراف</button>
              <button onClick={saveCustomMilestone}>ثبت نقطه عطف</button>
            </>
          }
        >
          <div className="form-grid compact-form">
            <label className="field">
              <span>کد نقطه عطف</span>
              <input
                value={milestoneForm.milestone_code}
                onChange={e=>setMilestoneForm({...milestoneForm,milestone_code:e.target.value})}
                placeholder="مثلاً M6 یا M-TEST"
              />
            </label>
            <label className="field">
              <span>مرحله سازه مربوطه</span>
              <select
                value={milestoneForm.stage_key}
                onChange={e=>setMilestoneForm({...milestoneForm,stage_key:e.target.value})}
              >
                {Object.entries(stageKeyLabels).map(([k,v])=>(
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field wide">
              <span>عنوان نقطه عطف *</span>
              <input
                value={milestoneForm.title}
                onChange={e=>setMilestoneForm({...milestoneForm,title:e.target.value})}
                placeholder="مثلاً آزمون التراسونیک جوش فلنج یا تحویل پارت اول..."
              />
            </label>
            <JalaliDateInput
              label="تاریخ موعد تعهد شده در خط مبنا *"
              value={milestoneForm.baseline_date}
              onChange={v=>setMilestoneForm({...milestoneForm,baseline_date:v})}
            />
            <label className="field wide">
              <span>توضیحات و الزامات تحویل این مایل‌استون</span>
              <textarea
                value={milestoneForm.notes}
                onChange={e=>setMilestoneForm({...milestoneForm,notes:e.target.value})}
                placeholder="معیار پذیرش، مستندات مورد نیاز، بازرس..."
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
