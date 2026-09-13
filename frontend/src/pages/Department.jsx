import {useEffect, useMemo, useState} from 'react';
import {api} from '../api';
import {toJalali, toJalaliDateTime, todayISO} from '../jalali';
import JalaliDateInput from '../components/JalaliDateInput';
import Modal from '../components/Modal';

const statusLabels = {
  TODO: 'انجام‌نشده',
  IN_PROGRESS: 'در حال انجام',
  DONE: 'تکمیل‌شده',
  BLOCKED: 'متوقف (دارای مانع)',
};

const today = new Date();
today.setHours(0, 0, 0, 0);

const isLate = task => task.status !== 'DONE' && task.status !== 'BLOCKED' && task.due_date && new Date(`${task.due_date}T00:00:00`) < today;

const blankTask = () => ({
  title: '',
  description: '',
  assignee: '',
  status: 'TODO',
  due_date: '',
  reminder_date: todayISO(),
  block_reason: '',
});

export default function Department({type, title, initialOrderId, initialProductId, onBack}){
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [detail, setDetail] = useState(null);
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [note, setNote] = useState('');
  const [form, setForm] = useState(blankTask);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [error, setError] = useState('');
  const [shortageItems, setShortageItems] = useState([]);

  const refresh = async (id = orderId) => {
    if (!id) return;
    try {
      const [orderRows, noteRows, taskRows] = await Promise.all([
        api.get(`/orders/${id}`),
        api.get(`/notes?order_id=${id}&department=${type}`),
        api.get(`/tasks?order_id=${id}&department=${type}`)
      ]);
      setDetail(orderRows);
      setNotes(noteRows);
      setTasks(taskRows);

      if (type === 'PURCHASE') {
        api.get('/procurement/materials-summary').then(res => {
          setShortageItems(res.shortage_items || []);
        }).catch(()=>{});
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    api.get('/orders').then(setOrders).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (initialOrderId) setOrderId(String(initialOrderId));
    if (initialProductId) setTarget(String(initialProductId));
  }, [initialOrderId, initialProductId]);

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setTasks([]);
      setNotes([]);
      return;
    }
    setError('');
    refresh();
  }, [orderId]);

  const product = detail?.items?.find(item => String(item.id) === String(target));
  const scopedTasks = useMemo(() => (target ? tasks.filter(task => String(task.order_item_id) === String(target)) : tasks), [tasks, target]);
  const scopedNotes = useMemo(() => (target ? notes.filter(item => String(item.order_item_id) === String(target)) : notes), [notes, target]);

  const visibleTasks = useMemo(() => {
    return scopedTasks.filter(task => {
      if (taskStatus && task.status !== taskStatus) return false;
      const due = task.due_date ? new Date(`${task.due_date}T00:00:00`) : null;
      const from = dueFrom ? new Date(`${dueFrom}T00:00:00`) : null;
      const to = dueTo ? new Date(`${dueTo}T00:00:00`) : null;
      if (from && (!due || due < from)) return false;
      if (to && (!due || due > to)) return false;
      return true;
    });
  }, [scopedTasks, taskStatus, dueFrom, dueTo]);

  const counts = {
    blocked: visibleTasks.filter(task => task.status === 'BLOCKED').length,
    late: visibleTasks.filter(isLate).length,
    open: visibleTasks.filter(task => !['DONE', 'BLOCKED'].includes(task.status) && !isLate(task)).length,
    done: visibleTasks.filter(task => task.status === 'DONE').length,
  };

  const scopeLabel = product ? `محصول: ${product.product_name}` : `کل پروژه ${detail?.order_no || ''}`;

  const saveTask = async () => {
    if (!form.title.trim() || !orderId) return;
    try {
      await api.post('/tasks', {
        ...form,
        order_id: Number(orderId),
        order_item_id: target ? Number(target) : null,
        department: type,
      });
      setForm(blankTask());
      setTaskOpen(false);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const updateTask = async (task, status) => {
    let block_reason = task.block_reason;
    if (status === 'BLOCKED') {
      const reason = window.prompt('علت توقف / مانع را وارد کنید:', task.block_reason || '');
      if (reason === null) return; // cancelled
      block_reason = reason.trim() || 'دارای مانع اجرایی';
    } else {
      block_reason = null;
    }

    try {
      await api.patch(`/tasks/${task.id}`, {status, block_reason});
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveNote = async () => {
    if (!note.trim() || !orderId) return;
    try {
      await api.post('/notes', {
        order_id: Number(orderId),
        order_item_id: target ? Number(target) : null,
        department: type,
        body: note,
        author: 'کاربر',
      });
      setNote('');
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="page department-page operational-page">
      <header className="page-head department-head">
        <div>
          <div className="eyebrow">کنترل واحد {title}</div>
          <h1>{title}</h1>
          <p>مدیریت فعالیت‌ها، پیگیری پیشرفت و ثبت موانع در سطح پروژه یا محصولات منفرد.</p>
        </div>
        <div className="department-head-actions">
          {onBack && (
            <button className="secondary report-back-btn" onClick={onBack}>
              بازگشت به گزارش
            </button>
          )}
          <div className="department-selectors">
            <label className="order-picker">
              <span>پروژه / سفارش</span>
              <select
                value={orderId}
                onChange={e => {
                  setOrderId(e.target.value);
                  setTarget('');
                }}
              >
                <option value="">انتخاب پروژه</option>
                {orders.map(order => (
                  <option key={order.id} value={order.id}>
                    {order.customer_name} — {order.order_no}
                  </option>
                ))}
              </select>
            </label>
            <label className={`order-picker ${!orderId ? 'is-disabled' : ''}`}>
              <span>سطح کنترل</span>
              <select disabled={!orderId} value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">کل پروژه / همه محصولات</option>
                {detail?.items?.map(item => (
                  <option key={item.id} value={item.id}>
                    محصول: {item.product_name} — تعداد {item.quantity}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {!detail ? (
        <section className="empty-project">
          <h2>یک پروژه را برای شروع انتخاب کنید</h2>
          <p>پس از انتخاب، فعالیت‌ها، پیگیری‌ها و وضعیت موانع {title} نمایش داده می‌شوند.</p>
        </section>
      ) : (
        <>
          <section className="department-command">
            <div>
              <span>سطح فعال</span>
              <b>{scopeLabel}</b>
              <small>{detail.customer_name} · موعد تحویل {detail.delivery_date ? toJalali(detail.delivery_date) : '—'}</small>
            </div>
            <div className="department-counts">
              {counts.blocked > 0 && (
                <span className="late">
                  <b>{counts.blocked}</b> متوقف (مانع)
                </span>
              )}
              <span className={counts.late ? 'late' : ''}>
                <b>{counts.late}</b> عقب‌افتاده
              </span>
              <span>
                <b>{counts.open}</b> باز
              </span>
              <span>
                <b>{counts.done}</b> تکمیل
              </span>
            </div>
            <button onClick={() => setTaskOpen(true)}>افزودن فعالیت</button>
          </section>

          {product && (
            <section className="department-product-strip">
              <div>
                <span>محصول انتخاب‌شده</span>
                <h2>{product.product_name}</h2>
                <small>
                  {product.item_code || 'بدون کد'} · تعداد {product.quantity} · ارسال‌شده {product.shipped_quantity || 0} · مانده {product.remaining_quantity ?? product.quantity}
                </small>
              </div>
              <b>
                {scopedTasks.length}
                <small>فعالیت در این محصول</small>
              </b>
            </section>
          )}

          {type === 'PURCHASE' && shortageItems.length > 0 && (
            <section className="card operational-table" style={{ borderRightColor: '#c44d4d', background: '#fff9f9', marginBottom: '16px' }}>
              <div className="section-title">
                <div>
                  <div className="eyebrow" style={{ color: '#c44d4d' }}>پایش کسری متریال و ورق فولادی (BOM)</div>
                  <h2 style={{ color: '#a82c2c' }}>اقلام نیازمند خرید فوری ({shortageItems.length} قلم کسری)</h2>
                </div>
                <span style={{ color: '#a82c2c', fontWeight: 'bold' }}>اولویت بالای تأمین</span>
              </div>
              <div className="task-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>سفارش / مشتری</th>
                      <th>محصول سازه</th>
                      <th>نام متریال و مشخصات</th>
                      <th>مقدار کل کسری</th>
                      <th>وضعیت تأمین</th>
                      <th>اقدام خرید</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortageItems.map(item => (
                      <tr key={item.id}>
                        <td>
                          <b>{item.order_no}</b>
                          <div style={{ fontSize: '10px', color: '#66827a' }}>{item.customer_name}</div>
                        </td>
                        <td>{item.product_name}</td>
                        <td>
                          <b>{item.material_name}</b>
                          {item.spec && <div style={{ fontSize: '10px', color: '#7a8e87' }}>{item.spec}</div>}
                        </td>
                        <td>
                          <b style={{ color: '#b63838' }}>{Number(item.total_quantity).toLocaleString('fa-IR')} {item.unit}</b>
                        </td>
                        <td>
                          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#b63838', background: '#fdecec', padding: '2px 6px', borderRadius: '4px' }}>
                            نیازمند خرید
                          </span>
                        </td>
                        <td>
                          <button
                            className="secondary"
                            style={{ fontSize: '10px', padding: '4px 8px' }}
                            onClick={async () => {
                              const sup = window.prompt('نام تأمین‌کننده یا شماره پیش‌فاکتور:', item.supplier_name || '');
                              if (sup === null) return;
                              await api.patch(`/bom/${item.id}`, { procurement_status: 'ORDERED', supplier_name: sup.trim() || undefined });
                              refresh();
                            }}
                          >
                            ثبت سفارش خرید (ORDERED)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card operational-table task-list">
            <div className="section-title">
              <div>
                <div className="eyebrow">فهرست پیگیری فعالیت‌ها</div>
                <h2>فعالیت‌های {scopeLabel}</h2>
              </div>
              <span>{visibleTasks.length} از {scopedTasks.length} فعالیت</span>
            </div>

            <div className="department-task-filters">
              <label>
                <span>وضعیت</span>
                <select value={taskStatus} onChange={e => setTaskStatus(e.target.value)}>
                  <option value="">همه وضعیت‌ها</option>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <JalaliDateInput label="موعد از" value={dueFrom} onChange={setDueFrom} />
              <JalaliDateInput label="موعد تا" value={dueTo} onChange={setDueTo} />
              {(taskStatus || dueFrom || dueTo) && (
                <button
                  className="text-button"
                  onClick={() => {
                    setTaskStatus('');
                    setDueFrom('');
                    setDueTo('');
                  }}
                >
                  پاک کردن فیلتر
                </button>
              )}
            </div>

            {scopedTasks.length === 0 ? (
              <div className="empty">هنوز فعالیتی برای این سطح ثبت نشده است.</div>
            ) : visibleTasks.length === 0 ? (
              <div className="empty">فعالیتی مطابق فیلتر انتخاب‌شده وجود ندارد.</div>
            ) : (
              <div className="task-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>وضعیت</th>
                      <th>فعالیت</th>
                      <th>محصول</th>
                      <th>مسئول</th>
                      <th>موعد</th>
                      <th>یادآوری</th>
                      <th>اقدام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map(task => {
                      const isBlocked = task.status === 'BLOCKED';
                      return (
                        <tr key={task.id} className={`${isLate(task) ? 'task-late' : ''} ${isBlocked ? 'task-blocked' : ''}`}>
                          <td>
                            <span className={`task-status ${task.status.toLowerCase()}`}>
                              {statusLabels[task.status] || task.status}
                            </span>
                          </td>
                          <td>
                            <b>{task.title}</b>
                            {isBlocked && (
                              <div style={{marginTop: '3px'}}>
                                <small className="blocker-badge">مانع: {task.block_reason || 'توقف فعالیت'}</small>
                              </div>
                            )}
                            {task.description && <small>{task.description}</small>}
                          </td>
                          <td>{task.product_name || 'کل پروژه'}</td>
                          <td>{task.assignee || '—'}</td>
                          <td>
                            {task.due_date ? toJalali(task.due_date) : '—'}
                            {isLate(task) && <small className="late-label">عقب‌افتاده</small>}
                          </td>
                          <td>{task.reminder_date ? toJalali(task.reminder_date) : '—'}</td>
                          <td>
                            <select
                              aria-label={`تغییر وضعیت ${task.title}`}
                              value={task.status}
                              onChange={e => updateTask(task, e.target.value)}
                            >
                              {Object.entries(statusLabels).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card followup-notes">
            <div className="section-title">
              <div>
                <div className="eyebrow">تاریخچهٔ پیگیری</div>
                <h2>یادداشت‌های {scopeLabel}</h2>
              </div>
              <span>یادداشت جدید به همین سطح ثبت می‌شود.</span>
            </div>
            <div className="note-compose">
              <div className="scope-note-target">
                <span>ثبت برای</span>
                <b>{scopeLabel}</b>
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="اقدام، مانع یا تصمیم جدید…" />
              <button onClick={saveNote}>ثبت یادداشت</button>
            </div>
            <div className="timeline">
              {scopedNotes.length === 0 ? (
                <div className="empty">هنوز یادداشتی برای این سطح ثبت نشده است.</div>
              ) : (
                scopedNotes.map(item => (
                  <div className="timeline-item" key={item.id}>
                    <div>
                      <b>{item.order_item_id ? detail.items.find(x => x.id === item.order_item_id)?.product_name : 'کل پروژه'}</b>
                      <span>{toJalaliDateTime(item.created_at)} · {item.author || '—'}</span>
                    </div>
                    <p>{item.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          {taskOpen && (
            <Modal
              title={`افزودن فعالیت ${title}`}
              onClose={() => setTaskOpen(false)}
              actions={
                <>
                  <button className="secondary" onClick={() => setTaskOpen(false)}>انصراف</button>
                  <button onClick={saveTask}>ثبت فعالیت</button>
                </>
              }
            >
              <div className="task-modal-context">
                ثبت برای: <b>{scopeLabel}</b>
              </div>
              <div className="form-grid compact-form">
                <label className="field wide">
                  <span>عنوان فعالیت *</span>
                  <input
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                    placeholder="مثلاً استعلام قیمت ورق گالوانیزه"
                  />
                </label>
                <label className="field">
                  <span>مسئول پیگیری</span>
                  <input
                    value={form.assignee}
                    onChange={e => setForm({...form, assignee: e.target.value})}
                    placeholder="نام مسئول"
                  />
                </label>
                <label className="field">
                  <span>وضعیت</span>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>

                {form.status === 'BLOCKED' && (
                  <label className="field wide field-block-reason">
                    <span style={{color: '#a83232', fontWeight: 'bold'}}>علت توقف / مانع اجرایی *</span>
                    <textarea
                      value={form.block_reason || ''}
                      onChange={e => setForm({...form, block_reason: e.target.value})}
                      placeholder="علت توقف این فعالیت را توضیح دهید..."
                    />
                  </label>
                )}

                <JalaliDateInput label="موعد انجام" value={form.due_date} onChange={value => setForm({...form, due_date: value})} />
                <JalaliDateInput label="تاریخ یادآوری" value={form.reminder_date} onChange={value => setForm({...form, reminder_date: value})} />
                <label className="field wide">
                  <span>توضیحات</span>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    placeholder="جزئیات، وابستگی یا خروجی مورد انتظار…"
                  />
                </label>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
