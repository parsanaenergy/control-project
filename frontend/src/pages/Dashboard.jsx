import {useEffect, useMemo, useState} from 'react';
import {
  Clock, ShieldCheck, ShieldAlert, ShoppingCart, CreditCard,
  Truck, AlertTriangle, AlertCircle, CheckCircle2, Info,
  Plus, RefreshCw, FolderKanban, Activity, ArrowLeft
} from 'lucide-react';
import {api} from '../api';
import {toJalali} from '../jalali';
import JalaliDateInput from '../components/JalaliDateInput';
import Modal from '../components/Modal';
import OrderDrawer from '../components/OrderDrawer';
import ProductDetailModal from '../components/ProductDetailModal';
import {calcWeightedProgress} from '../progress';

const money = n => Number(n || 0).toLocaleString('fa-IR');
const today = new Date();
today.setHours(0, 0, 0, 0);
const dateOf = value => (value ? new Date(`${value}T00:00:00`) : null);

function formatEventTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const timeStr = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = toJalali(iso.slice(0, 10));
    return `${dateStr} · ${timeStr}`;
  } catch {
    return iso;
  }
}

const progress = item => calcWeightedProgress(item.stages);

function summary(order) {
  const items = order.items || [];
  const total = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const shipped = items.reduce((sum, i) => sum + Number(i.shipped_quantity || 0), 0);
  const value = items.length ? Math.round(items.reduce((sum, i) => sum + progress(i), 0) / items.length) : 0;
  const due = dateOf(order.delivery_date);
  const overdue = Boolean(due && due < today && value < 100);
  const near = Boolean(due && !overdue && (due - today) / 86400000 <= 7 && value < 100);
  const remaining = Math.max(total - shipped, 0);
  const hasBlocked = items.some(i => (i.stages || []).some(s => s.status === 'BLOCKED'));
  const risk =
    (hasBlocked ? 50 : 0) +
    (overdue ? 45 : 0) +
    (near ? 20 : 0) +
    (Number(order.balance) > 0 ? 20 : 0) +
    (remaining > 0 ? 10 : 0) +
    (value < 30 && value < 100 ? 10 : 0);
  return {progress: value, overdue, near, remaining, hasBlocked, score: Math.min(risk, 100)};
}

function taskTone(task) {
  if (task.status === 'BLOCKED') return {tone: 'late', label: 'متوقف (مانع)'};
  const due = dateOf(task.due_date);
  const reminder = dateOf(task.reminder_date);
  if (due && due < today) return {tone: 'late', label: 'عقب‌افتاده'};
  if ((due && due <= today) || (reminder && reminder <= today)) return {tone: 'today', label: 'پیگیری امروز'};
  return {tone: 'open', label: task.status === 'IN_PROGRESS' ? 'در حال انجام' : 'باز'};
}

