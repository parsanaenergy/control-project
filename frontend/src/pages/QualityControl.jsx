import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import JalaliDateInput from '../components/JalaliDateInput';
import { toJalali, todayISO } from '../jalali';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock,
  Filter, Plus, Search, Layers, Hammer, Paintbrush, PackageCheck,
  FileSpreadsheet, Wrench, ArrowRight
} from 'lucide-react';

const GATE_INFO = {
  INCOMING_FORMING: {
    title: 'گیت ۱: متریال و خم‌کاری',
    subtitle: 'بررسی ضخامت ورق، گواهینامه فولاد، برش پلاسما و زاویه خم مقاطع چندضلعی',
    icon: Layers,
    color: '#3d7ea6',
    defaultChecks: ['بررسی شناسنامه ورق فولادی (ST37 / ST52)', 'کنترل ضخامت ورق با میکرومتر', 'تطابق زاویه خم و ابعاد مقطع با نقشه', 'بررسی لبه‌ها و پخ جوشکاری'],
    measureUnit: 'ضخامت ورق (mm)'
  },
  WELDING: {
    title: 'گیت ۲: بازرسی جوشکاری',
    subtitle: 'بازرسی چشمی (VT) جوش طولی بدنه، نفوذ کامل، جوش گلویی بیس‌پلیت و لچکی‌ها',
    icon: Hammer,
    color: '#d47a32',
    defaultChecks: ['آزمون چشمی جوش طولی (VT)', 'عدم وجود بریدگی کناره جوش (Undercut)', 'نفوذ کامل ریشه جوشکاری', 'جوشکاری پیوسته بیس‌پلیت و لچکی‌های تقویتی'],
    measureUnit: 'ضخامت گلویی جوش (mm)'
  },
  COATING: {
    title: 'گیت ۳: پوشش گالوانیزه / رنگ',
    subtitle: 'ضخامت‌سنجی پوشش گالوانیزه گرم، چسبندگی، عدم شره و یکنواختی رنگ الکترواستاتیک',
    icon: Paintbrush,
    color: '#7b52ab',
    defaultChecks: ['ضخامت‌سنجی پوشش گالوانیزه (حداقل ۸۰ میکرون)', 'تست چسبندگی رنگ (Cross-Cut)', 'عدم وجود شره، قطرات سرد یا سوختگی پوشش', 'پوشش کامل قطعات داخلی و دریچه دسترسی'],
    measureUnit: 'ضخامت پوشش (میکرون - µm)'
  },
  FINAL_ASSEMBLY: {
    title: 'گیت ۴: مونتاژ نهایی و ترخیص',
    subtitle: 'هم‌پوشانی تلسکوپی (Overlap)، سلامت انکربولت‌ها، درپوش، پلاک مشخصات و صدور QC Passed',
    icon: PackageCheck,
    color: '#2d806b',
    defaultChecks: ['کنترل طول هم‌پوشانی قطعات تلسکوپی (Overlap)', 'انطباق ابعاد بیس‌پلیت و فاصله سوراخ‌های انکربولت', 'سلامت قفل و دریچه دسترسی و ترمینال کابل', 'نصب پلاک سازه و صدور برچسب سبز QC Passed'],
    measureUnit: 'طول اورلپ / انحراف (mm)'
  }
};

const DEFECT_TYPES = {
  DIMENSION: 'ابعادی و ضخامت ورق',
  WELDING: 'عیوب جوشکاری (ترک/نفوذ/سوراخ)',
  GALVANIZING_COATING: 'پوشش گالوانیزه و رنگ',
  DEFORMATION: 'اعوجاج و تابیدگی سازه/بیس‌پلیت',
  ASSEMBLY: 'مونتاژ و انطباق قطعات',
  OTHER: 'سایر موارد'
};

const SEVERITY_INFO = {
  CRITICAL: { label: 'بحرانی (توقف فوری)', color: '#c44d4d', bg: '#fdecec' },
  MEDIUM: { label: 'متوسط', color: '#d48806', bg: '#fffbe6' },
  MINOR: { label: 'جزئی', color: '#1d39c4', bg: '#f0f5ff' }
};

const DISPOSITION_INFO = {
  PENDING: { label: 'در انتظار تعیین تکلیف', color: '#8c8c8c', bg: '#f5f5f5' },
  REWORK: { label: 'اصلاح و دوباره‌کاری (Rework)', color: '#fa8c16', bg: '#fff7e6' },
  SCRAP: { label: 'اسقاط و ضایعات (Scrap)', color: '#f5222d', bg: '#fff1f0' },
  CONCESSION: { label: 'پذیرش مشروط با ارفاق (Concession)', color: '#52c41a', bg: '#f6ffed' }
};

