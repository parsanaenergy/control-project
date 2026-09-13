import { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from './Modal';
import {
  Package, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  Truck, Clock, Layers, ShieldAlert, DollarSign
} from 'lucide-react';

const CATEGORY_INFO = {
  BODY_SHEET: { label: 'ورق فولادی بدنه', color: '#3d7ea6', bg: '#eef6fc' },
  BASE_PLATE: { label: 'بیس‌پلیت و صفحه ستون', color: '#2d806b', bg: '#eef8f5' },
  GUSSET: { label: 'لچکی‌های تقویتی', color: '#8855b3', bg: '#f6f0fb' },
  BRACKET_PIPE: { label: 'سازه دستک و براکت', color: '#d47a32', bg: '#fdf4ec' },
  ANCHOR_BOLTS: { label: 'انکربولت و اتصالات', color: '#c44d4d', bg: '#fdecec' },
  COATING: { label: 'پوشش گالوانیزه / رنگ', color: '#556b2f', bg: '#f4f7ee' },
  ELECTRICAL: { label: 'قطعات الکتریکی و کابل', color: '#d4a017', bg: '#fefbec' },
  OTHER: { label: 'سایر ملزومات', color: '#5c6f68', bg: '#edf2f0' }
};

const STATUS_OPTIONS = [
  { key: 'IN_STOCK', label: 'موجود در انبار', color: '#2d806b', bg: '#e6f7ef' },
  { key: 'PURCHASE_REQUIRED', label: 'نیازمند خرید (کسری)', color: '#c44d4d', bg: '#fdecec' },
  { key: 'ORDERED', label: 'سفارش‌گذاری‌شده', color: '#d48806', bg: '#fffbe6' },
  { key: 'RECEIVED', label: 'رسید انبار / تحویل شد', color: '#1d39c4', bg: '#f0f5ff' }
];

const money = n => Number(n || 0).toLocaleString('fa-IR');

export default function BOMEditorModal({ orderItemId, productName, orderNo, onClose, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Form for new item
  const [newItem, setNewItem] = useState({
    material_category: 'BODY_SHEET',
    material_name: '',
    spec: '',
    quantity_per_pole: '',
    unit: 'KG',
    estimated_unit_cost: '',
    procurement_status: 'IN_STOCK',
    supplier_name: '',
    notes: ''
  });

  const loadBOM = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/items/${orderItemId}/bom`);
      setData(res);
    } catch (err) {
      alert('خطا در دریافت BOM: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBOM();
  }, [orderItemId]);

  const handleStatusChange = async (bomId, newStatus) => {
    try {
      await api.patch(`/bom/${bomId}`, { procurement_status: newStatus });
      loadBOM();
      onUpdated?.();
    } catch (err) {
      alert('خطا در تغییر وضعیت: ' + err.message);
    }
  };

  const handleDelete = async (bomId) => {
    if (!confirm('آیا از حذف این قلم متریال مطمئن هستید؟')) return;
    try {
      await api.delete(`/bom/${bomId}`);
      loadBOM();
      onUpdated?.();
    } catch (err) {
      alert('خطا در حذف: ' + err.message);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('تولید مجدد BOM تمام اقلام فعلی این قطعه را با مقادیر استاندارد محاسبه‌شده جایگزین می‌کند. ادامه می‌دهید؟')) return;
    setRegenerating(true);
    try {
      const res = await api.post(`/items/${orderItemId}/bom/generate`, {});
      setData(res);
      onUpdated?.();
      alert('ساختار BOM با موفقیت بازتولید و محاسبه شد.');
    } catch (err) {
      alert('خطا در بازتولید: ' + err.message);
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.material_name.trim()) return alert('نام متریال الزامی است.');
    if (!newItem.quantity_per_pole || Number(newItem.quantity_per_pole) <= 0) {
      return alert('مقدار برای هر اصله باید بزرگتر از صفر باشد.');
    }

    try {
      await api.post(`/items/${orderItemId}/bom`, {
        material_category: newItem.material_category,
        material_name: newItem.material_name.trim(),
        spec: newItem.spec.trim() || undefined,
        quantity_per_pole: Number(newItem.quantity_per_pole),
        unit: newItem.unit,
        estimated_unit_cost: Number(newItem.estimated_unit_cost) || 0,
        procurement_status: newItem.procurement_status,
        supplier_name: newItem.supplier_name.trim() || undefined,
        notes: newItem.notes.trim() || undefined
      });
      setAdding(false);
      setNewItem({
        material_category: 'BODY_SHEET',
        material_name: '',
        spec: '',
        quantity_per_pole: '',
        unit: 'KG',
        estimated_unit_cost: '',
        procurement_status: 'IN_STOCK',
        supplier_name: '',
        notes: ''
      });
      loadBOM();
      onUpdated?.();
    } catch (err) {
      alert('خطا در افزودن قلم: ' + err.message);
    }
  };

  const summary = data?.summary || {};
  const items = data?.items || [];
  const spec = data?.pole_spec || {};

  return (
    <Modal title={`ساختار شکست مواد و قطعات (BOM): ${productName}`} onClose={onClose} variant="dialog" className="bom-modal" style={{ maxWidth: '960px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Header Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#66827a' }}>{orderNo ? `سفارش ${orderNo} · ` : ''}تعداد {data?.item_quantity || 1} اصله</span>
            <h3 style={{ margin: '2px 0 0', color: '#1e342f' }}>{productName}</h3>
            {spec.height && (
              <span style={{ fontSize: '11px', color: '#7c8e88' }}>
                ارتفاع: {spec.height}م · ورق: {spec.sheet_thickness}mm · مقطع {spec.sides_count || 8} وجهی · بیس‌پلیت: {spec.base_plate_dim || '۴۰۰×۴۰۰'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="secondary"
              onClick={handleRegenerate}
              disabled={regenerating}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <RefreshCw size={13} className={regenerating ? 'spin' : ''} />
              <span>محاسبه مجدد از روی نقشه</span>
            </button>
            <button
              onClick={() => setAdding(!adding)}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={13} />
              <span>{adding ? 'بستن فرم' : '+ قلم جدید'}</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))', gap: '10px' }}>
          <div style={{ background: '#f8faf9', border: '1px solid #dce6e2', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: '#687e77', display: 'block' }}>وزن فولاد هر اصله</span>
            <b style={{ fontSize: '16px', color: '#2d806b' }}>{money(summary.steel_weight_per_pole_kg)} <small style={{ fontSize: '10px' }}>kg</small></b>
            <div style={{ fontSize: '10px', color: '#889e97', marginTop: '2px' }}>بدنه، بیس‌پلیت، لچکی، دستک</div>
          </div>

          <div style={{ background: '#f8faf9', border: '1px solid #dce6e2', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: '#687e77', display: 'block' }}>وزن کل فولاد سفارش</span>
            <b style={{ fontSize: '16px', color: '#2d806b' }}>
              {money(summary.total_steel_weight_order_kg)} <small style={{ fontSize: '10px' }}>kg</small>
            </b>
            <div style={{ fontSize: '10px', color: '#889e97', marginTop: '2px' }}>
              {summary.total_steel_weight_order_kg ? `معادل ${(summary.total_steel_weight_order_kg / 1000).toFixed(2)} تن` : '—'}
            </div>
          </div>

          <div style={{
            background: summary.has_shortage ? '#fff5f5' : '#f8faf9',
            border: summary.has_shortage ? '1px solid #f7c1c1' : '1px solid #dce6e2',
            borderRadius: '8px',
            padding: '12px'
          }}>
            <span style={{ fontSize: '10px', color: summary.has_shortage ? '#a83232' : '#687e77', display: 'block' }}>وضعیت تأمین متریال</span>
            <b style={{ fontSize: '14px', color: summary.has_shortage ? '#b63838' : '#2d806b' }}>
              {summary.has_shortage ? `کسری: ${summary.status_counts?.PURCHASE_REQUIRED} قلم` : 'کامل در انبار'}
            </b>
            <div style={{ fontSize: '10px', color: '#889e97', marginTop: '2px' }}>
              {summary.status_counts?.IN_STOCK || 0} قلم موجود
            </div>
          </div>

          <div style={{ background: '#f8faf9', border: '1px solid #dce6e2', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: '#687e77', display: 'block' }}>برآورد هزینه متریال</span>
            <b style={{ fontSize: '15px', color: '#203630' }}>{money(summary.total_estimated_cost)} <small style={{ fontSize: '10px' }}>ریال</small></b>
            <div style={{ fontSize: '10px', color: '#889e97', marginTop: '2px' }}>
              {summary.items_count || 0} ردیف متریال
            </div>
          </div>
        </div>

        {/* Add Item Form (Collapsible) */}
        {adding && (
          <form onSubmit={handleAddItem} style={{ background: '#f4f8f6', border: '1px solid #c9ded6', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <b style={{ fontSize: '12px', color: '#26443c' }}>افزودن قلم جدید به ساختار شکست مواد</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>رده متریال</label>
                <select
                  value={newItem.material_category}
                  onChange={e => setNewItem({ ...newItem, material_category: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                >
                  {Object.entries(CATEGORY_INFO).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>نام متریال / کالا</label>
                <input
                  type="text"
                  placeholder="مثال: لوله سایز ۶۰ دستک"
                  value={newItem.material_name}
                  onChange={e => setNewItem({ ...newItem, material_name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>مقدار هر پایه</label>
                <input
                  type="number"
                  step="any"
                  placeholder="مثال: ۱۲.۵"
                  value={newItem.quantity_per_pole}
                  onChange={e => setNewItem({ ...newItem, quantity_per_pole: e.target.value })}
                  required
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>واحد سنجش</label>
                <select
                  value={newItem.unit}
                  onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                >
                  <option value="KG">کیلوگرم (KG)</option>
                  <option value="PIECE">عدد (PIECE)</option>
                  <option value="SET">ست / دست (SET)</option>
                  <option value="METER">متر (METER)</option>
                  <option value="SHEET">ورق / شیت (SHEET)</option>
                  <option value="LTR">لیتر (LTR)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>مشخصات فنی قلم</label>
                <input
                  type="text"
                  placeholder="مثال: ضخامت ۳ میل، گرید ST37 نورد اصفهان"
                  value={newItem.spec}
                  onChange={e => setNewItem({ ...newItem, spec: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>هزینه واحد تخمینی (ریال)</label>
                <input
                  type="number"
                  placeholder="مثال: ۴۵۰۰۰"
                  value={newItem.estimated_unit_cost}
                  onChange={e => setNewItem({ ...newItem, estimated_unit_cost: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>وضعیت تأمین اولیه</label>
                <select
                  value={newItem.procurement_status}
                  onChange={e => setNewItem({ ...newItem, procurement_status: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px' }}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button type="button" className="secondary" onClick={() => setAdding(false)} style={{ fontSize: '11px' }}>انصراف</button>
              <button type="submit" style={{ fontSize: '11px' }}>ثبت قلم در BOM</button>
            </div>
          </form>
        )}

        {/* BOM Items Table */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #dce5e1', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f6faf8', textAlign: 'right', borderBottom: '1px solid #dbe6e1' }}>
                <th style={{ padding: '10px' }}>رده متریال</th>
                <th style={{ padding: '10px' }}>نام قلم و مشخصات فنی</th>
                <th style={{ padding: '10px' }}>مقدار / اصله</th>
                <th style={{ padding: '10px' }}>مقدار کل سفارش</th>
                <th style={{ padding: '10px' }}>واحد</th>
                <th style={{ padding: '10px' }}>بهای تخمینی</th>
                <th style={{ padding: '10px' }}>وضعیت تأمین</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#82948e' }}>
                    هیچ قلم موادی برای این سازه ثبت نشده است. از دکمه «محاسبه مجدد» استفاده کنید.
                  </td>
                </tr>
              ) : (
                items.map(row => {
                  const cat = CATEGORY_INFO[row.material_category] || CATEGORY_INFO.OTHER;
                  const st = STATUS_OPTIONS.find(s => s.key === row.procurement_status) || STATUS_OPTIONS[0];

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #edf2f0' }}>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          background: cat.bg,
                          color: cat.color
                        }}>
                          {cat.label}
                        </span>
                      </td>

                      <td style={{ padding: '10px' }}>
                        <b style={{ color: '#203630', display: 'block' }}>{row.material_name}</b>
                        {row.spec && <span style={{ color: '#687e77', fontSize: '10px' }}>{row.spec}</span>}
                        {row.notes && <div style={{ color: '#8ea099', fontSize: '9px' }}>{row.notes}</div>}
                      </td>

                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <b>{money(row.quantity_per_pole)}</b>
                      </td>

                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <b style={{ color: '#2d806b' }}>{money(row.total_quantity)}</b>
                      </td>

                      <td style={{ padding: '10px', whiteSpace: 'nowrap', color: '#668077' }}>
                        {row.unit}
                      </td>

                      <td style={{ padding: '10px', whiteSpace: 'nowrap', color: '#4a5e57' }}>
                        {money(row.total_quantity * row.estimated_unit_cost)}
                      </td>

                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <select
                          value={row.procurement_status}
                          onChange={e => handleStatusChange(row.id, e.target.value)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            border: `1px solid ${st.color}50`,
                            background: st.bg,
                            color: st.color,
                            cursor: 'pointer'
                          }}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </select>
                      </td>

                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          className="secondary"
                          onClick={() => handleDelete(row.id)}
                          style={{ padding: '3px 6px', color: '#c44d4d', borderColor: '#f7c5c5', background: 'none' }}
                          title="حذف قلم"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button className="secondary" onClick={onClose}>بستن</button>
        </div>
      </div>
    </Modal>
  );
}