export default function Dashboard({onNavigate}) {
  const [data, setData] = useState(null);
  const [controlTower, setControlTower] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventCounts, setEventCounts] = useState({ INFO: 0, WARNING: 0, CRITICAL: 0, SUCCESS: 0 });
  const [eventsTotal, setEventsTotal] = useState(0);
  const [activeEventTab, setActiveEventTab] = useState('ALL');
  const [manualEventOpen, setManualEventOpen] = useState(false);
  const [manualEventForm, setManualEventForm] = useState({
    event_type: 'PROJECT',
    severity: 'INFO',
    title: '',
    message: '',
    actor: 'مدیریت کارخانه',
  });
  const [submittingEvent, setSubmittingEvent] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [risk, setRisk] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [blockersOpen, setBlockersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    return Promise.all([
      api.get(`/dashboard${customerId ? `?customer_id=${customerId}` : ''}`),
      api.get('/control-tower/summary').catch(() => null),
      api.get('/system-events?limit=40').catch(() => null)
    ])
      .then(([dashResult, towerResult, eventsResult]) => {
        setData(dashResult);
        if (towerResult) setControlTower(towerResult);
        if (eventsResult) {
          setEvents(eventsResult.items || []);
          setEventCounts(eventsResult.severity_counts || {});
          setEventsTotal(eventsResult.total || 0);
        }
        setUpdated(new Date());
      })
      .catch(e => setError(e.message || 'خطا در دریافت اطلاعات داشبورد'))
      .finally(() => setLoading(false));
  };

  const handleEventTabChange = (tabKey) => {
    setActiveEventTab(tabKey);
    let query = '/system-events?limit=40';
    if (tabKey === 'CRITICAL') query += '&severity=CRITICAL';
    else if (tabKey === 'WARNING') query += '&severity=WARNING';
    else if (tabKey === 'QC') query += '&event_type=QC';
    else if (tabKey === 'MATERIALS') query += '&event_type=BOM';
    else if (tabKey === 'FINANCE') query += '&event_type=PAYMENT';
    api.get(query).then(res => {
      setEvents(res.items || []);
      if (res.severity_counts) setEventCounts(res.severity_counts);
      setEventsTotal(res.total || 0);
    }).catch(() => {});
  };

  const submitManualEvent = (e) => {
    e.preventDefault();
    if (!manualEventForm.title.trim() || !manualEventForm.message.trim()) return;
    setSubmittingEvent(true);
    api.post('/system-events', manualEventForm)
      .then(newEv => {
        setEvents(prev => [newEv, ...prev]);
        setManualEventOpen(false);
        setManualEventForm({
          event_type: 'PROJECT',
          severity: 'INFO',
          title: '',
          message: '',
          actor: 'مدیریت کارخانه',
        });
        load();
      })
      .catch(err => alert(err.message || 'خطا در ثبت رویداد'))
      .finally(() => setSubmittingEvent(false));
  };

  useEffect(() => {
    api.get('/customers').then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [customerId]);

  const orders = useMemo(() => data?.projects?.map(order => ({...order, summary: summary(order)})) || [], [data]);

  const activeOrders = useMemo(() => {
    return orders.filter(order => {
      const due = dateOf(order.delivery_date);
      const from = dateOf(dateFrom);
      const to = dateOf(dateTo);
      if (from && (!due || due < from)) return false;
      if (to && (!due || due > to)) return false;
      if (risk === 'blocked' && !order.summary.hasBlocked) return false;
      if (risk === 'attention' && order.summary.score < 20) return false;
      if (risk === 'late' && !order.summary.overdue) return false;
      if (risk === 'finance' && Number(order.balance) <= 0) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, risk]);

  const products = useMemo(() => {
    return activeOrders.flatMap(order =>
      (order.items || []).map(item => {
        const itemBlocked = (item.stages || []).some(s => s.status === 'BLOCKED');
        return {
          order,
          item,
          score: Math.min(
            (itemBlocked ? 50 : 0) +
            (order.summary.overdue ? 45 : 0) +
            (order.summary.near ? 20 : 0) +
            (Number(order.balance) > 0 ? 20 : 0) +
            (Number(item.remaining_quantity) > 0 ? 10 : 0) +
            (progress(item) < 30 && progress(item) < 100 ? 10 : 0),
            100
          ),
        };
      })
    );
  }, [activeOrders]);

  const operationTasks = (data?.operation_tasks || []).filter(task =>
    activeOrders.some(order => String(order.id) === String(task.order_id))
  );

  const taskStats = useMemo(() => {
    return operationTasks.reduce(
      (acc, task) => {
        acc[taskTone(task).tone] += 1;
        return acc;
      },
      {late: 0, today: 0, open: 0}
    );
  }, [operationTasks]);

  const delivery = {
    late: activeOrders.filter(order => order.summary.overdue),
    near: activeOrders.filter(order => order.summary.near),
    safe: activeOrders.filter(order => !order.summary.overdue && !order.summary.near),
  };
  const deliveryTotal = Math.max(activeOrders.length, 1);
  const deliveryHealth = activeOrders.length ? Math.round((delivery.safe.length / activeOrders.length) * 100) : 0;

  const actionItems = useMemo(() => {
    const blockerActions = (data?.blockers || []).map(b => ({
      kind: 'blocked',
      score: 100,
      title: b.title || `توقف در ${b.stage_name_fa}`,
      subtitle: `${b.order_no} · ${b.customer_name}${b.product_name ? ` · ${b.product_name}` : ''}`,
      detail: `علت مانع: ${b.block_reason}`,
      order: orders.find(o => String(o.id) === String(b.order_id)),
      blocker: b,
    }));

    const productActions = products
      .filter(x => x.score >= 20)
      .map(x => ({
        kind: Number(x.order.balance) > 0 ? 'finance' : 'delivery',
        score: x.score,
        title: x.item.product_name,
        subtitle: `${x.order.order_no} · ${x.order.customer_name}`,
        detail: x.order.summary.overdue
          ? 'تحویل عقب‌افتاده'
          : x.order.summary.near
          ? 'موعد تحویل نزدیک'
          : `${money(x.order.balance)} مانده وصول`,
        order: x.order,
        item: x.item,
      }));

    const taskActions = operationTasks
      .filter(t => ['late', 'today'].includes(taskTone(t).tone) || t.status === 'BLOCKED')
      .map(task => ({
        kind: task.status === 'BLOCKED' ? 'blocked' : 'operations',
        score: task.status === 'BLOCKED' ? 98 : taskTone(task).tone === 'late' ? 95 : 60,
        title: task.title,
        subtitle: `${task.department === 'PURCHASE' ? 'خرید' : 'تولید'} · ${task.product_name || task.order_no}`,
        detail: task.block_reason ? `مانع: ${task.block_reason}` : task.due_date ? `موعد ${toJalali(task.due_date)}` : 'پیگیری امروز',
        task,
      }));

    return [...blockerActions, ...productActions, ...taskActions].sort((a, b) => b.score - a.score);
  }, [products, operationTasks, data?.blockers, orders]);

  const deliveryPlan = useMemo(() => {
    return activeOrders
      .filter(order => {
        const due = dateOf(order.delivery_date);
        return due && due >= today && due <= new Date(today.getTime() + 30 * 86400000) && order.summary.remaining > 0;
      })
      .sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)));
  }, [activeOrders]);

  const selectedOrder = orders.find(order => String(order.id) === String(selectedOrderId));
  const filterCount = Number(Boolean(customerId)) + Number(Boolean(dateFrom || dateTo)) + Number(risk !== 'all');
  const openOrder = order => setSelectedOrderId(String(order.id));
  const openProduct = (order, item) => {
    setSelectedOrderId('');
    setSelectedProduct({order, item});
  };

  const handleAction = action => {
    if (action.kind === 'blocked' && action.blocker) {
      if (action.blocker.kind === 'stage') {
        onNavigate?.('control', {orderId: action.blocker.order_id});
      } else {
        onNavigate?.(action.blocker.stage_name_fa.includes('خرید') ? 'purchase' : 'production', {
          orderId: action.blocker.order_id,
        });
      }
      return;
    }
    if (action.order) {
      openOrder(action.order);
    } else if (action.task) {
      onNavigate?.(action.task.department === 'PURCHASE' ? 'purchase' : 'production', {
        orderId: action.task.order_id,
        productId: action.task.order_item_id || undefined,
      });
    }
  };

  const exportCsv = () => {
    const head = ['سفارش', 'مشتری', 'محصول', 'پیشرفت وزنی', 'مانده ارسال', 'مانده وصول', 'موعد تحویل'];
    const lines = products.map(({order, item}) => [
      order.order_no,
      order.customer_name,
      item.product_name,
      `${progress(item)}%`,
      item.remaining_quantity,
      order.balance,
      order.delivery_date ? toJalali(order.delivery_date) : '',
    ]);
    const blob = new Blob(
      ['\ufeff' + [head, ...lines].map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')],
      {type: 'text/csv;charset=utf-8'}
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'dashboard-actions.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!data && loading) return <div className="loading">در حال آماده‌سازی مرکز تصمیم…</div>;
  if (!data)
    return (
      <div className="load-error">
        <h2>داشبورد دریافت نشد</h2>
        <p>{error || 'اتصال به سرور برقرار نیست.'}</p>
        <button onClick={load}>تلاش مجدد</button>
      </div>
    );

  const blockedCount = data?.metrics?.blocked_count || 0;

  return (
    <div className="page dashboard-page decision-dashboard">
      <header className="decision-header">
        <div>
          <span>مرکز فرماندهی و تصمیم کارخانه</span>
          <h1>امروز چه چیزی نیاز به ورود دارد؟</h1>
          <p>
            {loading
              ? 'در حال به‌روزرسانی…'
              : `به‌روزرسانی ${updated ? updated.toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'}) : '—'} · شامل موانع اجرایی و پیشرفت وزنی سازه‌ها`}
          </p>
        </div>
        <div className="decision-header-actions no-print">
          <button className={filterCount ? 'filter-button active' : 'filter-button'} onClick={() => setFiltersOpen(true)}>
            فیلترها{filterCount ? ` · ${filterCount}` : ''}
          </button>
          <button className="secondary" onClick={load} disabled={loading}>
            {loading ? '…' : 'به‌روزرسانی'}
          </button>
          <div className="decision-menu">
            <button className="secondary" onClick={() => setMenuOpen(x => !x)} aria-expanded={menuOpen}>
              اقدامات
            </button>
            {menuOpen && (
              <div>
                <button onClick={() => { exportCsv(); setMenuOpen(false); }}>خروجی CSV</button>
                <button onClick={() => { window.print(); setMenuOpen(false); }}>چاپ نمای فعلی</button>
                <button onClick={() => { onNavigate?.('reports'); setMenuOpen(false); }}>گزارش‌های کامل</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {/* 4-PILLAR FACTORY CONTROL TOWER */}
      <section className="control-tower-container" aria-label="برج کنترل عملیات کارخانه">
        <div className="control-tower-head">
          <div className="control-tower-title-group">
            <Activity size={18} color="#38bdf8" />
            <h2>برج کنترل عملیات کارخانه (Factory Control Tower)</h2>
            <span className="live-indicator">
              <span className="live-dot" />
              پایش بلادرنگ ۴ رکن
            </span>
          </div>
          <small style={{color: '#94a3b8', fontSize: '11px'}}>
            کلیک روی هر ستون جهت ورود به پنل اختصاصی
          </small>
        </div>

        <div className="control-tower-pillars-grid">
          {/* Pillar 1: Schedule & Projects */}
          <div
            className="tower-pillar-card pillar-schedule"
            onClick={() => onNavigate?.('projects')}
            title="مشاهده و مدیریت برنامه زمان‌بندی پروژه‌ها"
          >
            <div className="pillar-top-row">
              <span className="pillar-label-group">
                <FolderKanban size={15} color="#38bdf8" />
                رکن ۱: زمان‌بندی و موعدها
              </span>
              <span className="pillar-action-hint">پروژه‌ها ←</span>
            </div>
            <div className="pillar-main-metric">
              <span className="pillar-metric-num">
                {controlTower?.schedule?.total_active_projects || activeOrders.length}
              </span>
              <span className="pillar-metric-sub">پروژه فعال در خط</span>
            </div>
            <div className="pillar-sub-stats">
              <div className="pillar-stat-chip">
                <span>طبق برنامه:</span>
                <b>{controlTower?.schedule?.on_track_count || 0}</b>
              </div>
              <div className={`pillar-stat-chip ${(controlTower?.schedule?.at_risk_count || 0) + (controlTower?.schedule?.delayed_count || 0) > 0 ? 'is-warning' : ''}`}>
                <span>تأخیر/ریسک:</span>
                <b>{(controlTower?.schedule?.at_risk_count || 0) + (controlTower?.schedule?.delayed_count || 0)}</b>
              </div>
              <div className={`pillar-stat-chip ${(controlTower?.schedule?.blocked_stages_count || 0) > 0 ? 'is-alert' : ''}`} style={{gridColumn: 'span 2'}}>
                <span>ایستگاه‌های متوقف (گلوگاه):</span>
                <b>{controlTower?.schedule?.blocked_stages_count || blockedCount}</b>
              </div>
            </div>
          </div>

          {/* Pillar 2: Quality & NCR */}
          <div
            className="tower-pillar-card pillar-quality"
            onClick={() => onNavigate?.('qc')}
            title="مشاهده گیت‌های کیفی و پرونده‌های NCR"
          >
            <div className="pillar-top-row">
              <span className="pillar-label-group">
                <ShieldCheck size={15} color="#a855f7" />
                رکن ۲: کیفیت و انطباق (QC)
              </span>
              <span className="pillar-action-hint">گیت‌ها و NCR ←</span>
            </div>
            <div className="pillar-main-metric">
              <span className="pillar-metric-num">
                {controlTower?.quality?.first_pass_yield ?? 100}٪
              </span>
              <span className="pillar-metric-sub">عبور مستقیم کیفی (FPY)</span>
            </div>
            <div className="pillar-sub-stats">
              <div className="pillar-stat-chip">
                <span>کل بازرسی‌ها:</span>
                <b>{controlTower?.quality?.total_inspections || 0}</b>
              </div>
              <div className={`pillar-stat-chip ${(controlTower?.quality?.open_ncrs_count || 0) > 0 ? 'is-alert' : ''}`}>
                <span>پرونده باز NCR:</span>
                <b>{controlTower?.quality?.open_ncrs_count || 0}</b>
              </div>
              <div className={`pillar-stat-chip ${(controlTower?.quality?.critical_ncrs_count || 0) > 0 ? 'is-alert' : ''}`} style={{gridColumn: 'span 2'}}>
                <span>عدم انطباق بحرانی:</span>
                <b>{controlTower?.quality?.critical_ncrs_count || 0}</b>
              </div>
            </div>
          </div>

          {/* Pillar 3: Materials & Steel Supply */}
          <div
            className="tower-pillar-card pillar-materials"
            onClick={() => onNavigate?.('purchase')}
            title="مشاهده تدارکات مواد و ساختار شکست مواد BOM"
          >
            <div className="pillar-top-row">
              <span className="pillar-label-group">
                <ShoppingCart size={15} color="#f59e0b" />
                رکن ۳: تأمین فولاد و متریال
              </span>
              <span className="pillar-action-hint">تدارکات و انبار ←</span>
            </div>
            <div className="pillar-main-metric">
              <span className="pillar-metric-num">
                {controlTower?.materials?.steel_weight_ton || 0}
              </span>
              <span className="pillar-metric-sub">تن ورق و پروفیل در جریان</span>
            </div>
            <div className="pillar-sub-stats">
              <div className={`pillar-stat-chip ${(controlTower?.materials?.shortage_count || 0) > 0 ? 'is-alert' : ''}`}>
                <span>کسری انبار:</span>
                <b>{controlTower?.materials?.shortage_count || 0}</b>
              </div>
              <div className="pillar-stat-chip">
                <span>سفارش‌گذاری شده:</span>
                <b>{controlTower?.materials?.ordered_count || 0}</b>
              </div>
              <div className="pillar-stat-chip" style={{gridColumn: 'span 2'}}>
                <span>تأمین‌شده (آماده خط):</span>
                <b>{controlTower?.materials?.in_stock_count || 0} قلم</b>
              </div>
            </div>
          </div>

          {/* Pillar 4: Finance & Shipping */}
          <div
            className="tower-pillar-card pillar-finance"
            onClick={() => onNavigate?.('payments')}
            title="مشاهده تسویه‌حساب‌ها و گارد خروج بار"
          >
            <div className="pillar-top-row">
              <span className="pillar-label-group">
                <CreditCard size={15} color="#10b981" />
                رکن ۴: انضباط مالی و خروج
              </span>
              <span className="pillar-action-hint">امور مالی ←</span>
            </div>
            <div className="pillar-main-metric">
              <span className="pillar-metric-num">
                {controlTower?.finance?.collection_rate ?? 0}٪
              </span>
              <span className="pillar-metric-sub">وصولی محقق‌شده</span>
            </div>
            <div className="pillar-sub-stats">
              <div className="pillar-stat-chip">
                <span>مانده مطالبات:</span>
                <b style={{fontSize: '10px'}}>{money(controlTower?.finance?.total_balance)}</b>
              </div>
              <div className={`pillar-stat-chip ${(controlTower?.finance?.debt_alerts_count || 0) > 0 ? 'is-alert' : ''}`}>
                <span>خروج با بدهی:</span>
                <b>{controlTower?.finance?.debt_alerts_count || 0}</b>
              </div>
              <div className="pillar-stat-chip" style={{gridColumn: 'span 2'}}>
                <span>ارزش پروژه‌ها:</span>
                <b style={{fontSize: '10px'}}>{money(controlTower?.finance?.total_contract_value)} ریال</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="decision-metrics" aria-label="وضعیت کلیدی">
        <button type="button" onClick={() => setActionsOpen(true)}>
          <span>سفارش فعال</span>
          <b>{activeOrders.length}</b>
          <small>در بازه انتخاب‌شده</small>
        </button>
        <button
          type="button"
          className={blockedCount > 0 ? 'alert blocked-metric' : ''}
          onClick={() => setBlockersOpen(true)}
        >
          <span>گلوگاه و موانع</span>
          <b>{blockedCount}</b>
          <small>{blockedCount > 0 ? 'نیاز به مداخله فوری' : 'بدون توقف فعال'}</small>
        </button>
        <button
          type="button"
          className={delivery.late.length || delivery.near.length ? 'alert' : ''}
          onClick={() => setDeliveryOpen(true)}
        >
          <span>تحویل در ریسک</span>
          <b>{delivery.late.length + delivery.near.length}</b>
          <small>{delivery.late.length} عقب‌افتاده</small>
        </button>
        <button type="button" onClick={() => setDeliveryOpen(true)}>
          <span>مانده ارسال</span>
          <b>{money(activeOrders.reduce((sum, order) => sum + order.summary.remaining, 0))}</b>
          <small>واحد محصول</small>
        </button>
        <button
          type="button"
          className={activeOrders.some(order => Number(order.balance) > 0) ? 'alert' : ''}
          onClick={() => setAlertsOpen(true)}
        >
          <span>مانده وصول</span>
          <b>{money(activeOrders.reduce((sum, order) => sum + Number(order.balance || 0), 0))}</b>
          <small>{activeOrders.filter(order => Number(order.balance) > 0).length} سفارش بدهکار</small>
        </button>
      </section>

      <section className="decision-overview">
        <article className="delivery-brief">
          <div className="brief-head">
            <div>
              <span>سلامت تحویل</span>
              <h2>{deliveryHealth}٪ طبق برنامه</h2>
            </div>
            <button className="text-button" onClick={() => setDeliveryOpen(true)}>
              برنامه تحویل
            </button>
          </div>
          <div className="health-bar" aria-label="نسبت وضعیت تحویل">
            <i className="safe" style={{width: `${(delivery.safe.length / deliveryTotal) * 100}%`}} />
            <i className="near" style={{width: `${(delivery.near.length / deliveryTotal) * 100}%`}} />
            <i className="late" style={{width: `${(delivery.late.length / deliveryTotal) * 100}%`}} />
          </div>
          <div className="health-key">
            <span><i className="safe" />طبق برنامه <b>{delivery.safe.length}</b></span>
            <span><i className="near" />نزدیک موعد <b>{delivery.near.length}</b></span>
            <span><i className="late" />عقب‌افتاده <b>{delivery.late.length}</b></span>
          </div>
        </article>
        <article className="operations-brief">
          <div className="brief-head">
            <div>
              <span>عملیات باز</span>
              <h2>{operationTasks.length} فعالیت خرید و تولید</h2>
            </div>
            <button className="text-button" onClick={() => setActionsOpen(true)}>
              همه فعالیت‌ها
            </button>
          </div>
          <div className="operation-bars">
            <span>
              <i className="late" style={{width: `${(taskStats.late / Math.max(operationTasks.length, 1)) * 100}%`}} />
              عقب‌افتاده <b>{taskStats.late}</b>
            </span>
            <span>
              <i className="today" style={{width: `${(taskStats.today / Math.max(operationTasks.length, 1)) * 100}%`}} />
              پیگیری امروز <b>{taskStats.today}</b>
            </span>
            <span>
              <i className="open" style={{width: `${(taskStats.open / Math.max(operationTasks.length, 1)) * 100}%`}} />
              باز <b>{taskStats.open}</b>
            </span>
          </div>
        </article>
      </section>

      {/* FACTORY LIVE ACTIVITY STREAM */}
      <section className="activity-stream-section" aria-label="فید زنده رویدادهای کارخانه">
        <div className="stream-section-header">
          <div className="stream-title-area">
            <Activity size={16} color="#0284c7" />
            <h3>فید زنده رویدادها و لاگ ممیزی کارخانه (Live Activity Stream)</h3>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
            <div className="stream-filter-tabs">
              <button
                type="button"
                className={`stream-tab-btn ${activeEventTab === 'ALL' ? 'active' : ''}`}
                onClick={() => handleEventTabChange('ALL')}
              >
                همه وقایع <span className="stream-tab-count">{eventsTotal}</span>
              </button>
              <button
                type="button"
                className={`stream-tab-btn ${activeEventTab === 'CRITICAL' ? 'active' : ''}`}
                onClick={() => handleEventTabChange('CRITICAL')}
              >
                بحرانی <span className="stream-tab-count">{eventCounts.CRITICAL || 0}</span>
              </button>
              <button
                type="button"
                className={`stream-tab-btn ${activeEventTab === 'WARNING' ? 'active' : ''}`}
                onClick={() => handleEventTabChange('WARNING')}
              >
                هشدارها <span className="stream-tab-count">{eventCounts.WARNING || 0}</span>
              </button>
              <button
                type="button"
                className={`stream-tab-btn ${activeEventTab === 'QC' ? 'active' : ''}`}
                onClick={() => handleEventTabChange('QC')}
              >
                کیفیت (QC/NCR)
              </button>
              <button
                type="button"
                className={`stream-tab-btn ${activeEventTab === 'MATERIALS' ? 'active' : ''}`}
                onClick={() => handleEventTabChange('MATERIALS')}
              >
                تأمین متریال (BOM)
              </button>
              <button
                type="button"
                className={`stream-tab-btn ${activeEventTab === 'FINANCE' ? 'active' : ''}`}
                onClick={() => handleEventTabChange('FINANCE')}
              >
                مالی و واریزی
              </button>
            </div>
            <button
              type="button"
              className="stream-tab-btn"
              style={{background: '#0f172a', color: '#fff', borderColor: '#0f172a'}}
              onClick={() => setManualEventOpen(true)}
            >
              <Plus size={13} /> ثبت رویداد
            </button>
            <button
              type="button"
              className="stream-tab-btn"
              onClick={() => handleEventTabChange(activeEventTab)}
              title="به‌روزرسانی فید"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        <div className="stream-events-feed">
          {events.length === 0 ? (
            <div style={{textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px'}}>
              هیچ رویدادی در این دسته‌بندی یافت نشد.
            </div>
          ) : (
            events.map(ev => {
              const sev = ev.severity || 'INFO';
              const sevLabel =
                sev === 'CRITICAL' ? 'بحرانی' :
                sev === 'WARNING' ? 'هشدار' :
                sev === 'SUCCESS' ? 'موفق' : 'اطلاعیه';
              return (
                <div key={ev.id} className={`stream-event-card sev-${sev.toLowerCase()}`}>
                  <span className="stream-event-badge">{sevLabel}</span>
                  <div className="stream-event-body">
                    <div className="stream-event-headline">
                      <span className="stream-event-title">{ev.title}</span>
                      <span className="stream-event-time">
                        <Clock size={11} style={{display: 'inline', marginLeft: '4px', verticalAlign: 'middle'}} />
                        {formatEventTime(ev.created_at)}
                      </span>
                    </div>
                    <div className="stream-event-desc">{ev.message}</div>
                    <div className="stream-event-meta-row">
                      <span className="stream-event-actor">عامل: {ev.actor || 'سیستم'}</span>
                      {ev.entity_type && <span>موجودیت: {ev.entity_type}</span>}
                      {ev.event_type === 'QC' || ev.event_type === 'NCR' ? (
                        <button
                          type="button"
                          className="text-button"
                          style={{fontSize: '10px', padding: '0 4px'}}
                          onClick={() => onNavigate?.('qc')}
                        >
                          مشاهده در کنترل کیفیت ←
                        </button>
                      ) : ev.event_type === 'PROJECT' ? (
                        <button
                          type="button"
                          className="text-button"
                          style={{fontSize: '10px', padding: '0 4px'}}
                          onClick={() => onNavigate?.('projects')}
                        >
                          مشاهده در پروژه‌ها ←
                        </button>
                      ) : ev.event_type === 'STAGE' ? (
                        <button
                          type="button"
                          className="text-button"
                          style={{fontSize: '10px', padding: '0 4px'}}
                          onClick={() => onNavigate?.('control')}
                        >
                          مشاهده در خط کنترل ←
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="today-queue">
        <div className="queue-head">
          <div>
            <span>صف اقدام امروز</span>
            <h2>اولویت‌هایی که منتظر تصمیم‌اند</h2>
          </div>
          <button className="text-button" onClick={() => setActionsOpen(true)}>
            مشاهده همه ({actionItems.length})
          </button>
        </div>
        {actionItems.length === 0 ? (
          <div className="queue-empty">مورد فوری یا فعالیت نیازمند پیگیری برای فیلتر فعلی وجود ندارد.</div>
        ) : (
          <div>
            {actionItems.slice(0, 6).map((action, index) => (
              <button
                type="button"
                className={`decision-row ${action.kind}`}
                key={`${action.kind}-${index}`}
                onClick={() => handleAction(action)}
              >
                <span className="decision-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="decision-main">
                  <b>{action.title}</b>
                  <small>{action.subtitle} · {action.detail}</small>
                </span>
                <strong>
                  {action.kind === 'blocked' ? 'رفع مانع' : action.kind === 'operations' ? 'باز کردن' : 'جزئیات'}
                </strong>
              </button>
            ))}
          </div>
        )}
      </section>

      {filtersOpen && (
        <FilterModal
          customers={customers}
          state={{customerId, dateFrom, dateTo, risk}}
          onChange={({customerId: nextCustomer, dateFrom: nextFrom, dateTo: nextTo, risk: nextRisk}) => {
            setCustomerId(nextCustomer);
            setDateFrom(nextFrom);
            setDateTo(nextTo);
            setRisk(nextRisk);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {actionsOpen && (
        <ActionModal
          actions={actionItems}
          onClose={() => setActionsOpen(false)}
          onAction={handleAction}
        />
      )}

      {blockersOpen && (
        <BlockersModal
          blockers={data.blockers || []}
          onClose={() => setBlockersOpen(false)}
          onNavigate={onNavigate}
        />
      )}

      {deliveryOpen && (
        <DeliveryModal orders={deliveryPlan} onClose={() => setDeliveryOpen(false)} onOrder={openOrder} />
      )}

      {alertsOpen && (
        <AlertsModal alerts={data.alerts || []} orders={activeOrders} onClose={() => setAlertsOpen(false)} onOrder={openOrder} />
      )}

      {selectedOrder && (
        <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrderId('')} onNavigate={onNavigate} onProduct={openProduct} />
      )}

      {selectedProduct && (
        <ProductDetailModal order={selectedProduct.order} item={selectedProduct.item} onClose={() => setSelectedProduct(null)} onNavigate={onNavigate} />
      )}

      {manualEventOpen && (
        <ManualEventModal
          isOpen={manualEventOpen}
          onClose={() => setManualEventOpen(false)}
          form={manualEventForm}
          setForm={setManualEventForm}
          onSubmit={submitManualEvent}
          loading={submittingEvent}
        />
      )}
    </div>
  );
}

function FilterModal({customers, state, onChange, onClose}) {
  const [draft, setDraft] = useState(state);
  return (
    <Modal
      title="فیلترهای داشبورد"
      onClose={onClose}
      actions={
        <>
          <button className="secondary" onClick={() => setDraft({customerId: '', dateFrom: '', dateTo: '', risk: 'all'})}>
            پاک کردن
          </button>
          <button onClick={() => onChange(draft)}>اعمال فیلتر</button>
        </>
      }
    >
      <div className="dashboard-filter-form">
        <label className="field">
          <span>مشتری</span>
          <select value={draft.customerId} onChange={e => setDraft({...draft, customerId: e.target.value})}>
            <option value="">همه مشتریان</option>
            {customers.map(customer => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>سطح پیگیری</span>
          <select value={draft.risk} onChange={e => setDraft({...draft, risk: e.target.value})}>
            <option value="all">همه سفارش‌ها</option>
            <option value="blocked">دارای مانع یا توقف</option>
            <option value="attention">نیازمند پیگیری</option>
            <option value="late">فقط تحویل عقب‌افتاده</option>
            <option value="finance">فقط مانده وصول</option>
          </select>
        </label>
        <JalaliDateInput label="موعد تحویل از" value={draft.dateFrom} onChange={value => setDraft({...draft, dateFrom: value})} />
        <JalaliDateInput label="موعد تحویل تا" value={draft.dateTo} onChange={value => setDraft({...draft, dateTo: value})} />
      </div>
    </Modal>
  );
}

function ActionModal({actions, onClose, onAction}) {
  const [kind, setKind] = useState('all');
  const visible = kind === 'all' ? actions : actions.filter(item => item.kind === kind);
  const blockedCount = actions.filter(x => x.kind === 'blocked').length;

  return (
    <Modal title="همه اقدامات نیازمند پیگیری" onClose={onClose} className="action-modal">
      <div className="modal-tabs">
        <button className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>همه</button>
        {blockedCount > 0 && (
          <button className={kind === 'blocked' ? 'active' : ''} style={{color: '#b63838', fontWeight: 'bold'}} onClick={() => setKind('blocked')}>
            موانع ({blockedCount})
          </button>
        )}
        <button className={kind === 'delivery' ? 'active' : ''} onClick={() => setKind('delivery')}>تحویل</button>
        <button className={kind === 'operations' ? 'active' : ''} onClick={() => setKind('operations')}>عملیات</button>
        <button className={kind === 'finance' ? 'active' : ''} onClick={() => setKind('finance')}>مالی</button>
      </div>
      <div className="modal-list">
        {visible.length === 0 ? (
          <p className="drawer-empty">موردی برای این دسته وجود ندارد.</p>
        ) : (
          visible.map((action, index) => (
            <button
              type="button"
              key={`${action.kind}-${index}`}
              className={`decision-row ${action.kind}`}
              onClick={() => {
                onClose();
                onAction(action);
              }}
            >
              <span className="decision-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="decision-main">
                <b>{action.title}</b>
                <small>{action.subtitle} · {action.detail}</small>
              </span>
              <strong>
                {action.kind === 'blocked' ? 'رفع مانع' : action.kind === 'operations' ? 'باز کردن' : 'جزئیات'}
              </strong>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

function BlockersModal({blockers, onClose, onNavigate}) {
  return (
    <Modal title="گلوگاه‌ها و موانع فعال اجرایی" onClose={onClose} className="action-modal">
      <div className="modal-list">
        {blockers.length === 0 ? (
          <p className="drawer-empty">هیچ گلوگاه یا مانع فعالی در خط تولید یا خرید گزارش نشده است.</p>
        ) : (
          blockers.map((b, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom: '1px solid #f0dddd',
                background: '#fffbfb'
              }}
            >
              <div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span className="blocker-badge">متوقف</span>
                  <b style={{fontSize: '12px', color: '#8f2222'}}>{b.title || b.stage_name_fa}</b>
                </div>
                <div style={{fontSize: '11px', color: '#555', marginTop: '4px'}}>
                  سفارش: {b.order_no} ({b.customer_name}) {b.product_name ? `· محصول: ${b.product_name}` : ''}
                </div>
                <div style={{fontSize: '11px', color: '#a33', marginTop: '4px', fontWeight: 'bold'}}>
                  شرح مانع: {b.block_reason}
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  if (b.kind === 'ncr') {
                    onNavigate?.('qc', {orderId: b.order_id});
                  } else if (b.kind === 'stage') {
                    onNavigate?.('control', {orderId: b.order_id});
                  } else {
                    onNavigate?.(b.stage_name_fa?.includes('خرید') ? 'purchase' : 'production', {orderId: b.order_id});
                  }
                }}
              >
                {b.kind === 'ncr' ? 'میز کار QC' : 'ورود به کنترل'}
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function DeliveryModal({orders, onClose, onOrder}) {
  return (
    <Modal title="برنامه تحویل ۳۰ روزه" onClose={onClose} className="action-modal">
      <div className="modal-list">
        {orders.length === 0 ? (
          <p className="drawer-empty">سفارشی با مانده ارسال در ۳۰ روز آینده نیست.</p>
        ) : (
          orders.slice(0, 20).map(order => {
            const days = Math.ceil((dateOf(order.delivery_date) - today) / 86400000);
            return (
              <button
                type="button"
                className={`delivery-modal-row ${order.summary.overdue ? 'late' : order.summary.near ? 'near' : ''}`}
                key={order.id}
                onClick={() => {
                  onClose();
                  onOrder(order);
                }}
              >
                <b>{days} روز</b>
                <span>
                  {order.order_no} · {order.customer_name}
                  <small>{toJalali(order.delivery_date)} · {money(order.summary.remaining)} مانده ارسال</small>
                </span>
                <em>{money(order.balance)} مانده وصول</em>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}

function AlertsModal({alerts, orders, onClose, onOrder}) {
  return (
    <Modal title="هشدارهای مالی" onClose={onClose} className="action-modal">
      <div className="modal-list">
        {alerts.length === 0 ? (
          <p className="drawer-empty">هشدار مالی فعالی وجود ندارد.</p>
        ) : (
          alerts.map(alert => (
            <button
              type="button"
              className="finance-alert-row"
              key={alert.id}
              onClick={() => {
                const order = orders.find(x => String(x.id) === String(alert.order_id));
                if (order) {
                  onClose();
                  onOrder(order);
                }
              }}
            >
              <b>{alert.order_no || 'هشدار مالی'}</b>
              <span>{alert.message}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

function ManualEventModal({isOpen, onClose, form, setForm, onSubmit, loading}) {
  if (!isOpen) return null;
  return (
    <Modal title="ثبت رویداد یا پیام عملیاتی جدید" onClose={onClose} className="action-modal">
      <form onSubmit={onSubmit} style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
          <div>
            <label style={{fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>دسته‌بندی رویداد</label>
            <select
              value={form.event_type}
              onChange={e => setForm({...form, event_type: e.target.value})}
              style={{width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff'}}
            >
              <option value="PROJECT">پروژه و قرارداد</option>
              <option value="STAGE">خط تولید و ساخت</option>
              <option value="QC">کنترل کیفیت (QC)</option>
              <option value="NCR">عدم انطباق (NCR)</option>
              <option value="BOM">تدارکات و انبار متریال</option>
              <option value="PAYMENT">امور مالی و دریافت وجه</option>
              <option value="SHIPMENT">بارگیری و ارسال محموله</option>
            </select>
          </div>
          <div>
            <label style={{fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>سطح اهمیت (Severity)</label>
            <select
              value={form.severity}
              onChange={e => setForm({...form, severity: e.target.value})}
              style={{width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff'}}
            >
              <option value="INFO">اطلاعیه عمومی (INFO)</option>
              <option value="WARNING">هشدار عملیاتی (WARNING)</option>
              <option value="CRITICAL">بحرانی / توقف فوری (CRITICAL)</option>
              <option value="SUCCESS">موفقیت / اتمام کار (SUCCESS)</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>عنوان خلاصه رویداد</label>
          <input
            type="text"
            required
            placeholder="مثال: ورود ۲۰ تن شمش روی گالوانیزه به انبار کارخانه"
            value={form.title}
            onChange={e => setForm({...form, title: e.target.value})}
            style={{width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
          />
        </div>

        <div>
          <label style={{fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>شرح کامل و اقدامات لازم</label>
          <textarea
            required
            rows={3}
            placeholder="شرح دقیق رویداد، تأثیر بر برنامه ساخت، و اقدامات بعدی..."
            value={form.message}
            onChange={e => setForm({...form, message: e.target.value})}
            style={{width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontFamily: 'inherit'}}
          />
        </div>

        <div>
          <label style={{fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>ثبت‌کننده (نام / سمت)</label>
          <input
            type="text"
            value={form.actor}
            onChange={e => setForm({...form, actor: e.target.value})}
            style={{width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
          />
        </div>

        <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px'}}>
          <button type="button" className="secondary" onClick={onClose} disabled={loading}>
            انصراف
          </button>
          <button type="submit" disabled={loading} style={{background: '#0284c7', color: '#fff'}}>
            {loading ? 'در حال ثبت…' : 'ثبت در لاگ رویدادها'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