const STATUS_INFO = {
  OPEN: { label: 'باز (قفل کیفی)', color: '#cf1322', bg: '#fff1f0' },
  IN_REWORK: { label: 'در حال اصلاح و تعمیر', color: '#d46b08', bg: '#fff7e6' },
  RESOLVED: { label: 'حل‌شده (تأیید مجدد)', color: '#389e0d', bg: '#f6ffed' },
  CLOSED: { label: 'بسته‌شده', color: '#595959', bg: '#f5f5f5' }
};

export default function QualityControl({ onNavigate, initialOrderId, initialProductId }) {
  const [activeTab, setActiveTab] = useState('gates'); // 'gates' | 'ncrs'
  const [summary, setSummary] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters for Gates
  const [gateFilter, setGateFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [gateQuery, setGateQuery] = useState('');

  // Filters for NCRs
  const [ncrStatusFilter, setNcrStatusFilter] = useState('');
  const [ncrSeverityFilter, setNcrSeverityFilter] = useState('');
  const [ncrQuery, setNcrQuery] = useState('');

  // Modals
  const [showNewInspection, setShowNewInspection] = useState(false);
  const [showNewNCR, setShowNewNCR] = useState(false);
  const [activeNCRForDisposition, setActiveNCRForDisposition] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, inspRes, ncrRes, ordersRes] = await Promise.all([
        api.get('/qc/summary'),
        api.get('/qc/inspections'),
        api.get('/qc/ncrs'),
        api.get('/orders')
      ]);
      setSummary(sumRes);
      setInspections(inspRes || []);
      setNcrs(ncrRes || []);
      setOrders(ordersRes || []);
    } catch (err) {
      console.error('Error loading QC data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Inspections
  const filteredInspections = useMemo(() => {
    return inspections.filter(insp => {
      if (gateFilter && insp.gate_type !== gateFilter) return false;
      if (resultFilter && insp.result !== resultFilter) return false;
      if (gateQuery) {
        const q = gateQuery.toLowerCase();
        const matchText = `${insp.order_no} ${insp.customer_name} ${insp.product_name} ${insp.inspector_name} ${insp.remarks || ''}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }
      return true;
    });
  }, [inspections, gateFilter, resultFilter, gateQuery]);

  // Filtered NCRs
  const filteredNcrs = useMemo(() => {
    return ncrs.filter(ncr => {
      if (ncrStatusFilter && ncr.status !== ncrStatusFilter) return false;
      if (ncrSeverityFilter && ncr.severity !== ncrSeverityFilter) return false;
      if (ncrQuery) {
        const q = ncrQuery.toLowerCase();
        const matchText = `${ncr.ncr_number} ${ncr.defect_title} ${ncr.order_no} ${ncr.customer_name} ${ncr.product_name} ${ncr.description}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }
      return true;
    });
  }, [ncrs, ncrStatusFilter, ncrSeverityFilter, ncrQuery]);

  // Extract flattened products for select options
  const productOptions = useMemo(() => {
    const opts = [];
    orders.forEach(od => {
      (od.items || []).forEach(it => {
        opts.push({
          order_id: od.id,
          order_no: od.order_no,
          customer_name: od.customer_name,
          project_code: od.project_code,
          item_id: it.id,
          product_name: it.product_name,
          quantity: it.quantity,
          label: `${od.order_no} · ${od.customer_name} — ${it.product_name} (${it.quantity} اصله)`
        });
      });
    });
    return opts;
  }, [orders]);

  const openNCRCount = summary?.open_ncrs || 0;
  const criticalNCRCount = summary?.critical_ncrs || 0;

  return (
    <div className="page-shell qc-page">
      {/* Top Header */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={26} color="#2d806b" />
            <h1 style={{ margin: 0 }}>کنترل کیفیت خط تولید و مدیریت عدم انطباق (QC & NCR)</h1>
          </div>
          <p style={{ margin: '4px 0 0', color: '#687e77', fontSize: '12px' }}>
            ۴ ایستگاه بازرسی استاندارد سازه پایه‌چراغ، آزمون‌های غیرمخرب، ضخامت‌سنجی پوشش و صدور مجوز ترخیص
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="secondary"
            onClick={() => setShowNewNCR(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: '#f3b2b2', color: '#b63838' }}
          >
            <AlertTriangle size={16} />
            <span>صدور برگه عدم انطباق (NCR)</span>
          </button>
          <button
            onClick={() => setShowNewInspection(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>ثبت بازرسی کیفی جدید</span>
          </button>
        </div>
      </header>

      {/* KPI Metrics Strip */}
      <div className="decision-metrics" style={{ gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', marginBottom: '20px' }}>
        <div>
          <span>کل بازرسی‌های ثبت‌شده</span>
          <b>{summary?.total_inspections || 0}</b>
          <small>در ایستگاه‌های ۴ گانه</small>
        </div>
        <div>
          <span>بازرسی‌های موفق (تأییدشده)</span>
          <b style={{ color: '#2d806b' }}>{summary?.passed_inspections || 0}</b>
          <small>
            {summary?.total_inspections
              ? `${Math.round((summary.passed_inspections / summary.total_inspections) * 100)}٪ نرخ قبولی`
              : '—'}
          </small>
        </div>
        <div style={openNCRCount > 0 ? { borderRightColor: '#c44d4d', background: '#fff7f7' } : {}}>
          <span>عدم انطباق‌های باز (قفل کیفی)</span>
          <b style={{ color: openNCRCount > 0 ? '#b63838' : '#2d806b' }}>{openNCRCount}</b>
          <small>{openNCRCount > 0 ? 'مانع ترخیص نهایی' : 'خط بدون انحراف باز'}</small>
        </div>
        <div>
          <span>در حال اصلاح و دوباره‌کاری</span>
          <b style={{ color: '#d47a32' }}>{summary?.in_rework_ncrs || 0}</b>
          <small>دستورالعمل Rework فعال</small>
        </div>
        <div>
          <span>عدم انطباق‌های بحرانی</span>
          <b style={{ color: criticalNCRCount > 0 ? '#b63838' : '#687e77' }}>{criticalNCRCount}</b>
          <small>نیازمند تصمیم فنی مدیر کارخانه</small>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e0e8e4', marginBottom: '20px' }}>
        <button
          className={`tab-button ${activeTab === 'gates' ? 'active' : ''}`}
          onClick={() => setActiveTab('gates')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'gates' ? '3px solid #2d806b' : '3px solid transparent',
            color: activeTab === 'gates' ? '#2d806b' : '#687e77',
            fontWeight: activeTab === 'gates' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <Layers size={18} />
          <span>گیت‌های بازرسی خط تولید (QC Gates)</span>
          <span style={{ fontSize: '11px', background: '#eef4f1', padding: '2px 8px', borderRadius: '12px' }}>
            {inspections.length}
          </span>
        </button>

        <button
          className={`tab-button ${activeTab === 'ncrs' ? 'active' : ''}`}
          onClick={() => setActiveTab('ncrs')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'ncrs' ? '3px solid #c44d4d' : '3px solid transparent',
            color: activeTab === 'ncrs' ? '#c44d4d' : '#687e77',
            fontWeight: activeTab === 'ncrs' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <AlertTriangle size={18} />
          <span>میز کار عدم انطباق‌ها (NCR Workbench)</span>
          {openNCRCount > 0 && (
            <span style={{ fontSize: '11px', background: '#fce8e8', color: '#c44d4d', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
              {openNCRCount} باز
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: QC GATES VIEW */}
      {activeTab === 'gates' && (
        <div>
          {/* Gate Overview Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {Object.entries(GATE_INFO).map(([key, info]) => {
              const GateIcon = info.icon;
              const gateStats = summary?.gates?.[key] || { PASSED: 0, FAILED: 0, total: 0 };
              return (
                <div
                  key={key}
                  onClick={() => setGateFilter(gateFilter === key ? '' : key)}
                  style={{
                    border: gateFilter === key ? `2px solid ${info.color}` : '1px solid #dbe5e1',
                    borderRadius: '10px',
                    padding: '16px',
                    background: gateFilter === key ? '#f8fbfb' : '#ffffff',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ background: `${info.color}18`, color: info.color, padding: '8px', borderRadius: '8px' }}>
                        <GateIcon size={20} />
                      </div>
                      <b style={{ fontSize: '13px', color: '#203630' }}>{info.title}</b>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: info.color }}>
                      {gateStats.total} بازرسی
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 10px', fontSize: '11px', color: '#738982', lineHeight: '1.5' }}>
                    {info.subtitle}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid #edf2f0' }}>
                    <span style={{ color: '#2d806b' }}>✔ {gateStats.PASSED || 0} قبولی</span>
                    <span style={{ color: '#c44d4d' }}>✖ {gateStats.FAILED || 0} مردودی</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filters Bar */}
          <div className="filter-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', background: '#fff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e0e8e4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
              <Search size={16} color="#8a9e97" />
              <input
                type="text"
                placeholder="جستجو بر اساس شماره سفارش، مشتری، محصول، بازرس..."
                value={gateQuery}
                onChange={e => setGateQuery(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d4ded9', fontSize: '12px' }}
              />
            </div>

            <select
              value={gateFilter}
              onChange={e => setGateFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d4ded9', fontSize: '12px' }}
            >
              <option value="">همه گیت‌های بازرسی</option>
              <option value="INCOMING_FORMING">گیت ۱: متریال و خم‌کاری</option>
              <option value="WELDING">گیت ۲: بازرسی جوش</option>
              <option value="COATING">گیت ۳: پوشش گالوانیزه/رنگ</option>
              <option value="FINAL_ASSEMBLY">گیت ۴: مونتاژ نهایی</option>
            </select>

            <select
              value={resultFilter}
              onChange={e => setResultFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d4ded9', fontSize: '12px' }}
            >
              <option value="">همه نتایج</option>
              <option value="PASSED">تأیید شده (PASSED)</option>
              <option value="FAILED">مردود شده (FAILED)</option>
              <option value="CONDITIONAL">مشروط (CONDITIONAL)</option>
            </select>

            {(gateFilter || resultFilter || gateQuery) && (
              <button
                className="secondary"
                onClick={() => { setGateFilter(''); setResultFilter(''); setGateQuery(''); }}
                style={{ fontSize: '11px', padding: '5px 10px' }}
              >
                پاکسازی فیلترها
              </button>
            )}
          </div>

          {/* Inspections Table */}
          <div className="table-wrapper" style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e8e4', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f6faf8', textAlign: 'right', borderBottom: '1px solid #d8e5e0' }}>
                  <th style={{ padding: '12px' }}>تاریخ بازرسی</th>
                  <th style={{ padding: '12px' }}>سفارش / مشتری</th>
                  <th style={{ padding: '12px' }}>محصول سازه</th>
                  <th style={{ padding: '12px' }}>گیت بازرسی</th>
                  <th style={{ padding: '12px' }}>بازرس کنترل کیفیت</th>
                  <th style={{ padding: '12px' }}>نتیجه آزمون</th>
                  <th style={{ padding: '12px' }}>پارامتر اندازه‌گیری‌شده</th>
                  <th style={{ padding: '12px' }}>توضیحات و اقدامات</th>
                </tr>
              </thead>
              <tbody>
                {filteredInspections.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#82948e' }}>
                      هیچ بازرسی کیفی با فیلترهای انتخابی یافت نشد.
                    </td>
                  </tr>
                ) : (
                  filteredInspections.map(insp => {
                    const gInfo = GATE_INFO[insp.gate_type] || { title: insp.gate_type, color: '#333' };
                    const isPassed = insp.result === 'PASSED';
                    const isFailed = insp.result === 'FAILED';
                    const measures = insp.parsed_measured_values || {};
                    const measureStr = Object.entries(measures)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' | ');

                    return (
                      <tr key={insp.id} style={{ borderBottom: '1px solid #edf2f0' }}>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <b>{toJalali(insp.inspection_date)}</b>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ color: '#2d806b', fontWeight: 'bold' }}>{insp.order_no}</span>
                          <div style={{ fontSize: '11px', color: '#687e77' }}>{insp.customer_name}</div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <b>{insp.product_name}</b>
                          {insp.height && (
                            <div style={{ fontSize: '10px', color: '#7e918b' }}>
                              ارتفاع: {insp.height}م · ورق: {insp.sheet_thickness}mm
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: `${gInfo.color}15`,
                            color: gInfo.color
                          }}>
                            {gInfo.title}
                          </span>
                        </td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          {insp.inspector_name}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: isPassed ? '#e6f7ef' : isFailed ? '#fdecec' : '#fffbe6',
                            color: isPassed ? '#2d806b' : isFailed ? '#b63838' : '#d48806'
                          }}>
                            {isPassed ? <CheckCircle2 size={13} /> : isFailed ? <XCircle size={13} /> : <AlertTriangle size={13} />}
                            {isPassed ? 'تأیید شد' : isFailed ? 'مردود (عدم انطباق)' : 'مشروط'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', direction: 'ltr', textAlign: 'right', fontSize: '11px', color: '#4d615b' }}>
                          {measureStr || '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '11px', color: '#5f756e', maxWidth: '240px' }}>
                          {insp.remarks || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: NCR WORKBENCH VIEW */}
      {activeTab === 'ncrs' && (
        <div>
          {/* Filters Bar for NCRs */}
          <div className="filter-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', background: '#fff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e0e8e4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
              <Search size={16} color="#8a9e97" />
              <input
                type="text"
                placeholder="جستجو بر اساس شماره NCR، عنوان نقص، سفارش، مشتری..."
                value={ncrQuery}
                onChange={e => setNcrQuery(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d4ded9', fontSize: '12px' }}
              />
            </div>

            <select
              value={ncrStatusFilter}
              onChange={e => setNcrStatusFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d4ded9', fontSize: '12px' }}
            >
              <option value="">همه وضعیت‌ها</option>
              <option value="OPEN">باز (قفل کیفی فعال)</option>
              <option value="IN_REWORK">در حال اصلاح (Rework)</option>
              <option value="RESOLVED">حل‌شده</option>
              <option value="CLOSED">بسته‌شده</option>
            </select>

            <select
              value={ncrSeverityFilter}
              onChange={e => setNcrSeverityFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d4ded9', fontSize: '12px' }}
            >
              <option value="">همه سطوح شدت</option>
              <option value="CRITICAL">بحرانی (توقف فوری خط)</option>
              <option value="MEDIUM">متوسط</option>
              <option value="MINOR">جزئی</option>
            </select>

            {(ncrStatusFilter || ncrSeverityFilter || ncrQuery) && (
              <button
                className="secondary"
                onClick={() => { setNcrStatusFilter(''); setNcrSeverityFilter(''); setNcrQuery(''); }}
                style={{ fontSize: '11px', padding: '5px 10px' }}
              >
                پاکسازی فیلترها
              </button>
            )}
          </div>

          {/* NCR Table */}
          <div className="table-wrapper" style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e8e4', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f6faf8', textAlign: 'right', borderBottom: '1px solid #d8e5e0' }}>
                  <th style={{ padding: '12px' }}>شماره NCR</th>
                  <th style={{ padding: '12px' }}>سفارش / مشتری</th>
                  <th style={{ padding: '12px' }}>محصول سازه</th>
                  <th style={{ padding: '12px' }}>نوع و عنوان نقص کیفی</th>
                  <th style={{ padding: '12px' }}>شدت عیب</th>
                  <th style={{ padding: '12px' }}>تصمیم مهندسی (Disposition)</th>
                  <th style={{ padding: '12px' }}>وضعیت</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredNcrs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#82948e' }}>
                      هیچ برگه عدم انطباقی با مشخصات جاری یافت نشد.
                    </td>
                  </tr>
                ) : (
                  filteredNcrs.map(ncr => {
                    const sev = SEVERITY_INFO[ncr.severity] || SEVERITY_INFO.MEDIUM;
                    const disp = DISPOSITION_INFO[ncr.disposition] || DISPOSITION_INFO.PENDING;
                    const st = STATUS_INFO[ncr.status] || STATUS_INFO.OPEN;
                    const isOpen = ncr.status === 'OPEN' || ncr.status === 'IN_REWORK';

                    return (
                      <tr key={ncr.id} style={{ borderBottom: '1px solid #edf2f0', background: isOpen && ncr.severity === 'CRITICAL' ? '#fff9f9' : undefined }}>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#a82c2c', background: '#fdecec', padding: '3px 8px', borderRadius: '4px' }}>
                            {ncr.ncr_number}
                          </span>
                          <div style={{ fontSize: '10px', color: '#82948e', marginTop: '4px' }}>
                            {toJalali(ncr.created_at)}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <b>{ncr.order_no}</b>
                          <div style={{ fontSize: '11px', color: '#687e77' }}>{ncr.customer_name}</div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <b>{ncr.product_name}</b>
                          {ncr.height && (
                            <div style={{ fontSize: '10px', color: '#7e918b' }}>
                              ارتفاع: {ncr.height}م · ورق: {ncr.sheet_thickness}mm
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', maxWidth: '280px' }}>
                          <div style={{ fontSize: '10px', color: '#66877d', fontWeight: 'bold' }}>
                            {DEFECT_TYPES[ncr.defect_type] || ncr.defect_type}
                          </div>
                          <b style={{ color: '#263b35', display: 'block', margin: '2px 0' }}>{ncr.defect_title}</b>
                          <p style={{ margin: 0, fontSize: '11px', color: '#6e807b', lineHeight: '1.4' }}>
                            {ncr.description}
                          </p>
                          {ncr.root_cause && (
                            <div style={{ fontSize: '10px', color: '#916b23', marginTop: '4px' }}>
                              <b>علت ریشه‌ای:</b> {ncr.root_cause}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: sev.bg,
                            color: sev.color
                          }}>
                            {sev.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: disp.bg,
                            color: disp.color
                          }}>
                            {disp.label}
                          </span>
                          {ncr.disposition_notes && (
                            <div style={{ fontSize: '10px', color: '#61756f', marginTop: '4px', maxWidth: '200px' }}>
                              {ncr.disposition_notes}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: st.bg,
                            color: st.color
                          }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            className="secondary"
                            onClick={() => setActiveNCRForDisposition(ncr)}
                            style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Wrench size={13} />
                            <span>تعیین تکلیف / رفع عیب</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NEW QC INSPECTION */}
      {showNewInspection && (
        <NewInspectionModal
          productOptions={productOptions}
          onClose={() => setShowNewInspection(false)}
          onSuccess={() => { setShowNewInspection(false); loadData(); }}
        />
      )}

      {/* MODAL: NEW NCR */}
      {showNewNCR && (
        <NewNCRModal
          productOptions={productOptions}
          onClose={() => setShowNewNCR(false)}
          onSuccess={() => { setShowNewNCR(false); loadData(); }}
        />
      )}

      {/* MODAL: NCR DISPOSITION */}
      {activeNCRForDisposition && (
        <NCRDispositionModal
          ncr={activeNCRForDisposition}
          onClose={() => setActiveNCRForDisposition(null)}
          onSuccess={() => { setActiveNCRForDisposition(null); loadData(); }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// SUB-MODAL 1: NEW INSPECTION
// -------------------------------------------------------------
function NewInspectionModal({ productOptions, onClose, onSuccess }) {
  const [orderItemId, setOrderItemId] = useState(productOptions[0]?.item_id || '');
  const [gateType, setGateType] = useState('INCOMING_FORMING');
  const [inspectorName, setInspectorName] = useState('مهندس کاظمی (کنترل کیفیت)');
  const [inspectionDate, setInspectionDate] = useState(todayISO());
  const [result, setResult] = useState('PASSED');
  const [measureValue, setMeasureValue] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const gateConf = GATE_INFO[gateType];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderItemId) return alert('لطفاً محصول مورد نظر را انتخاب کنید.');
    setSaving(true);
    try {
      const measured_values = {};
      if (measureValue) {
        measured_values[gateConf.measureUnit] = Number(measureValue) || measureValue;
      }

      await api.post('/qc/inspections', {
        order_item_id: Number(orderItemId),
        gate_type: gateType,
        inspector_name: inspectorName,
        inspection_date: inspectionDate,
        result,
        measured_values,
        check_items: { checked_by_inspector: true },
        remarks: remarks.trim() || undefined
      });

      alert('بازرسی کیفی با موفقیت ثبت شد.');
      onSuccess();
    } catch (err) {
      alert('خطا در ثبت بازرسی: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="ثبت بازرسی کیفی خط تولید (QC Gate)" onClose={onClose} variant="dialog">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            انتخاب محصول و سفارش
          </label>
          <select
            value={orderItemId}
            onChange={e => setOrderItemId(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          >
            {productOptions.map(opt => (
              <option key={opt.item_id} value={opt.item_id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            ایستگاه / گیت بازرسی
          </label>
          <select
            value={gateType}
            onChange={e => setGateType(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          >
            <option value="INCOMING_FORMING">گیت ۱: متریال، ابعاد ورق و خم‌کاری</option>
            <option value="WELDING">گیت ۲: بازرسی چشمی و جوشکاری بیس‌پلیت/طولی</option>
            <option value="COATING">گیت ۳: پوشش گالوانیزه گرم / رنگ الکترواستاتیک</option>
            <option value="FINAL_ASSEMBLY">گیت ۴: مونتاژ نهایی، اورلپ و ترخیص</option>
          </select>
          <small style={{ color: '#627c73', display: 'block', marginTop: '3px', fontSize: '10px' }}>
            {gateConf.subtitle}
          </small>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              نام بازرس کنترل کیفیت
            </label>
            <input
              type="text"
              value={inspectorName}
              onChange={e => setInspectorName(e.target.value)}
              required
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              تاریخ بازرسی
            </label>
            <JalaliDateInput value={inspectionDate} onChange={setInspectionDate} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              نتیجه بازرسی
            </label>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            >
              <option value="PASSED">تأیید شد (PASSED)</option>
              <option value="FAILED">مردود / عدم انطباق (FAILED)</option>
              <option value="CONDITIONAL">مشروط (CONDITIONAL)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              مقدار اندازه‌گیری‌شده: {gateConf.measureUnit}
            </label>
            <input
              type="number"
              step="any"
              placeholder="مثال: ۴ یا ۸۵"
              value={measureValue}
              onChange={e => setMeasureValue(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            چک‌لیست بازرسی این ایستگاه
          </label>
          <div style={{ background: '#f8faf9', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', color: '#3d524c' }}>
            {gateConf.defaultChecks.map((chk, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                <CheckCircle2 size={13} color="#2d806b" />
                <span>{chk}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            توضیحات و مشاهدات بازرس
          </label>
          <textarea
            rows={2}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="هرگونه یادداشت فنی، شرایط سطح، نوع الکترود، دستگاه و..."
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button type="button" className="secondary" onClick={onClose}>
            انصراف
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'در حال ثبت...' : 'ثبت بازرسی'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// -------------------------------------------------------------
// SUB-MODAL 2: NEW NCR REPORT
// -------------------------------------------------------------
function NewNCRModal({ productOptions, onClose, onSuccess }) {
  const [orderItemId, setOrderItemId] = useState(productOptions[0]?.item_id || '');
  const [defectTitle, setDefectTitle] = useState('');
  const [defectType, setDefectType] = useState('WELDING');
  const [severity, setSeverity] = useState('CRITICAL');
  const [description, setDescription] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [disposition, setDisposition] = useState('REWORK');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderItemId) return alert('لطفاً محصول را انتخاب کنید.');
    if (!defectTitle.trim()) return alert('عنوان نقص کیفی الزامی است.');
    if (!description.trim()) return alert('شرح کامل عیب الزامی است.');

    setSaving(true);
    try {
      await api.post('/qc/ncrs', {
        order_item_id: Number(orderItemId),
        defect_title: defectTitle.trim(),
        defect_type: defectType,
        severity,
        description: description.trim(),
        root_cause: rootCause.trim() || undefined,
        disposition,
        status: 'OPEN'
      });

      alert('برگه عدم انطباق (NCR) با موفقیت صادر و قفل کیفی روی قطعه اعمال شد.');
      onSuccess();
    } catch (err) {
      alert('خطا در صدور NCR: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="صدور برگه عدم انطباق کیفی (NCR Report)" onClose={onClose} variant="dialog">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            محصول سازه دارای عدم انطباق
          </label>
          <select
            value={orderItemId}
            onChange={e => setOrderItemId(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          >
            {productOptions.map(opt => (
              <option key={opt.item_id} value={opt.item_id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              عنوان نقص / عدم انطباق
            </label>
            <input
              type="text"
              placeholder="مثال: اعوجاج در صفحه بیس‌پلیت / ترک جوش طولی"
              value={defectTitle}
              onChange={e => setDefectTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              نوع عیب
            </label>
            <select
              value={defectType}
              onChange={e => setDefectType(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            >
              {Object.entries(DEFECT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              سطح شدت عیب
            </label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            >
              <option value="CRITICAL">بحرانی (توقف فوری قطعه و قفل ترخیص)</option>
              <option value="MEDIUM">متوسط (نیاز به اصلاح در خط)</option>
              <option value="MINOR">جزئی (نقص ظاهری / غیربحرانی)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              تصمیم مهندسی اولیه (Disposition)
            </label>
            <select
              value={disposition}
              onChange={e => setDisposition(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            >
              <option value="REWORK">دوباره‌کاری و اصلاح (Rework)</option>
              <option value="SCRAP">اسقاط و قطعه ضایعاتی (Scrap)</option>
              <option value="CONCESSION">پذیرش مشروط با ارفاق (Concession)</option>
              <option value="PENDING">در انتظار بررسی فنی مهندسی</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            شرح دقیق عدم انطباق
          </label>
          <textarea
            rows={3}
            placeholder="موقعیت دقیق عیب، ابعاد انحراف نسبت به نقشه، علائم ظاهری و اثر آن بر مونتاژ سازه..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            تحلیل علت ریشه‌ای (Root Cause Analysis - اختیاری)
          </label>
          <input
            type="text"
            placeholder="مثال: حرارت بالای جوشکاری، کندی تیغه برش، خطای کالیبراسیون سنبه پرس برک..."
            value={rootCause}
            onChange={e => setRootCause(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button type="button" className="secondary" onClick={onClose}>
            انصراف
          </button>
          <button type="submit" disabled={saving} style={{ background: '#c44d4d', color: '#fff' }}>
            {saving ? 'در حال صدور...' : 'صدور برگه عدم انطباق (NCR)'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// -------------------------------------------------------------
// SUB-MODAL 3: NCR DISPOSITION & RESOLUTION
// -------------------------------------------------------------
function NCRDispositionModal({ ncr, onClose, onSuccess }) {
  const [disposition, setDisposition] = useState(ncr.disposition || 'REWORK');
  const [dispositionNotes, setDispositionNotes] = useState(ncr.disposition_notes || '');
  const [dispositionBy, setDispositionBy] = useState(ncr.disposition_by || 'مهندس کاظمی (مدیر کیفیت)');
  const [status, setStatus] = useState(ncr.status || 'OPEN');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/qc/ncrs/${ncr.id}`, {
        disposition,
        disposition_notes: dispositionNotes.trim() || undefined,
        disposition_by: dispositionBy.trim() || undefined,
        status
      });

      alert('تعیین تکلیف فنی و وضعیت عدم انطباق با موفقیت به‌روزرسانی شد.');
      onSuccess();
    } catch (err) {
      alert('خطا در به‌روزرسانی: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`تعیین تکلیف مهندسی: ${ncr.ncr_number}`} onClose={onClose} variant="dialog">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* NCR Info Summary */}
        <div style={{ background: '#fdf7f7', border: '1px solid #f8d5d5', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <b>{ncr.defect_title}</b>
            <span style={{ fontSize: '11px', color: '#a82c2c', fontWeight: 'bold' }}>{ncr.ncr_number}</span>
          </div>
          <div style={{ fontSize: '11px', color: '#687e77' }}>
            سفارش: {ncr.order_no} · {ncr.customer_name} — محصول: {ncr.product_name}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#4a5955', lineHeight: '1.5' }}>
            <b>شرح عیب:</b> {ncr.description}
          </p>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            تصمیم مهندسی (Disposition)
          </label>
          <select
            value={disposition}
            onChange={e => setDisposition(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          >
            <option value="REWORK">اصلاح و دوباره‌کاری در خط (Rework) — بازرسی مجدد</option>
            <option value="CONCESSION">پذیرش مشروط با ارفاق فنی (Concession)</option>
            <option value="SCRAP">اسقاط و خروج از چرخه (Scrap)</option>
            <option value="PENDING">در انتظار بررسی تکمیلی</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
            دستورالعمل فنی اصلاحی یا شروط پذیرش
          </label>
          <textarea
            rows={3}
            value={dispositionNotes}
            onChange={e => setDispositionNotes(e.target.value)}
            placeholder="مثال: سنگ‌زنی محل جوش، پرس‌کاری سرد بیس‌پلیت، اعمال مجدد پوشش روی با ضخامت حداقل ۱۰۰ میکرون..."
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              نام مسئول تصمیم‌گیرنده
            </label>
            <input
              type="text"
              value={dispositionBy}
              onChange={e => setDispositionBy(e.target.value)}
              required
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              وضعیت فرآیند عدم انطباق
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px' }}
            >
              <option value="OPEN">باز (قفل کیفی فعال)</option>
              <option value="IN_REWORK">در حال اصلاح و دوباره‌کاری</option>
              <option value="RESOLVED">حل‌شده (رفع مانع و بازرسی مجدد تایید شد)</option>
              <option value="CLOSED">بسته‌شده قطعی</option>
            </select>
          </div>
        </div>

        <small style={{ color: '#668077', fontSize: '10px' }}>
          * توجه: با تغییر وضعیت به «حل‌شده» یا «بسته‌شده»، در صورت عدم وجود برگه عدم انطباق باز دیگر روی این قطعه، مرحله QC به طور خودکار از حالت مسدود خارج خواهد شد.
        </small>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button type="button" className="secondary" onClick={onClose}>
            انصراف
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'در حال ثبت...' : 'ثبت تصمیم مهندسی'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
