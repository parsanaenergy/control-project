import {useEffect, useState} from 'react';
import {api} from '../api';
import StatusPill from '../components/StatusPill';
import JalaliDateInput from '../components/JalaliDateInput';
import Modal from '../components/Modal';
import {toJalali} from '../jalali';
import {calcWeightedProgress} from '../progress';

const STAGE_STATUS_OPTIONS = [
  {value: 'TODO', label: 'شروع‌نشده / در صف'},
  {value: 'IN_PROGRESS', label: 'در حال انجام'},
  {value: 'DONE', label: 'تکمیل‌شده'},
  {value: 'BLOCKED', label: 'متوقف شده (دارای مانع)'},
];

export default function ProjectControl({initialOrderId, initialProductId, onBack}){
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [productId, setProductId] = useState('');
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/orders').then(setOrders).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (initialOrderId) setOrderId(String(initialOrderId));
    if (initialProductId) setProductId(String(initialProductId));
  }, [initialOrderId, initialProductId]);

  const load = async id => {
    const value = await api.get(`/orders/${id}`);
    setDetail(value);
    setProductId(previous =>
      value.items?.some(item => String(item.id) === String(previous))
        ? previous
        : String(value.items?.[0]?.id || '')
    );
    return value;
  };

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setProductId('');
      return;
    }
    setError('');
    load(orderId).catch(e => setError(e.message));
  }, [orderId]);

  const item = detail?.items?.find(product => String(product.id) === String(productId));
  const progress = calcWeightedProgress(item?.stages);
  const completed = item?.stages?.filter(stage => Number(stage.progress) >= 100).length || 0;
  const blockedStage = item?.stages?.find(stage => stage.status === 'BLOCKED');

  const updateStage = async (stage, patch) => {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/stages/${stage.id}`, {
        progress: patch.progress !== undefined ? Number(patch.progress) : Number(stage.progress),
        due_date: patch.due_date !== undefined ? patch.due_date : stage.due_date,
        note: patch.note !== undefined ? patch.note : stage.note,
        status: patch.status !== undefined ? patch.status : stage.status,
        block_reason: patch.block_reason !== undefined ? patch.block_reason : stage.block_reason,
        updated_by: 'کاربر'
      });
      const fresh = await load(orderId);
      const updated = fresh.items?.flatMap(product => product.stages || []).find(value => String(value.id) === String(stage.id));
      if (updated) setSelectedStage(updated);
    } catch (e) {
      setError(e.message || 'ذخیره تغییرات انجام نشد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page project-control-page operational-page">
      <header className="page-head project-head">
        <div>
          <div className="eyebrow">مرکز کنترل عملیات مهندسی و ساخت</div>
          <h1>کنترل پروژه پایه‌چراغ</h1>
          <p>محاسبه پیشرفت وزنی بر اساس وزن استاندارد مراحل سازه و مدیریت مستقیم موانع تولید.</p>
        </div>
        <div className="project-head-actions">
          {onBack && (
            <button className="secondary report-back-btn" onClick={onBack}>
              بازگشت به گزارش
            </button>
          )}
          <div className="project-selectors">
            <label>
              <span>پروژه / سفارش</span>
              <select aria-label="انتخاب پروژه" value={orderId} onChange={e => setOrderId(e.target.value)}>
                <option value="">انتخاب سفارش</option>
                {orders.map(order => (
                  <option key={order.id} value={order.id}>
                    {order.customer_name} — {order.order_no}
                  </option>
                ))}
              </select>
            </label>
            <label className={!orderId ? 'is-disabled' : ''}>
              <span>محصول</span>
              <select aria-label="انتخاب محصول" disabled={!orderId} value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">انتخاب محصول</option>
                {detail?.items?.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.product_name} — تعداد {product.quantity}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      {error && <div className="error project-error">{error}</div>}

      {!detail ? (
        <section className="empty-project">
          <div className="empty-project-icon">⌁</div>
          <h2>یک سفارش را برای شروع انتخاب کنید</h2>
          <p>ابتدا پروژه و سپس محصول مدنظر را انتخاب کنید تا مراحل WBS و وزن‌ها بارگذاری شوند.</p>
        </section>
      ) : item ? (
        <>
          {blockedStage && (
            <div className="stage-blocker-banner">
              <span style={{fontSize: '18px'}}>⚠️</span>
              <div>
                <b>گلوگاه اجرایی: مرحله «{blockedStage.stage_name_fa}» متوقف است!</b>
                <div style={{marginTop: '3px'}}>{blockedStage.block_reason || 'علت توقف مشخص نشده است.'}</div>
              </div>
            </div>
          )}

          <section className="project-command">
            <div>
              <span>{detail.customer_name} · {detail.order_no}</span>
              <h2>{item.product_name}</h2>
              <small>
                {item.item_code || 'بدون کد'} · تعداد {item.quantity} · ارسال‌شده {item.shipped_quantity || 0} · مانده {item.remaining_quantity ?? item.quantity}
              </small>
            </div>
            <div className="project-progress-summary">
              <b>{progress}٪</b>
              <span>پیشرفت فیزیکی وزنی</span>
              <i>
                <em style={{width: `${progress}%`}} />
              </i>
              <small>{completed} از {item.stages?.length || 0} مرحله کامل</small>
            </div>
          </section>

          <section className="stage-control-surface">
            <div className="section-title">
              <div>
                <div className="eyebrow">ساختار شکست کار مهندسی (WBS)</div>
                <h2>مراحل ساخت و اوزان فیزیکی</h2>
              </div>
              <span>{saving ? 'در حال ذخیره…' : 'برای ویرایش درصد، وضعیت یا ثبت مانع روی مرحله کلیک کنید.'}</span>
            </div>

            {/* زنجیره توالی فرآیند ساخت (Finish-to-Start Process Chain) */}
            <div className="wbs-chain-flow" style={{marginBottom:'1.2rem',padding:'0.8rem 1rem',background:'var(--bg-card, #fff)',border:'1px solid var(--border-color, #e2e8f0)',borderRadius:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}>
                <span style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-muted)'}}>توالی وابستگی‌های ساخت (Finish-to-Start Process Chain)</span>
                <small style={{color:'var(--text-muted)'}}>پیش‌نیاز هر مرحله باید قبل از شروع تکمیل گردد</small>
              </div>
              <div className="wbs-chain-steps" style={{display:'flex',gap:'0.5rem',alignItems:'center',flexWrap:'wrap'}}>
                {item.stages?.map((st, idx) => {
                  const isDone = Number(st.progress) >= 100;
                  const isBlocked = st.status === 'BLOCKED';
                  const isInProg = Number(st.progress) > 0 && !isDone;
                  return (
                    <div key={st.id} style={{display:'inline-flex',alignItems:'center',gap:'0.4rem'}}>
                      <span className={`pill ${isDone ? 'priority-low' : isBlocked ? 'priority-critical' : isInProg ? 'priority-high' : ''}`} style={{padding:'0.3rem 0.6rem',fontSize:'0.8rem'}}>
                        <b>{idx + 1}. {st.stage_name_fa}</b> ({st.progress}٪)
                      </span>
                      {idx < (item.stages.length - 1) && <span style={{color:'var(--text-muted)',fontSize:'0.9rem'}}>➔</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="stage-control-list">
              {item.stages?.map((stage, index) => {
                const isBlocked = stage.status === 'BLOCKED';
                const isDone = Number(stage.progress) >= 100;
                const weightPct = Math.round((stage.weight ?? 0.14) * 100);

                return (
                  <button
                    type="button"
                    className={`stage-control-row ${isBlocked ? 'blocked' : isDone ? 'done' : ''}`}
                    key={stage.id}
                    onClick={() => setSelectedStage(stage)}
                  >
                    <span className="stage-control-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="stage-control-name">
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <b>{stage.stage_name_fa}</b>
                        <span className="stage-weight-tag">وزن {weightPct}٪</span>
                      </div>
                      <small>
                        {stage.due_date ? `موعد ${toJalali(stage.due_date)}` : 'بدون سررسید'}
                        {stage.note ? ` · ${stage.note}` : ''}
                      </small>
                      {isBlocked && (
                        <small className="blocker-badge">
                          مانع: {stage.block_reason || 'متوقف بدون دلیل'}
                        </small>
                      )}
                      {stage.dependency_warning && !isDone && (
                        <small className="dependency-warning-badge" style={{color:'#b45309',background:'#fef3c7',padding:'2px 8px',borderRadius:'6px',marginTop:'4px',display:'inline-block'}}>
                          ⚠️ {stage.dependency_warning}
                        </small>
                      )}
                    </span>
                    <span className="stage-control-progress">
                      <b>{stage.progress}٪</b>
                      <i>
                        <em style={{width: `${stage.progress}%`}} />
                      </i>
                    </span>
                    <StatusPill progress={stage.progress} label={stage.stage_name_fa} status={stage.status} blockReason={stage.block_reason} />
                    <span className="stage-control-edit">ویرایش</span>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedStage && (
            <Modal
              title={`ویرایش مرحله: ${selectedStage.stage_name_fa}`}
              onClose={() => setSelectedStage(null)}
              className="stage-editor-modal"
              actions={<button onClick={() => setSelectedStage(null)}>بستن</button>}
            >
              {selectedStage.dependency_warning && (
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',padding:'0.6rem 0.8rem',borderRadius:'8px',marginBottom:'1rem',color:'#b45309',fontSize:'0.85rem'}}>
                  ⚠️ {selectedStage.dependency_warning}
                </div>
              )}
              <div className="stage-editor-top">
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <StatusPill progress={selectedStage.progress} label={selectedStage.stage_name_fa} status={selectedStage.status} blockReason={selectedStage.block_reason} />
                  <span className="stage-weight-tag">وزن مرحله: {Math.round((selectedStage.weight ?? 0.14) * 100)}٪</span>
                </div>
                <span>{saving ? 'در حال ذخیره…' : 'تغییرات به صورت خودکار ذخیره می‌شوند.'}</span>
              </div>

              <label className="field" style={{marginBottom: '14px'}}>
                <span>وضعیت اجرایی مرحله</span>
                <select
                  value={selectedStage.status || 'TODO'}
                  onChange={e => {
                    const newStatus = e.target.value;
                    setSelectedStage({...selectedStage, status: newStatus});
                    updateStage(selectedStage, {status: newStatus});
                  }}
                >
                  {STAGE_STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              {selectedStage.status === 'BLOCKED' && (
                <div className="field-block-reason">
                  <label className="field">
                    <span style={{color: '#a83232', fontWeight: 'bold'}}>علت توقف و شرح گلوگاه اجرایی *</span>
                    <textarea
                      value={selectedStage.block_reason || ''}
                      onChange={e => setSelectedStage({...selectedStage, block_reason: e.target.value})}
                      placeholder="علت توقف را بنویسید (مثلاً: عدم تحویل ورق ۴ میل از انبار، خرابی پرس برک، یا عدم تایید نقشه)..."
                      onBlur={e => updateStage(selectedStage, {block_reason: e.target.value})}
                    />
                  </label>
                </div>
              )}

              <label className="stage-progress-input">
                درصد پیشرفت
                <input
                  aria-label="درصد پیشرفت"
                  type="range"
                  min="0"
                  max="100"
                  value={selectedStage.progress}
                  onChange={e => setSelectedStage({...selectedStage, progress: Number(e.target.value)})}
                  onPointerUp={e => updateStage(selectedStage, {progress: e.currentTarget.value})}
                  onKeyUp={e => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                      updateStage(selectedStage, {progress: e.currentTarget.value});
                    }
                  }}
                />
                <b>{selectedStage.progress}٪</b>
              </label>

              <JalaliDateInput
                label="سررسید مرحله"
                value={selectedStage.due_date}
                onChange={value => updateStage(selectedStage, {due_date: value})}
              />

              <label className="field">
                <span>یادداشت مرحله</span>
                <textarea
                  value={selectedStage.note || ''}
                  onChange={e => setSelectedStage({...selectedStage, note: e.target.value})}
                  onBlur={e => updateStage(selectedStage, {note: e.target.value})}
                  placeholder="اقدام بعدی، توضیح یا وضعیت تامین..."
                />
              </label>
            </Modal>
          )}
        </>
      ) : (
        <div className="empty">این سفارش محصولی برای نمایش ندارد.</div>
      )}
    </div>
  );
}
