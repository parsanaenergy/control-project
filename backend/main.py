from fastapi import FastAPI, HTTPException, Query
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Optional, List, Union, Dict, Any
from pydantic import BaseModel, Field
from .db import connect, init_db, row_dict
from .utils import (
    STAGES, STAGE_DEPENDENCIES, now_iso, today_iso, calc_weighted_progress,
    calc_pole_steel_weight, generate_default_bom_items,
    calc_schedule_variance, generate_default_project_milestones,
    enrich_stages_with_dependencies, record_system_event
)
from .seed import seed_demo

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_demo()
    yield

app = FastAPI(title="سامانه مدیریت پروژه کارخانه", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://[^/]+:5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CustomerIn(BaseModel):
    name: str = Field(min_length=1)
    prefix: str = Field(min_length=1, max_length=12)
    start_counter: int = Field(ge=1)
    phone: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None

class PoleSpecIn(BaseModel):
    pole_type: Optional[str] = "چندضلعی استاندارد"
    height: Optional[float] = 9.0
    bottom_diameter: Optional[float] = 180.0
    top_diameter: Optional[float] = 80.0
    sheet_thickness: Optional[float] = 3.0
    sides_count: Optional[int] = 8
    section_count: Optional[int] = 1
    bracket_type: Optional[str] = None
    bracket_count: Optional[int] = 0
    bracket_length: Optional[float] = None
    bracket_angle: Optional[float] = None
    base_plate_dim: Optional[str] = None
    anchor_bolt_spec: Optional[str] = None
    welding_spec: Optional[str] = None
    surface_treatment: Optional[str] = None
    coating_thickness: Optional[float] = None
    drawing_number: Optional[str] = None
    drawing_revision: Optional[str] = "Rev A"

class ItemIn(BaseModel):
    product_name: str
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    paint_type: Optional[str] = None
    color: Optional[str] = None
    cable_status: Optional[str] = None
    projector_type: Optional[str] = None
    projector_brand: Optional[str] = None
    special_notes: Optional[str] = None
    galvanized: bool = False
    galvanized_notes: Optional[str] = None
    pole_spec: Optional[PoleSpecIn] = None

class ProjectIn(BaseModel):
    customer_id: int
    project_name: str = Field(min_length=1)
    project_code: Optional[str] = None
    site_location: Optional[str] = None
    project_manager: Optional[str] = None
    priority: str = "NORMAL"
    status: str = "ENGINEERING"
    risk_level: str = "LOW"
    contract_no: Optional[str] = None
    contract_date: Optional[str] = None
    contract_value: Optional[float] = 0
    planned_start: Optional[str] = None
    planned_finish: Optional[str] = None
    committed_delivery_date: Optional[str] = None
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    site_location: Optional[str] = None
    project_manager: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    contract_no: Optional[str] = None
    contract_date: Optional[str] = None
    contract_value: Optional[float] = None
    planned_start: Optional[str] = None
    planned_finish: Optional[str] = None
    committed_delivery_date: Optional[str] = None
    actual_start: Optional[str] = None
    actual_finish: Optional[str] = None
    forecast_finish: Optional[str] = None
    description: Optional[str] = None

class OrderIn(BaseModel):
    customer_id: int
    project_id: Optional[int] = None
    order_date: str
    delivery_date: Optional[str] = None
    payment_due_date: Optional[str] = None
    registered_by: Optional[str] = None
    description: Optional[str] = None
    items: List[ItemIn] = Field(min_length=1)

class OrderStatusUpdate(BaseModel):
    status: str

class StageUpdate(BaseModel):
    progress: Optional[int] = Field(None, ge=0, le=100)
    due_date: Optional[str] = None
    note: Optional[str] = None
    updated_by: Optional[str] = None
    status: Optional[str] = None
    block_reason: Optional[str] = None
    weight: Optional[float] = None

class NoteIn(BaseModel):
    order_id: int
    order_item_id: Optional[int] = None
    department: str
    body: str = Field(min_length=1)
    author: Optional[str] = None

class TaskIn(BaseModel):
    order_id: int
    order_item_id: Optional[int] = None
    department: str
    title: str = Field(min_length=1)
    description: Optional[str] = None
    assignee: Optional[str] = None
    status: str = 'TODO'
    due_date: Optional[str] = None
    reminder_date: Optional[str] = None
    block_reason: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    reminder_date: Optional[str] = None
    block_reason: Optional[str] = None

class PaymentIn(BaseModel):
    order_id: int
    payment_type: str
    amount: float = Field(gt=0)
    payment_date: str
    description: Optional[str] = None
    registered_by: Optional[str] = None

class ShipmentIn(BaseModel):
    order_id: int
    order_item_id: int
    shipment_date: str
    quantity: float = Field(gt=0)
    destination: Optional[str] = None
    carrier: Optional[str] = None
    waybill: Optional[str] = None
    receiver: Optional[str] = None
    delivery_status: Optional[str] = None
    description: Optional[str] = None
    registered_by: Optional[str] = None
    override_debt: bool = False


class QCInspectionIn(BaseModel):
    order_item_id: int
    gate_type: str  # 'INCOMING_FORMING', 'WELDING', 'COATING', 'FINAL_ASSEMBLY'
    inspector_name: str = Field(min_length=1)
    inspection_date: Optional[str] = None
    result: str = 'PASSED'  # 'PASSED', 'FAILED', 'CONDITIONAL'
    measured_values: Optional[Union[dict, str]] = None
    check_items: Optional[Union[dict, str]] = None
    remarks: Optional[str] = None


class NCRIn(BaseModel):
    order_item_id: int
    qc_inspection_id: Optional[int] = None
    defect_title: str = Field(min_length=1)
    defect_type: str = 'OTHER'  # 'DIMENSION', 'WELDING', 'GALVANIZING_COATING', 'DEFORMATION', 'ASSEMBLY', 'OTHER'
    severity: str = 'MEDIUM'  # 'MINOR', 'MEDIUM', 'CRITICAL'
    description: str = Field(min_length=1)
    root_cause: Optional[str] = None
    disposition: Optional[str] = 'PENDING'  # 'REWORK', 'SCRAP', 'CONCESSION', 'PENDING'
    disposition_notes: Optional[str] = None
    disposition_by: Optional[str] = None
    status: Optional[str] = 'OPEN'  # 'OPEN', 'IN_REWORK', 'RESOLVED', 'CLOSED'


class NCRUpdate(BaseModel):
    defect_title: Optional[str] = None
    defect_type: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    root_cause: Optional[str] = None
    disposition: Optional[str] = None
    disposition_notes: Optional[str] = None
    disposition_by: Optional[str] = None
    status: Optional[str] = None


class BOMItemIn(BaseModel):
    material_category: str = 'BODY_SHEET'
    material_name: str = Field(min_length=1)
    spec: Optional[str] = None
    quantity_per_pole: float = Field(gt=0)
    total_quantity: Optional[float] = None
    unit: str = 'KG'
    estimated_unit_cost: Optional[float] = 0.0
    procurement_status: Optional[str] = 'IN_STOCK'
    supplier_name: Optional[str] = None
    notes: Optional[str] = None


class BOMItemUpdate(BaseModel):
    material_category: Optional[str] = None
    material_name: Optional[str] = None
    spec: Optional[str] = None
    quantity_per_pole: Optional[float] = None
    total_quantity: Optional[float] = None
    unit: Optional[str] = None
    estimated_unit_cost: Optional[float] = None
    procurement_status: Optional[str] = None
    supplier_name: Optional[str] = None
    notes: Optional[str] = None


class BaselineIn(BaseModel):
    baseline_name: str = Field(min_length=1)
    planned_start: Optional[str] = None
    planned_finish: Optional[str] = None
    contract_value: Optional[float] = None
    scope_poles_count: Optional[int] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class MilestoneIn(BaseModel):
    milestone_code: Optional[str] = None
    title: str = Field(min_length=1)
    stage_key: Optional[str] = None
    baseline_date: Optional[str] = None
    forecast_date: Optional[str] = None
    actual_date: Optional[str] = None
    status: Optional[str] = 'PLANNED'
    weight: Optional[float] = 0.20
    notes: Optional[str] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    stage_key: Optional[str] = None
    baseline_date: Optional[str] = None
    forecast_date: Optional[str] = None
    actual_date: Optional[str] = None
    status: Optional[str] = None
    weight: Optional[float] = None
    notes: Optional[str] = None


class SystemEventIn(BaseModel):
    event_type: str = 'PROJECT'
    severity: str = 'INFO'
    title: str = Field(min_length=1)
    message: str = Field(min_length=1)
    actor: Optional[str] = 'سیستم'
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


def order_financials(conn, order_id: int):
    total = conn.execute("SELECT COALESCE(SUM(quantity*unit_price),0) v FROM order_items WHERE order_id=?", (order_id,)).fetchone()["v"]
    paid = conn.execute("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE order_id=? AND voided=0", (order_id,)).fetchone()["v"]
    return float(total or 0), float(paid or 0), max(float(total or 0)-float(paid or 0), 0)


def item_delivery(conn, item_id: int):
    ordered = conn.execute("SELECT quantity FROM order_items WHERE id=?", (item_id,)).fetchone()
    if not ordered: return 0,0,0
    shipped = conn.execute("SELECT COALESCE(SUM(quantity),0) v FROM shipments WHERE order_item_id=?", (item_id,)).fetchone()["v"]
    q=float(ordered["quantity"]); s=float(shipped or 0)
    return q,s,max(q-s,0)

@app.get("/api/health")
def health(): return {"ok": True}

@app.get("/api/customers")
def customers():
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM customers ORDER BY name COLLATE NOCASE").fetchall()]

@app.get("/api/customers/summary")
def customer_summary():
    """Customer master data enriched with the current sales and collection position."""
    with connect() as conn:
        result=[]
        for customer in conn.execute("SELECT * FROM customers ORDER BY name COLLATE NOCASE").fetchall():
            item=dict(customer)
            orders=conn.execute("SELECT id,status FROM orders WHERE customer_id=?",(item["id"],)).fetchall()
            balance=sum(order_financials(conn,order["id"])[2] for order in orders)
            item.update(order_count=len(orders),active_order_count=sum(order["status"]=="ACTIVE" for order in orders),balance=balance)
            result.append(item)
        return result

@app.post("/api/customers")
def create_customer(data: CustomerIn):
    with connect() as conn:
        code = f"C{(conn.execute('SELECT COALESCE(MAX(id),0)+1 n FROM customers').fetchone()['n']):06d}"
        try:
            cur=conn.execute("""INSERT INTO customers(code,name,prefix,phone,address,description,start_counter,next_order_counter)
                VALUES(?,?,?,?,?,?,?,?)""",(code,data.name.strip(),data.prefix.strip(),data.phone,data.address,data.description,data.start_counter,data.start_counter))
        except Exception as e:
            if "UNIQUE" in str(e).upper(): raise HTTPException(409,"نام مشتری یا پیشوند تکراری است")
            raise
        return row_dict(conn.execute("SELECT * FROM customers WHERE id=?",(cur.lastrowid,)).fetchone())

@app.get("/api/projects")
def projects_list(
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    risk_level: Optional[str] = None,
):
    """List of projects enriched with order statistics, progress and financials."""
    where = []
    params = []
    if customer_id:
        where.append("p.customer_id = ?")
        params.append(customer_id)
    if status:
        where.append("p.status = ?")
        params.append(status.upper())
    if priority:
        where.append("p.priority = ?")
        params.append(priority.upper())
    if risk_level:
        where.append("p.risk_level = ?")
        params.append(risk_level.upper())

    sql = """
        SELECT p.*, c.name customer_name, c.prefix customer_prefix
        FROM projects p
        JOIN customers c ON c.id = p.customer_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY p.created_at DESC, p.id DESC"

    with connect() as conn:
        rows = []
        for r in conn.execute(sql, params).fetchall():
            d = dict(r)
            pid = d["id"]
            orders = conn.execute("SELECT id, order_no, status, order_date, delivery_date FROM orders WHERE project_id = ?", (pid,)).fetchall()
            order_ids = [o["id"] for o in orders]

            total_val = 0.0
            total_paid = 0.0
            total_bal = 0.0
            total_qty = 0.0
            total_shipped = 0.0
            all_stage_progress = []
            blocked_count = 0

            for oid in order_ids:
                t, p, b = order_financials(conn, oid)
                total_val += t
                total_paid += p
                total_bal += b
                for item in conn.execute("SELECT id, quantity FROM order_items WHERE order_id = ?", (oid,)).fetchall():
                    q, s, rem = item_delivery(conn, item["id"])
                    total_qty += q
                    total_shipped += s
                    st_rows = conn.execute("SELECT stage_key, progress, weight, status, block_reason FROM project_stages WHERE order_item_id = ?", (item["id"],)).fetchall()
                    if st_rows:
                        item_p = calc_weighted_progress([dict(r) for r in st_rows])
                        all_stage_progress.append(item_p)
                        blocked_count += sum(1 for r in st_rows if r["status"] == "BLOCKED")

            overall_progress = round(sum(all_stage_progress) / max(len(all_stage_progress), 1))
            active_b = conn.execute("SELECT * FROM project_baselines WHERE project_id = ? AND is_active = 1 ORDER BY baseline_version DESC LIMIT 1", (pid,)).fetchone()
            b_finish = active_b["planned_finish"] if active_b else (d.get("committed_delivery_date") or d.get("planned_finish"))
            sv = calc_schedule_variance(b_finish, d.get("forecast_finish"), d.get("actual_finish"))
            d.update(
                order_count=len(orders),
                total_value=total_val or float(d["contract_value"] or 0),
                paid_amount=total_paid,
                balance=total_bal,
                total_quantity=total_qty,
                shipped_quantity=total_shipped,
                remaining_quantity=max(total_qty - total_shipped, 0),
                progress=overall_progress,
                blocked_stages_count=blocked_count,
                active_baseline=dict(active_b) if active_b else None,
                schedule_variance=sv["variance_days"],
                schedule_status=sv["status"],
                schedule_status_label=sv["status_label"],
                is_schedule_delayed=sv["is_delayed"],
            )
            rows.append(d)
        return rows

@app.get("/api/projects/{project_id}")
def project_detail(project_id: int):
    """Detailed view of a single project, its linked orders, items, baselines, milestones, and technical specifications."""
    with connect() as conn:
        p = conn.execute("""
            SELECT p.*, c.name customer_name, c.code customer_code, c.prefix customer_prefix
            FROM projects p
            JOIN customers c ON c.id = p.customer_id
            WHERE p.id = ?
        """, (project_id,)).fetchone()
        if not p:
            raise HTTPException(404, "پروژه یافت نشد")

        out = dict(p)
        orders = []
        all_items = []
        total_val = 0.0
        total_paid = 0.0
        total_bal = 0.0

        for o in conn.execute("SELECT * FROM orders WHERE project_id = ? ORDER BY order_date ASC, id ASC", (project_id,)).fetchall():
            od = dict(o)
            t, pd, b = order_financials(conn, od["id"])
            total_val += t
            total_paid += pd
            total_bal += b
            od.update(total_amount=t, paid_amount=pd, balance=b)

            items = []
            for ir in conn.execute("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", (od["id"],)).fetchall():
                i = dict(ir)
                q, s, rem = item_delivery(conn, i["id"])
                stages_raw = [dict(st) for st in conn.execute("SELECT * FROM project_stages WHERE order_item_id = ? ORDER BY id", (i["id"],)).fetchall()]
                stages = enrich_stages_with_dependencies(stages_raw)
                spec = conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (i["id"],)).fetchone()
                last_note = conn.execute("SELECT * FROM notes WHERE order_item_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", (i["id"],)).fetchone()

                item_progress = calc_weighted_progress(stages)
                is_blocked = any(st.get("status") == "BLOCKED" for st in stages)
                block_reason = next((st.get("block_reason") for st in stages if st.get("status") == "BLOCKED" and st.get("block_reason")), None)
                i.update(
                    shipped_quantity=s,
                    remaining_quantity=rem,
                    stages=stages,
                    progress=item_progress,
                    is_blocked=is_blocked,
                    block_reason=block_reason,
                    pole_spec=dict(spec) if spec else None,
                    last_note=dict(last_note) if last_note else None,
                    order_no=od["order_no"],
                )
                items.append(i)
                all_items.append(i)

            od["items"] = items
            orders.append(od)

        avg_progress = round(sum(it["progress"] for it in all_items) / max(len(all_items), 1))

        # Baseline & Milestone schedule intelligence
        active_b = conn.execute("""
            SELECT * FROM project_baselines 
            WHERE project_id = ? AND is_active = 1 
            ORDER BY baseline_version DESC LIMIT 1
        """, (project_id,)).fetchone()
        baselines = [dict(r) for r in conn.execute("SELECT * FROM project_baselines WHERE project_id = ? ORDER BY baseline_version DESC, id DESC", (project_id,)).fetchall()]
        raw_m = conn.execute("SELECT * FROM project_milestones WHERE project_id = ? ORDER BY milestone_code ASC, id ASC", (project_id,)).fetchall()
        milestones = []
        achieved_cnt = 0
        delayed_cnt = 0
        for m in raw_m:
            md = dict(m)
            sv_m = calc_schedule_variance(md.get("baseline_date"), md.get("actual_date") or md.get("forecast_date"))
            md["variance_days"] = sv_m["variance_days"]
            md["is_delayed"] = sv_m["is_delayed"]
            if md["status"] == "ACHIEVED":
                achieved_cnt += 1
            if md["status"] == "DELAYED" or sv_m["is_delayed"]:
                delayed_cnt += 1
            milestones.append(md)

        b_finish = active_b["planned_finish"] if active_b else (out.get("committed_delivery_date") or out.get("planned_finish"))
        proj_sv = calc_schedule_variance(b_finish, out.get("forecast_finish"), out.get("actual_finish"))

        out.update(
            orders=orders,
            items=all_items,
            total_value=total_val or float(out["contract_value"] or 0),
            paid_amount=total_paid,
            balance=total_bal,
            progress=avg_progress,
            active_baseline=dict(active_b) if active_b else None,
            baselines=baselines,
            milestones=milestones,
            milestones_summary={"total": len(milestones), "achieved": achieved_cnt, "delayed": delayed_cnt},
            schedule_variance=proj_sv["variance_days"],
            schedule_status=proj_sv["status"],
            schedule_status_label=proj_sv["status_label"],
            is_schedule_delayed=proj_sv["is_delayed"],
        )
        return out

@app.post("/api/projects")
def create_project(data: ProjectIn):
    """Create a new project master record."""
    with connect() as conn:
        c = conn.execute("SELECT * FROM customers WHERE id = ?", (data.customer_id,)).fetchone()
        if not c:
            raise HTTPException(404, "مشتری یافت نشد")

        project_code = data.project_code
        if not project_code:
            n = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 n FROM projects").fetchone()["n"]
            project_code = f"PRJ-{c['prefix']}{n:04d}"

        if conn.execute("SELECT 1 FROM projects WHERE project_code = ?", (project_code,)).fetchone():
            raise HTTPException(409, "کد پروژه تکراری است")

        cur = conn.execute("""
            INSERT INTO projects (
                project_code, customer_id, project_name, site_location, project_manager,
                priority, status, risk_level, contract_no, contract_date, contract_value,
                planned_start, planned_finish, committed_delivery_date, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            project_code, data.customer_id, data.project_name.strip(), data.site_location,
            data.project_manager, data.priority, data.status, data.risk_level,
            data.contract_no, data.contract_date, data.contract_value or 0,
            data.planned_start, data.planned_finish, data.committed_delivery_date,
            data.description,
        ))
        pid = cur.lastrowid

        # Auto-initialize baseline Rev 0 and default 5 milestones
        p_start = data.planned_start or data.contract_date or today_iso()
        p_finish = data.planned_finish or data.committed_delivery_date or p_start
        conn.execute("""
            INSERT INTO project_baselines (
                project_id, baseline_version, baseline_name, baseline_date,
                planned_start, planned_finish, contract_value, scope_poles_count,
                approved_by, notes, is_active
            ) VALUES (?, 1, 'خط مبنای اولیه (Rev 0)', date('now'), ?, ?, ?, 0, ?, 'ثبت اولیه همراه با ایجاد پروژه', 1)
        """, (pid, p_start, p_finish, float(data.contract_value or 0), data.project_manager or "مدیریت کارخانه"))
        m_list = generate_default_project_milestones(pid, p_start, p_finish)
        for m in m_list:
            conn.execute("""
                INSERT INTO project_milestones (
                    project_id, milestone_code, title, stage_key,
                    baseline_date, forecast_date, actual_date, status, weight, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                m["project_id"], m["milestone_code"], m["title"], m["stage_key"],
                m["baseline_date"], m["forecast_date"], m["actual_date"],
                m["status"], m["weight"], m["notes"]
            ))

        record_system_event(
            conn,
            event_type="PROJECT",
            severity="INFO",
            title=f"ایجاد پروژه جدید {project_code}",
            message=f"پروژه «{data.project_name.strip()}» با اولویت {data.priority} و مدیر پروژه {data.project_manager or 'تعیین‌نشده'} ثبت گردید.",
            actor=data.project_manager or "سیستم",
            entity_type="projects",
            entity_id=pid,
            metadata={"project_code": project_code, "priority": data.priority, "customer_id": data.customer_id}
        )

        return row_dict(conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone())

@app.patch("/api/projects/{project_id}")
def update_project(project_id: int, data: ProjectUpdate):
    """Update project status, priority, dates or metadata."""
    fields = []
    values = []
    for key in [
        "project_name", "site_location", "project_manager", "priority", "status",
        "risk_level", "contract_no", "contract_date", "contract_value",
        "planned_start", "planned_finish", "committed_delivery_date",
        "actual_start", "actual_finish", "forecast_finish", "description",
    ]:
        val = getattr(data, key)
        if val is not None:
            fields.append(f"{key} = ?")
            values.append(val.strip() if isinstance(val, str) else val)

    if not fields:
        raise HTTPException(400, "تغییری ارسال نشده است")

    fields.append("updated_at = ?")
    values.append(now_iso())
    values.append(project_id)

    with connect() as conn:
        if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(404, "پروژه یافت نشد")
        conn.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id = ?", values)

        # If status moved to READY_FOR_PRODUCTION or IN_PRODUCTION and no baseline exists, auto-initialize
        if data.status in {"READY_FOR_PRODUCTION", "IN_PRODUCTION"}:
            has_b = conn.execute("SELECT 1 FROM project_baselines WHERE project_id = ?", (project_id,)).fetchone()
            if not has_b:
                cur_p = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                p_start = cur_p["planned_start"] or today_iso()
                p_finish = cur_p["planned_finish"] or cur_p["committed_delivery_date"] or p_start
                conn.execute("""
                    INSERT INTO project_baselines (
                        project_id, baseline_version, baseline_name, baseline_date,
                        planned_start, planned_finish, contract_value, scope_poles_count,
                        approved_by, notes, is_active
                    ) VALUES (?, 1, 'خط مبنای اولیه (Rev 0)', date('now'), ?, ?, ?, 0, ?, 'تولید خودکار در تغییر وضعیت پروژه', 1)
                """, (project_id, p_start, p_finish, float(cur_p["contract_value"] or 0), cur_p["project_manager"] or "مدیریت"))
                m_list = generate_default_project_milestones(project_id, p_start, p_finish)
                for m in m_list:
                    conn.execute("""
                        INSERT INTO project_milestones (
                            project_id, milestone_code, title, stage_key,
                            baseline_date, forecast_date, actual_date, status, weight, notes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        m["project_id"], m["milestone_code"], m["title"], m["stage_key"],
                        m["baseline_date"], m["forecast_date"], m["actual_date"],
                        m["status"], m["weight"], m["notes"]
                    ))

        return row_dict(conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone())

@app.get("/api/items/{item_id}/spec")
def get_item_spec(item_id: int):
    """Get pole engineering specification for an item."""
    with connect() as conn:
        spec = conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (item_id,)).fetchone()
        if not spec:
            raise HTTPException(404, "مشخصات سازه یافت نشد")
        return row_dict(spec)

@app.put("/api/items/{item_id}/spec")
def save_item_spec(item_id: int, data: PoleSpecIn):
    """Save or update pole engineering specification for an item."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM order_items WHERE id = ?", (item_id,)).fetchone():
            raise HTTPException(404, "محصول یافت نشد")
        exists = conn.execute("SELECT id FROM pole_specifications WHERE order_item_id = ?", (item_id,)).fetchone()
        if exists:
            conn.execute("""
                UPDATE pole_specifications SET
                    pole_type=?, height=?, bottom_diameter=?, top_diameter=?, sheet_thickness=?,
                    sides_count=?, section_count=?, bracket_type=?, bracket_count=?, bracket_length=?,
                    bracket_angle=?, base_plate_dim=?, anchor_bolt_spec=?, welding_spec=?,
                    surface_treatment=?, coating_thickness=?, drawing_number=?, drawing_revision=?,
                    updated_at=?
                WHERE order_item_id = ?
            """, (
                data.pole_type, data.height, data.bottom_diameter, data.top_diameter, data.sheet_thickness,
                data.sides_count or 0, data.section_count or 1, data.bracket_type, data.bracket_count or 0,
                data.bracket_length, data.bracket_angle, data.base_plate_dim, data.anchor_bolt_spec,
                data.welding_spec, data.surface_treatment, data.coating_thickness, data.drawing_number,
                data.drawing_revision or 'Rev A', now_iso(), item_id,
            ))
        else:
            conn.execute("""
                INSERT INTO pole_specifications (
                    order_item_id, pole_type, height, bottom_diameter, top_diameter, sheet_thickness,
                    sides_count, section_count, bracket_type, bracket_count, bracket_length, bracket_angle,
                    base_plate_dim, anchor_bolt_spec, welding_spec, surface_treatment, coating_thickness,
                    drawing_number, drawing_revision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item_id, data.pole_type, data.height, data.bottom_diameter, data.top_diameter, data.sheet_thickness,
                data.sides_count or 0, data.section_count or 1, data.bracket_type, data.bracket_count or 0,
                data.bracket_length, data.bracket_angle, data.base_plate_dim, data.anchor_bolt_spec,
                data.welding_spec, data.surface_treatment, data.coating_thickness, data.drawing_number,
                data.drawing_revision or 'Rev A',
            ))
        return row_dict(conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (item_id,)).fetchone())

@app.get("/api/projects/{project_id}/baselines")
def get_project_baselines(project_id: int):
    """Retrieve all schedule baseline versions for a project."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(404, "پروژه یافت نشد")
        rows = conn.execute("""
            SELECT * FROM project_baselines 
            WHERE project_id = ? 
            ORDER BY baseline_version DESC, id DESC
        """, (project_id,)).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/projects/{project_id}/baselines")
def create_project_baseline(project_id: int, data: BaselineIn):
    """Create a new baseline snapshot version (Rev N) for schedule control."""
    with connect() as conn:
        p = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not p:
            raise HTTPException(404, "پروژه یافت نشد")

        curr_max_v = conn.execute("SELECT COALESCE(MAX(baseline_version), 0) mv FROM project_baselines WHERE project_id = ?", (project_id,)).fetchone()["mv"]
        next_v = curr_max_v + 1

        if data.is_active:
            conn.execute("UPDATE project_baselines SET is_active = 0 WHERE project_id = ?", (project_id,))

        scope_poles = data.scope_poles_count
        if scope_poles is None:
            scope_row = conn.execute("""
                SELECT COALESCE(SUM(oi.quantity), 0) q
                FROM orders o JOIN order_items oi ON oi.order_id = o.id
                WHERE o.project_id = ?
            """, (project_id,)).fetchone()
            scope_poles = int(scope_row["q"] or 0)

        cur = conn.execute("""
            INSERT INTO project_baselines (
                project_id, baseline_version, baseline_name, baseline_date,
                planned_start, planned_finish, contract_value, scope_poles_count,
                approved_by, notes, is_active
            ) VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?)
        """, (
            project_id, next_v, data.baseline_name.strip(),
            data.planned_start or p["planned_start"],
            data.planned_finish or p["planned_finish"] or p["committed_delivery_date"],
            data.contract_value if data.contract_value is not None else float(p["contract_value"] or 0),
            scope_poles, data.approved_by or p["project_manager"] or "مدیریت کارخانه",
            data.notes, 1 if data.is_active else 0
        ))
        bid = cur.lastrowid
        return row_dict(conn.execute("SELECT * FROM project_baselines WHERE id = ?", (bid,)).fetchone())

@app.get("/api/projects/{project_id}/milestones")
def get_project_milestones(project_id: int):
    """Get project milestones with variance and schedule status."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(404, "پروژه یافت نشد")
        rows = conn.execute("""
            SELECT * FROM project_milestones 
            WHERE project_id = ? 
            ORDER BY milestone_code ASC, id ASC
        """, (project_id,)).fetchall()

        res = []
        for r in rows:
            d = dict(r)
            b_date = d.get("baseline_date")
            comp_date = d.get("actual_date") or d.get("forecast_date")
            sv = calc_schedule_variance(b_date, comp_date)
            d["variance_days"] = sv["variance_days"]
            d["is_delayed"] = sv["is_delayed"]
            res.append(d)
        return res

@app.post("/api/projects/{project_id}/milestones")
def create_project_milestone(project_id: int, data: MilestoneIn):
    """Add a key project milestone."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(404, "پروژه یافت نشد")

        status = (data.status or "PLANNED").upper()
        if status not in {"PLANNED", "IN_PROGRESS", "ACHIEVED", "DELAYED"}:
            raise HTTPException(400, "وضعیت نقطه عطف نامعتبر است")

        code = data.milestone_code
        if not code:
            count = conn.execute("SELECT COUNT(*) c FROM project_milestones WHERE project_id = ?", (project_id,)).fetchone()["c"]
            code = f"M{count + 1}"

        cur = conn.execute("""
            INSERT INTO project_milestones (
                project_id, milestone_code, title, stage_key, baseline_date,
                forecast_date, actual_date, status, weight, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            project_id, code, data.title.strip(), data.stage_key,
            data.baseline_date, data.forecast_date or data.baseline_date,
            data.actual_date, status, float(data.weight or 0.20), data.notes
        ))
        mid = cur.lastrowid
        return row_dict(conn.execute("SELECT * FROM project_milestones WHERE id = ?", (mid,)).fetchone())

@app.patch("/api/milestones/{milestone_id}")
def update_project_milestone(milestone_id: int, data: MilestoneUpdate):
    """Update milestone status, dates, or notes."""
    with connect() as conn:
        existing = conn.execute("SELECT * FROM project_milestones WHERE id = ?", (milestone_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "نقطه عطف یافت نشد")

        fields = []
        values = []
        for key in ["title", "stage_key", "baseline_date", "forecast_date", "actual_date", "notes"]:
            val = getattr(data, key)
            if val is not None:
                fields.append(f"{key} = ?")
                values.append(val.strip() if isinstance(val, str) else val)

        if data.weight is not None:
            fields.append("weight = ?")
            values.append(float(data.weight))

        if data.status is not None:
            st = data.status.upper()
            if st not in {"PLANNED", "IN_PROGRESS", "ACHIEVED", "DELAYED"}:
                raise HTTPException(400, "وضعیت نقطه عطف نامعتبر است")
            fields.append("status = ?")
            values.append(st)
            if st == "ACHIEVED" and not data.actual_date and not existing["actual_date"]:
                fields.append("actual_date = ?")
                values.append(today_iso())

        if not fields:
            raise HTTPException(400, "تغییری ارسال نشده است")

        fields.append("updated_at = ?")
        values.append(now_iso())
        values.append(milestone_id)

        conn.execute(f"UPDATE project_milestones SET {', '.join(fields)} WHERE id = ?", values)
        return row_dict(conn.execute("SELECT * FROM project_milestones WHERE id = ?", (milestone_id,)).fetchone())

@app.delete("/api/milestones/{milestone_id}")
def delete_project_milestone(milestone_id: int):
    """Delete a project milestone."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM project_milestones WHERE id = ?", (milestone_id,)).fetchone():
            raise HTTPException(404, "نقطه عطف یافت نشد")
        conn.execute("DELETE FROM project_milestones WHERE id = ?", (milestone_id,))
        return {"ok": True, "message": "نقطه عطف با موفقیت حذف شد"}

@app.get("/api/projects/{project_id}/schedule")
def project_schedule_summary(project_id: int):
    """Get project schedule analysis, active baseline comparison, and milestone progress."""
    with connect() as conn:
        p = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not p:
            raise HTTPException(404, "پروژه یافت نشد")

        active_b = conn.execute("""
            SELECT * FROM project_baselines 
            WHERE project_id = ? AND is_active = 1 
            ORDER BY baseline_version DESC LIMIT 1
        """, (project_id,)).fetchone()

        baselines = [dict(r) for r in conn.execute("SELECT * FROM project_baselines WHERE project_id = ? ORDER BY baseline_version DESC, id DESC", (project_id,)).fetchall()]

        raw_m = conn.execute("SELECT * FROM project_milestones WHERE project_id = ? ORDER BY milestone_code ASC, id ASC", (project_id,)).fetchall()
        milestones = []
        achieved_cnt = 0
        delayed_cnt = 0
        for m in raw_m:
            md = dict(m)
            sv_m = calc_schedule_variance(md.get("baseline_date"), md.get("actual_date") or md.get("forecast_date"))
            md["variance_days"] = sv_m["variance_days"]
            md["is_delayed"] = sv_m["is_delayed"]
            if md["status"] == "ACHIEVED":
                achieved_cnt += 1
            if md["status"] == "DELAYED" or sv_m["is_delayed"]:
                delayed_cnt += 1
            milestones.append(md)

        b_finish = active_b["planned_finish"] if active_b else (p["committed_delivery_date"] or p["planned_finish"])
        proj_sv = calc_schedule_variance(b_finish, p["forecast_finish"], p["actual_finish"])

        return {
            "project_id": project_id,
            "project_code": p["project_code"],
            "project_name": p["project_name"],
            "status": p["status"],
            "planned_start": p["planned_start"],
            "planned_finish": p["planned_finish"],
            "committed_delivery_date": p["committed_delivery_date"],
            "forecast_finish": p["forecast_finish"],
            "actual_start": p["actual_start"],
            "actual_finish": p["actual_finish"],
            "active_baseline": dict(active_b) if active_b else None,
            "baselines_count": len(baselines),
            "baselines": baselines,
            "schedule_variance_days": proj_sv["variance_days"],
            "schedule_status": proj_sv["status"],
            "schedule_status_label": proj_sv["status_label"],
            "is_delayed": proj_sv["is_delayed"],
            "milestones_total": len(milestones),
            "milestones_achieved": achieved_cnt,
            "milestones_delayed": delayed_cnt,
            "milestones": milestones,
            "stage_dependencies": STAGE_DEPENDENCIES,
        }

@app.get("/api/orders")
def orders(customer_id: Optional[int]=None, project_id: Optional[int]=None, active_only: bool=False):
    where=[]; params=[]
    if customer_id: where.append("o.customer_id=?"); params.append(customer_id)
    if project_id: where.append("o.project_id=?"); params.append(project_id)
    if active_only: where.append("o.status='ACTIVE'")
    sql="""SELECT o.*, c.name customer_name, p.project_code, p.project_name
           FROM orders o
           JOIN customers c ON c.id=o.customer_id
           LEFT JOIN projects p ON p.id=o.project_id"""
    if where: sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY o.order_date ASC, o.id ASC"
    with connect() as conn:
        rows=[]
        for r in conn.execute(sql,params).fetchall():
            d=dict(r); total,paid,balance=order_financials(conn,d["id"]); d.update(total_amount=total,paid_amount=paid,balance=balance); rows.append(d)
        return rows

@app.get("/api/reports/products")
def product_report(mode: str = "all", customer_id: Optional[int] = None, status: Optional[str] = None):
    """Product-level management report, including the parent order, operations, finance and pole specs."""
    if mode not in {"all", "in_line", "unsent", "completed"}:
        raise HTTPException(400, "نوع گزارش نامعتبر است")
    where=[]; params=[]
    if customer_id:
        where.append("o.customer_id=?"); params.append(customer_id)
    if status:
        normalized=status.upper()
        if normalized not in {"ACTIVE", "COMPLETED", "CANCELLED"}:
            raise HTTPException(400, "وضعیت سفارش نامعتبر است")
        where.append("o.status=?"); params.append(normalized)
    sql="""SELECT o.*, c.name customer_name, p.project_code, p.project_name
           FROM orders o
           JOIN customers c ON c.id=o.customer_id
           LEFT JOIN projects p ON p.id=o.project_id"""
    if where: sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY COALESCE(o.delivery_date,'9999-12-31'),o.order_date,o.id"
    with connect() as conn:
        orders=conn.execute(sql,params).fetchall()
        result=[]
        for order in orders:
            order_data=dict(order)
            total_amount,paid_amount,balance=order_financials(conn,order["id"])
            item_count=conn.execute("SELECT COUNT(*) n FROM order_items WHERE order_id=?",(order["id"],)).fetchone()["n"]
            for item in conn.execute("SELECT * FROM order_items WHERE order_id=? ORDER BY id",(order["id"],)).fetchall():
                d=dict(item); ordered=float(d["quantity"]); _,shipped,remaining=item_delivery(conn,d["id"])
                stages=[dict(s) for s in conn.execute("SELECT * FROM project_stages WHERE order_item_id=? ORDER BY id",(d["id"],)).fetchall()]
                progress=calc_weighted_progress(stages)
                current=next((s["stage_name_fa"] for s in reversed(stages) if 0<int(s["progress"] or 0)<100),stages[-1]["stage_name_fa"] if stages else "-")
                if mode=="unsent" and remaining<=0: continue
                if mode=="in_line" and progress>=100: continue
                if mode=="completed" and progress<100: continue
                shipments=[dict(s) for s in conn.execute("SELECT * FROM shipments WHERE order_item_id=? ORDER BY shipment_date DESC,id DESC",(d["id"],)).fetchall()]
                tasks=[dict(t) for t in conn.execute("SELECT * FROM department_tasks WHERE order_item_id=? ORDER BY CASE status WHEN 'DONE' THEN 1 ELSE 0 END,due_date,id",(d["id"],)).fetchall()]
                task_summary={"total":len(tasks),"todo":sum(t["status"]=="TODO" for t in tasks),"in_progress":sum(t["status"]=="IN_PROGRESS" for t in tasks),"done":sum(t["status"]=="DONE" for t in tasks),"blocked":sum(t["status"]=="BLOCKED" for t in tasks)}
                is_blocked = any(s.get("status") == "BLOCKED" for s in stages) or any(t.get("status") == "BLOCKED" for t in tasks)
                block_reason = next((s.get("block_reason") for s in stages if s.get("status") == "BLOCKED" and s.get("block_reason")), next((t.get("block_reason") for t in tasks if t.get("status") == "BLOCKED" and t.get("block_reason")), None))
                last_note=conn.execute("SELECT * FROM notes WHERE order_item_id=? ORDER BY created_at DESC,id DESC LIMIT 1",(d["id"],)).fetchone()
                spec=conn.execute("SELECT * FROM pole_specifications WHERE order_item_id=?",(d["id"],)).fetchone()
                d.update(
                    order_id=order["id"], order_no=order["order_no"], customer_id=order["customer_id"], customer_name=order["customer_name"],
                    project_id=order["project_id"], project_code=order.get("project_code"), project_name=order.get("project_name"),
                    order_date=order["order_date"], delivery_date=order["delivery_date"], payment_due_date=order["payment_due_date"],
                    order_description=order["description"], order_status=order["status"], registered_by=order["registered_by"], order_item_count=item_count,
                    order_total_amount=total_amount, order_paid_amount=paid_amount, order_balance=balance, product_total_amount=ordered*float(d["unit_price"] or 0),
                    shipped_quantity=shipped, remaining_quantity=remaining, progress=progress, current_stage=current,
                    completed_stage_count=sum(int(s["progress"] or 0)>=100 for s in stages), stages=stages, shipments=shipments,
                    tasks=tasks, task_summary=task_summary, is_blocked=is_blocked, block_reason=block_reason,
                    last_note=dict(last_note) if last_note else None,
                    pole_spec=dict(spec) if spec else None,
                )
                result.append(d)
        return result

@app.post("/api/orders")
def create_order(data: OrderIn):
    with connect() as conn:
        c=conn.execute("SELECT * FROM customers WHERE id=?",(data.customer_id,)).fetchone()
        if not c: raise HTTPException(404,"مشتری یافت نشد")
        counter=int(c["next_order_counter"])
        order_no=f"{c['prefix']}{counter}"
        if conn.execute("SELECT 1 FROM orders WHERE order_no=?",(order_no,)).fetchone(): raise HTTPException(409,"شماره سفارش تکراری است")

        project_id = data.project_id
        if project_id:
            if not conn.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
                raise HTTPException(404, "پروژه انتخاب‌شده یافت نشد")
        else:
            # Auto-create project for this order
            p_code = f"PRJ-{order_no}"
            p_name = f"پروژه سازه {order_no}"
            total_val = sum(float(item.quantity) * float(item.unit_price) for item in data.items)
            p_cur = conn.execute("""
                INSERT INTO projects (
                    project_code, customer_id, project_name, project_manager,
                    contract_no, contract_date, contract_value, committed_delivery_date,
                    description, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PRODUCTION')
            """, (
                p_code, data.customer_id, p_name, data.registered_by or "مدیر کارخانه",
                order_no, data.order_date, total_val, data.delivery_date, data.description
            ))
            project_id = p_cur.lastrowid

        cur=conn.execute("""INSERT INTO orders(order_no,customer_id,project_id,order_date,delivery_date,payment_due_date,registered_by,description)
            VALUES(?,?,?,?,?,?,?,?)""",(order_no,data.customer_id,project_id,data.order_date,data.delivery_date,data.payment_due_date,data.registered_by,data.description))
        oid=cur.lastrowid
        next_item=int(conn.execute("SELECT COALESCE(MAX(id),0)+1 n FROM order_items").fetchone()["n"])
        for idx,item in enumerate(data.items):
            item_code=f"I{next_item+idx:06d}"
            icur=conn.execute("""INSERT INTO order_items(item_code,order_id,product_name,quantity,unit_price,paint_type,color,cable_status,projector_type,projector_brand,special_notes,galvanized,galvanized_notes)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",(item_code,oid,item.product_name,item.quantity,item.unit_price,item.paint_type,item.color,item.cable_status,item.projector_type,item.projector_brand,item.special_notes,int(item.galvanized),item.galvanized_notes))
            iid=icur.lastrowid
            for key, fa, weight in STAGES:
                conn.execute("INSERT INTO project_stages(order_item_id,stage_key,stage_name_fa,progress,due_date,weight,status) VALUES(?,?,?,?,?,?,?)",(iid,key,fa,0,data.delivery_date,weight,'TODO'))

            # Save pole specifications
            sp = item.pole_spec
            if sp:
                conn.execute("""INSERT INTO pole_specifications (
                    order_item_id, pole_type, height, bottom_diameter, top_diameter, sheet_thickness,
                    sides_count, section_count, bracket_type, bracket_count, bracket_length, bracket_angle,
                    base_plate_dim, anchor_bolt_spec, welding_spec, surface_treatment, coating_thickness,
                    drawing_number, drawing_revision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                    iid, sp.pole_type or "چندضلعی استاندارد", sp.height or 9.0, sp.bottom_diameter,
                    sp.top_diameter, sp.sheet_thickness or 3.0, sp.sides_count or 8, sp.section_count or 1,
                    sp.bracket_type, sp.bracket_count or 0, sp.bracket_length, sp.bracket_angle,
                    sp.base_plate_dim, sp.anchor_bolt_spec, sp.welding_spec,
                    sp.surface_treatment or ("گالوانیزه گرم" if item.galvanized else (item.paint_type or "رنگ پودری")),
                    sp.coating_thickness, sp.drawing_number or "DWG-1001", sp.drawing_revision or "Rev A"
                ))
            else:
                conn.execute("""INSERT INTO pole_specifications (
                    order_item_id, pole_type, height, bottom_diameter, top_diameter, sheet_thickness,
                    sides_count, section_count, surface_treatment, drawing_number, drawing_revision
                ) VALUES (?, 'چندضلعی استاندارد', 9.0, 180.0, 80.0, 3.0, 8, 1, ?, 'DWG-1001', 'Rev A')""",
                (iid, "گالوانیزه گرم" if item.galvanized else (item.paint_type or "رنگ پودری")))

            # Auto-generate default Bill of Materials (BOM)
            spec_dict = conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (iid,)).fetchone()
            bom_items = generate_default_bom_items(iid, item.quantity, dict(spec_dict) if spec_dict else {})
            for b in bom_items:
                conn.execute("""
                    INSERT INTO order_item_bom (
                        order_item_id, material_category, material_name, spec,
                        quantity_per_pole, total_quantity, unit, estimated_unit_cost,
                        procurement_status, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    b["order_item_id"], b["material_category"], b["material_name"], b["spec"],
                    b["quantity_per_pole"], b["total_quantity"], b["unit"], b["estimated_unit_cost"],
                    b["procurement_status"], b["notes"]
                ))

        conn.execute("UPDATE customers SET next_order_counter=? WHERE id=?",(counter+1,data.customer_id))
        return {"id":oid,"order_no":order_no,"project_id":project_id}

@app.patch("/api/orders/{order_id}/status")
def update_order_status(order_id:int, data:OrderStatusUpdate):
    status=data.status.upper()
    if status not in {"ACTIVE","COMPLETED","CANCELLED"}:
        raise HTTPException(400,"وضعیت نامعتبر است")
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM orders WHERE id=?",(order_id,)).fetchone():
            raise HTTPException(404,"سفارش یافت نشد")
        conn.execute("UPDATE orders SET status=? WHERE id=?",(status,order_id))
        return {"id":order_id,"status":status}

@app.get("/api/orders/{order_id}")
def order_detail(order_id:int):
    with connect() as conn:
        o=conn.execute("""SELECT o.*, c.name customer_name, p.project_code, p.project_name
                          FROM orders o
                          JOIN customers c ON c.id=o.customer_id
                          LEFT JOIN projects p ON p.id=o.project_id
                          WHERE o.id=?""",(order_id,)).fetchone()
        if not o: raise HTTPException(404,"سفارش یافت نشد")
        out=dict(o); total,paid,balance=order_financials(conn,order_id); out.update(total_amount=total,paid_amount=paid,balance=balance)
        items=[]
        for r in conn.execute("SELECT * FROM order_items WHERE order_id=? ORDER BY id",(order_id,)).fetchall():
            d=dict(r); q,s,rem=item_delivery(conn,d["id"]); d.update(shipped_quantity=s,remaining_quantity=rem)
            stages_raw=[dict(x) for x in conn.execute("SELECT * FROM project_stages WHERE order_item_id=? ORDER BY id",(d["id"],)).fetchall()]
            stages=enrich_stages_with_dependencies(stages_raw)
            spec=conn.execute("SELECT * FROM pole_specifications WHERE order_item_id=?",(d["id"],)).fetchone()
            d["stages"]=stages
            d["pole_spec"]=dict(spec) if spec else None
            last=conn.execute("SELECT * FROM notes WHERE order_item_id=? ORDER BY created_at DESC,id DESC LIMIT 1",(d["id"],)).fetchone()
            d["last_note"]=dict(last) if last else None
            items.append(d)
        out["items"]=items
        return out

@app.patch("/api/stages/{stage_id}")
def update_stage(stage_id: int, data: StageUpdate):
    with connect() as conn:
        existing = conn.execute("SELECT * FROM project_stages WHERE id=?", (stage_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "مرحله یافت نشد")

        fields = []
        values = []

        new_progress = data.progress if data.progress is not None else existing["progress"]
        new_status = data.status

        # If status is not provided, auto-transition based on progress unless it was explicitly BLOCKED
        if new_status is None:
            curr_status = existing["status"]
            if curr_status != "BLOCKED":
                if new_progress >= 100:
                    new_status = "DONE"
                elif new_progress > 0:
                    new_status = "IN_PROGRESS"
                else:
                    new_status = "TODO"
            else:
                new_status = "BLOCKED"
        else:
            if new_status not in {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}:
                raise HTTPException(400, "وضعیت مرحله نامعتبر است")

        fields.append("progress=?")
        values.append(new_progress)
        fields.append("status=?")
        values.append(new_status)

        if data.block_reason is not None:
            fields.append("block_reason=?")
            values.append(data.block_reason.strip() if data.block_reason else None)
        elif new_status != "BLOCKED" and existing["status"] == "BLOCKED":
            fields.append("block_reason=?")
            values.append(None)

        if data.due_date is not None:
            fields.append("due_date=?")
            values.append(data.due_date)
        if data.note is not None:
            fields.append("note=?")
            values.append(data.note.strip() if data.note else None)
        if data.updated_by is not None:
            fields.append("updated_by=?")
            values.append(data.updated_by)
        if data.weight is not None:
            fields.append("weight=?")
            values.append(data.weight)

        fields.append("updated_at=?")
        values.append(now_iso())
        values.append(stage_id)

        conn.execute(f"UPDATE project_stages SET {', '.join(fields)} WHERE id=?", values)

        if new_status == "BLOCKED" and existing["status"] != "BLOCKED":
            record_system_event(
                conn,
                event_type="STAGE",
                severity="WARNING",
                title=f"توقف در مرحله «{existing['stage_name_fa']}»",
                message=f"مرحله با علت «{data.block_reason or 'مانع اعلام‌نشده'}» متوقف گردید.",
                actor=data.updated_by or "سرپرست خط",
                entity_type="project_stages",
                entity_id=stage_id,
                metadata={"stage_key": existing["stage_key"], "order_item_id": existing["order_item_id"]}
            )
        elif new_status == "DONE" and existing["status"] != "DONE":
            record_system_event(
                conn,
                event_type="STAGE",
                severity="SUCCESS",
                title=f"تکمیل مرحله «{existing['stage_name_fa']}»",
                message=f"مرحله با پیشرفت ۱۰۰٪ با موفقیت پایان یافت.",
                actor=data.updated_by or "سرپرست خط",
                entity_type="project_stages",
                entity_id=stage_id,
                metadata={"stage_key": existing["stage_key"], "order_item_id": existing["order_item_id"]}
            )

        updated_row = row_dict(conn.execute("SELECT * FROM project_stages WHERE id=?", (stage_id,)).fetchone())
        # Enrich with dependencies
        all_st = [dict(x) for x in conn.execute("SELECT * FROM project_stages WHERE order_item_id = ? ORDER BY id", (updated_row["order_item_id"],)).fetchall()]
        enriched_list = enrich_stages_with_dependencies(all_st)
        return next((s for s in enriched_list if s["id"] == stage_id), updated_row)

@app.get("/api/notes")
def notes(order_id:int, order_item_id:Optional[int]=None, department:Optional[str]=None):
    where=["order_id=?"]; params=[order_id]
    if order_item_id is not None: where.append("order_item_id=?"); params.append(order_item_id)
    if department: where.append("department=?"); params.append(department.upper())
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM notes WHERE "+" AND ".join(where)+" ORDER BY created_at DESC,id DESC",params).fetchall()]

@app.post("/api/notes")
def add_note(data:NoteIn):
    dep=data.department.upper()
    if dep not in {"PURCHASE","PRODUCTION","GENERAL"}: raise HTTPException(400,"واحد نامعتبر است")
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM orders WHERE id=?",(data.order_id,)).fetchone(): raise HTTPException(404,"سفارش یافت نشد")
        if data.order_item_id and not conn.execute("SELECT 1 FROM order_items WHERE id=? AND order_id=?",(data.order_item_id,data.order_id)).fetchone(): raise HTTPException(400,"محصول متعلق به این سفارش نیست")
        cur=conn.execute("INSERT INTO notes(order_id,order_item_id,department,body,author,created_at) VALUES(?,?,?,?,?,?)",(data.order_id,data.order_item_id,dep,data.body.strip(),data.author,now_iso()))
        return row_dict(conn.execute("SELECT * FROM notes WHERE id=?",(cur.lastrowid,)).fetchone())

@app.get("/api/tasks")
def tasks(order_id: Optional[int]=None, department: Optional[str]=None):
    where=[]; params=[]
    if order_id: where.append("t.order_id=?"); params.append(order_id)
    if department: where.append("t.department=?"); params.append(department.upper())
    sql="""SELECT t.*,o.order_no,c.name customer_name,oi.product_name
            FROM department_tasks t JOIN orders o ON o.id=t.order_id
            JOIN customers c ON c.id=o.customer_id LEFT JOIN order_items oi ON oi.id=t.order_item_id"""
    if where: sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY CASE t.status WHEN 'BLOCKED' THEN 0 WHEN 'TODO' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, t.due_date IS NULL, t.due_date, t.id DESC"
    with connect() as conn: return [dict(r) for r in conn.execute(sql,params).fetchall()]

@app.post("/api/tasks")
def add_task(data: TaskIn):
    dep=data.department.upper()
    if dep not in {"PURCHASE","PRODUCTION"}: raise HTTPException(400,"واحد نامعتبر است")
    if data.status not in {"TODO","IN_PROGRESS","DONE","BLOCKED"}: raise HTTPException(400,"وضعیت نامعتبر است")
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM orders WHERE id=?",(data.order_id,)).fetchone(): raise HTTPException(404,"سفارش یافت نشد")
        if data.order_item_id and not conn.execute("SELECT 1 FROM order_items WHERE id=? AND order_id=?",(data.order_item_id,data.order_id)).fetchone(): raise HTTPException(400,"محصول متعلق به این سفارش نیست")
        cur=conn.execute("INSERT INTO department_tasks(order_id,order_item_id,department,title,description,assignee,status,due_date,reminder_date,block_reason) VALUES(?,?,?,?,?,?,?,?,?,?)",(data.order_id,data.order_item_id,dep,data.title.strip(),data.description,data.assignee,data.status,data.due_date,data.reminder_date,data.block_reason))
        return row_dict(conn.execute("SELECT * FROM department_tasks WHERE id=?",(cur.lastrowid,)).fetchone())

@app.patch("/api/tasks/{task_id}")
def update_task(task_id:int,data:TaskUpdate):
    fields=[]; values=[]
    for key in ["title","description","assignee","status","due_date","reminder_date","block_reason"]:
        value=getattr(data,key)
        if value is not None: fields.append(f"{key}=?"); values.append(value.strip() if key in {"title","block_reason"} else value)
    if data.status is not None and data.status not in {"TODO","IN_PROGRESS","DONE","BLOCKED"}: raise HTTPException(400,"وضعیت نامعتبر است")
    if not fields: raise HTTPException(400,"تغییری ارسال نشده است")
    fields.append("updated_at=?"); values.append(now_iso()); values.append(task_id)
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM department_tasks WHERE id=?",(task_id,)).fetchone(): raise HTTPException(404,"فعالیت یافت نشد")
        conn.execute(f"UPDATE department_tasks SET {','.join(fields)} WHERE id=?",values)
        return row_dict(conn.execute("SELECT * FROM department_tasks WHERE id=?",(task_id,)).fetchone())

@app.get("/api/payments")
def payments(order_id:Optional[int]=None):
    sql="""SELECT p.*,o.order_no,c.name customer_name FROM payments p JOIN orders o ON o.id=p.order_id JOIN customers c ON c.id=o.customer_id"""; params=[]
    if order_id: sql+=" WHERE p.order_id=?"; params=[order_id]
    sql+=" ORDER BY p.payment_date DESC,p.id DESC"
    with connect() as conn: return [dict(r) for r in conn.execute(sql,params).fetchall()]

@app.post("/api/payments")
def add_payment(data:PaymentIn):
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM orders WHERE id=?",(data.order_id,)).fetchone(): raise HTTPException(404,"سفارش یافت نشد")
        n=conn.execute("SELECT COALESCE(MAX(id),0)+1 n FROM payments").fetchone()["n"]
        code=f"P{n:06d}"
        cur=conn.execute("""INSERT INTO payments(payment_code,order_id,payment_type,amount,payment_date,description,registered_by)
            VALUES(?,?,?,?,?,?,?)""",(code,data.order_id,data.payment_type,data.amount,data.payment_date,data.description,data.registered_by))
        pid = cur.lastrowid
        _,_,balance=order_financials(conn,data.order_id)
        if balance <= 0:
            conn.execute("UPDATE management_alerts SET active=0 WHERE order_id=? AND alert_type='DEBT_SHIPMENT'",(data.order_id,))

        ord_row = conn.execute("SELECT o.order_no, c.name AS customer_name FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?", (data.order_id,)).fetchone()
        ord_no = ord_row["order_no"] if ord_row else str(data.order_id)
        record_system_event(
            conn,
            event_type="PAYMENT",
            severity="SUCCESS",
            title=f"واریزی جدید {code} (سفارش {ord_no})",
            message=f"مبلغ {data.amount:,.0f} ریال دریافت شد ({data.payment_type}). مانده حساب سفارش: {balance:,.0f} ریال.",
            actor=data.registered_by or "امور مالی",
            entity_type="payments",
            entity_id=pid,
            metadata={"order_id": data.order_id, "amount": data.amount, "balance": balance, "code": code}
        )

        return row_dict(conn.execute("SELECT * FROM payments WHERE id=?",(pid,)).fetchone())

@app.get("/api/shipments")
def shipments(order_id:Optional[int]=None):
    sql="""SELECT s.*,o.order_no,c.name customer_name,i.product_name FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id JOIN order_items i ON i.id=s.order_item_id"""; params=[]
    if order_id: sql+=" WHERE s.order_id=?"; params=[order_id]
    sql+=" ORDER BY s.shipment_date DESC,s.id DESC"
    with connect() as conn:return [dict(r) for r in conn.execute(sql,params).fetchall()]

@app.post("/api/shipments")
def add_shipment(data:ShipmentIn):
    with connect() as conn:
        item=conn.execute("SELECT i.*,o.customer_id,o.order_no,c.name customer_name FROM order_items i JOIN orders o ON o.id=i.order_id JOIN customers c ON c.id=o.customer_id WHERE i.id=? AND i.order_id=?",(data.order_item_id,data.order_id)).fetchone()
        if not item: raise HTTPException(400,"محصول یا سفارش نامعتبر است")
        ordered,shipped,remaining=item_delivery(conn,data.order_item_id)
        if data.quantity > remaining + 1e-9: raise HTTPException(400,f"تعداد ارسال بیشتر از مانده است. مانده: {remaining:g}")
        _,_,debt=order_financials(conn,data.order_id)
        if debt>0 and not data.override_debt:
            raise HTTPException(status_code=409,detail={"code":"DEBT_CONFIRM_REQUIRED","message":"مشتری بدهی دارد. برای ادامه تایید مدیر لازم است.","debt":debt})
        n=conn.execute("SELECT COALESCE(MAX(id),0)+1 n FROM shipments").fetchone()["n"]
        code=f"D{n:06d}"
        cur=conn.execute("""INSERT INTO shipments(shipment_code,order_id,order_item_id,shipment_date,quantity,destination,carrier,waybill,receiver,delivery_status,description,registered_by,debt_at_shipment,debt_override)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(code,data.order_id,data.order_item_id,data.shipment_date,data.quantity,data.destination,data.carrier,data.waybill,data.receiver,data.delivery_status,data.description,data.registered_by,debt,int(debt>0 and data.override_debt)))
        sid=cur.lastrowid
        if debt>0 and data.override_debt:
            new_shipped=shipped+data.quantity
            msg=f"مشتری {item['customer_name']} در سفارش {item['order_no']} هنگام ارسال {data.quantity:g} واحد، {debt:,.0f} بدهی داشته است. مجموع ارسال این محصول {new_shipped:g} از {ordered:g} است."
            conn.execute("INSERT INTO management_alerts(alert_type,customer_id,order_id,shipment_id,message,amount,active) VALUES('DEBT_SHIPMENT',?,?,?,?,?,1)",(item["customer_id"],data.order_id,sid,msg,debt))

        record_system_event(
            conn,
            event_type="SHIPMENT",
            severity="WARNING" if (debt > 0 and data.override_debt) else "INFO",
            title=f"ارسال محموله {code} (سفارش {item['order_no']})",
            message=f"تعداد {data.quantity:g} عدد از محصول {item['product_name']} به مقصد {data.destination or 'نامشخص'} بارگیری شد." + (f" (با تایید خروج بدهی {debt:,.0f} ریال)" if (debt > 0 and data.override_debt) else ""),
            actor=data.registered_by or "انبار و بارگیری",
            entity_type="shipments",
            entity_id=sid,
            metadata={"order_id": data.order_id, "order_item_id": data.order_item_id, "quantity": data.quantity, "debt": debt}
        )

        return row_dict(conn.execute("SELECT * FROM shipments WHERE id=?",(sid,)).fetchone())

@app.get("/api/dashboard")
def dashboard(customer_id:Optional[int]=None):
    with connect() as conn:
        filters="WHERE o.status='ACTIVE'"; params=[]
        if customer_id: filters+=" AND o.customer_id=?"; params.append(customer_id)
        if customer_id:
            active_customers=conn.execute("SELECT COUNT(DISTINCT customer_id) n FROM orders WHERE status='ACTIVE' AND customer_id=?",(customer_id,)).fetchone()["n"]
            active_orders=conn.execute("SELECT COUNT(*) n FROM orders WHERE status='ACTIVE' AND customer_id=?",(customer_id,)).fetchone()["n"]
        else:
            active_customers=conn.execute("SELECT COUNT(DISTINCT customer_id) n FROM orders WHERE status='ACTIVE'").fetchone()["n"]
            active_orders=conn.execute("SELECT COUNT(*) n FROM orders WHERE status='ACTIVE'").fetchone()["n"]
        projects=[]; total_unsent=0; total_unpaid=0
        orders=conn.execute(f"SELECT o.*,c.name customer_name FROM orders o JOIN customers c ON c.id=o.customer_id {filters} ORDER BY o.order_date ASC,o.id ASC",params).fetchall()
        blockers = []
        for o in orders:
            od=dict(o); total,paid,balance=order_financials(conn,od["id"]); total_unpaid+=balance
            items=[]
            for ir in conn.execute("SELECT * FROM order_items WHERE order_id=? ORDER BY id",(od["id"],)).fetchall():
                i=dict(ir); q,s,rem=item_delivery(conn,i["id"]); total_unsent+=rem
                stages=[dict(x) for x in conn.execute("SELECT * FROM project_stages WHERE order_item_id=? ORDER BY id",(i["id"],)).fetchall()]
                progressed=[x for x in stages if x["progress"]>0]
                current=(progressed[-1]["stage_name_fa"] if progressed else stages[0]["stage_name_fa"] if stages else "-")
                last=conn.execute("SELECT * FROM notes WHERE order_item_id=? OR (order_id=? AND order_item_id IS NULL) ORDER BY created_at DESC,id DESC LIMIT 1",(i["id"],od["id"])).fetchone()
                item_progress = calc_weighted_progress(stages)
                item_blocked = any(x.get("status") == "BLOCKED" for x in stages)
                for st in stages:
                    if st.get("status") == "BLOCKED":
                        blockers.append({
                            "kind": "stage",
                            "order_id": od["id"],
                            "order_no": od["order_no"],
                            "customer_name": od["customer_name"],
                            "product_name": i["product_name"],
                            "title": f"توقف مرحله {st['stage_name_fa']}",
                            "stage_name_fa": st["stage_name_fa"],
                            "block_reason": st.get("block_reason") or "بدون توضیح مانع",
                            "due_date": st.get("due_date"),
                        })
                i.update(
                    shipped_quantity=s,
                    remaining_quantity=rem,
                    current_stage=current,
                    stages=stages,
                    progress=item_progress,
                    is_blocked=item_blocked,
                    last_note=dict(last) if last else None
                )
                items.append(i)
            od.update(total_amount=total,paid_amount=paid,balance=balance,items=items)
            projects.append(od)
        alerts=[dict(r) for r in conn.execute("SELECT a.*,o.order_no,c.name customer_name FROM management_alerts a LEFT JOIN orders o ON o.id=a.order_id LEFT JOIN customers c ON c.id=a.customer_id WHERE a.active=1 ORDER BY a.created_at DESC,a.id DESC").fetchall()]
        task_where=["t.status!='DONE'","o.status='ACTIVE'"]; task_params=[]
        if customer_id: task_where.append("o.customer_id=?"); task_params.append(customer_id)
        operation_tasks=[dict(r) for r in conn.execute("""SELECT t.*,o.order_no,c.name customer_name,oi.product_name
            FROM department_tasks t JOIN orders o ON o.id=t.order_id JOIN customers c ON c.id=o.customer_id
            LEFT JOIN order_items oi ON oi.id=t.order_item_id WHERE """+" AND ".join(task_where)+"""
            ORDER BY CASE t.status WHEN 'BLOCKED' THEN 0 ELSE 1 END,
            CASE WHEN t.due_date IS NOT NULL THEN t.due_date ELSE '9999-12-31' END,
            CASE WHEN t.reminder_date IS NOT NULL THEN t.reminder_date ELSE '9999-12-31' END,t.id DESC LIMIT 16""",task_params).fetchall()]
        for task in operation_tasks:
            if task.get("status") == "BLOCKED":
                blockers.append({
                    "kind": "task",
                    "order_id": task["order_id"],
                    "order_no": task["order_no"],
                    "customer_name": task["customer_name"],
                    "product_name": task.get("product_name"),
                    "title": f"فعالیت متوقف {task.get('title')}",
                    "stage_name_fa": "واحد " + ("خرید" if task.get("department") == "PURCHASE" else "تولید"),
                    "block_reason": task.get("block_reason") or "بدون توضیح مانع",
                    "due_date": task.get("due_date"),
                })

        open_ncrs = [dict(r) for r in conn.execute("""
            SELECT n.*, o.id AS order_id, o.order_no, c.name AS customer_name, oi.product_name
            FROM ncr_reports n
            JOIN order_items oi ON oi.id = n.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            WHERE n.status IN ('OPEN', 'IN_REWORK')
            ORDER BY CASE n.severity WHEN 'CRITICAL' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, n.id DESC
        """).fetchall()]

        for ncr in open_ncrs:
            blockers.append({
                "kind": "ncr",
                "ncr_id": ncr["id"],
                "ncr_number": ncr["ncr_number"],
                "order_id": ncr["order_id"],
                "order_no": ncr["order_no"],
                "customer_name": ncr["customer_name"],
                "product_name": ncr["product_name"],
                "title": f"عدم انطباق کیفی {ncr['ncr_number']}: {ncr['defect_title']}",
                "stage_name_fa": "واحد QC (" + ("بحرانی" if ncr["severity"] == "CRITICAL" else "متوسط") + ")",
                "block_reason": ncr.get("description") or ncr.get("defect_title"),
                "severity": ncr["severity"],
                "status": ncr["status"],
                "due_date": None,
            })

        return {
            "metrics": {
                "active_customers": active_customers,
                "active_orders": active_orders,
                "remaining_to_ship": total_unsent,
                "unpaid_balance": total_unpaid,
                "blocked_count": len(blockers),
                "open_ncrs_count": len(open_ncrs),
            },
            "projects": projects,
            "alerts": alerts,
            "operation_tasks": operation_tasks,
            "blockers": blockers,
        }


# ================= QC & NCR API ENDPOINTS =================

@app.get("/api/qc/inspections")
def list_qc_inspections(
    order_item_id: Optional[int] = None,
    order_id: Optional[int] = None,
    gate_type: Optional[str] = None,
    result: Optional[str] = None
):
    with connect() as conn:
        where = []
        params = []
        if order_item_id:
            where.append("qi.order_item_id = ?")
            params.append(order_item_id)
        if order_id:
            where.append("oi.order_id = ?")
            params.append(order_id)
        if gate_type:
            where.append("qi.gate_type = ?")
            params.append(gate_type)
        if result:
            where.append("qi.result = ?")
            params.append(result)

        where_clause = ("WHERE " + " AND ".join(where)) if where else ""
        query = f"""
            SELECT qi.*,
                   oi.order_id, oi.product_name, oi.quantity,
                   o.order_no, c.name AS customer_name, p.project_name, p.project_code,
                   ps.height, ps.sheet_thickness, ps.pole_type
            FROM qc_inspections qi
            JOIN order_items oi ON oi.id = qi.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            LEFT JOIN projects p ON p.id = o.project_id
            LEFT JOIN pole_specifications ps ON ps.order_item_id = oi.id
            {where_clause}
            ORDER BY qi.inspection_date DESC, qi.id DESC
        """
        rows = [dict(r) for r in conn.execute(query, params).fetchall()]
        for r in rows:
            if r.get("measured_values") and isinstance(r["measured_values"], str):
                try:
                    r["parsed_measured_values"] = json.loads(r["measured_values"])
                except Exception:
                    r["parsed_measured_values"] = {}
            else:
                r["parsed_measured_values"] = r.get("measured_values") or {}

            if r.get("check_items") and isinstance(r["check_items"], str):
                try:
                    r["parsed_check_items"] = json.loads(r["check_items"])
                except Exception:
                    r["parsed_check_items"] = {}
            else:
                r["parsed_check_items"] = r.get("check_items") or {}
        return rows


@app.post("/api/qc/inspections")
def create_qc_inspection(body: QCInspectionIn):
    with connect() as conn:
        item = conn.execute("SELECT id, order_id, product_name FROM order_items WHERE id = ?", (body.order_item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "آیتم محصول یافت نشد")

        measured_json = json.dumps(body.measured_values, ensure_ascii=False) if isinstance(body.measured_values, dict) else (body.measured_values or "{}")
        check_json = json.dumps(body.check_items, ensure_ascii=False) if isinstance(body.check_items, dict) else (body.check_items or "{}")
        insp_date = body.inspection_date or now_iso()[:10]

        cur = conn.execute("""
            INSERT INTO qc_inspections (
                order_item_id, gate_type, inspector_name, inspection_date,
                result, measured_values, check_items, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            body.order_item_id, body.gate_type, body.inspector_name,
            insp_date, body.result, measured_json, check_json, body.remarks
        ))
        insp_id = cur.lastrowid

        if body.result == 'FAILED':
            conn.execute("""
                INSERT INTO management_alerts (alert_type, customer_id, order_id, message)
                SELECT 'QC_DEFECT', o.customer_id, o.id, ?
                FROM orders o JOIN order_items oi ON oi.order_id = o.id
                WHERE oi.id = ?
            """, (f"مردودی در بازرسی کنترل کیفیت ({body.gate_type}) برای محصول {item['product_name']}", body.order_item_id))

        qc_sev = "SUCCESS" if body.result == 'PASSED' else ("CRITICAL" if body.result == 'FAILED' else "WARNING")
        gate_names = {
            "INCOMING_FORMING": "برش و شکل‌دهی ورق",
            "WELDING": "جوشکاری سازه و بیس‌پلیت",
            "COATING": "پوشش گالوانیزه/رنگ",
            "FINAL_ASSEMBLY": "مونتاژ نهایی و اتصالات"
        }
        g_title = gate_names.get(body.gate_type, body.gate_type)
        record_system_event(
            conn,
            event_type="QC",
            severity=qc_sev,
            title=f"بازرسی کیفی: گیت {g_title} ({body.result})",
            message=f"محصول: {item['product_name']}. بازرس: {body.inspector_name}. نتیجه: {body.result}." + (f" یادداشت: {body.remarks}" if body.remarks else ""),
            actor=body.inspector_name or "واحد QC",
            entity_type="qc_inspections",
            entity_id=insp_id,
            metadata={"order_item_id": body.order_item_id, "gate_type": body.gate_type, "result": body.result}
        )

        rec = dict(conn.execute("SELECT * FROM qc_inspections WHERE id = ?", (insp_id,)).fetchone())
        return rec


@app.get("/api/qc/ncrs")
def list_ncrs(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    order_item_id: Optional[int] = None,
    order_id: Optional[int] = None
):
    with connect() as conn:
        where = []
        params = []
        if status:
            where.append("n.status = ?")
            params.append(status)
        if severity:
            where.append("n.severity = ?")
            params.append(severity)
        if order_item_id:
            where.append("n.order_item_id = ?")
            params.append(order_item_id)
        if order_id:
            where.append("oi.order_id = ?")
            params.append(order_id)

        where_clause = ("WHERE " + " AND ".join(where)) if where else ""
        query = f"""
            SELECT n.*,
                   oi.order_id, oi.product_name, oi.quantity,
                   o.order_no, c.name AS customer_name, p.project_name, p.project_code,
                   ps.height, ps.sheet_thickness, ps.pole_type
            FROM ncr_reports n
            JOIN order_items oi ON oi.id = n.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            LEFT JOIN projects p ON p.id = o.project_id
            LEFT JOIN pole_specifications ps ON ps.order_item_id = oi.id
            {where_clause}
            ORDER BY CASE n.status WHEN 'OPEN' THEN 0 WHEN 'IN_REWORK' THEN 1 ELSE 2 END,
                     CASE n.severity WHEN 'CRITICAL' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                     n.id DESC
        """
        return [dict(r) for r in conn.execute(query, params).fetchall()]


@app.post("/api/qc/ncrs")
def create_ncr(body: NCRIn):
    with connect() as conn:
        item = conn.execute("SELECT id, order_id, product_name FROM order_items WHERE id = ?", (body.order_item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "آیتم محصول یافت نشد")

        count = conn.execute("SELECT COUNT(*) c FROM ncr_reports").fetchone()["c"] + 1
        ncr_num = f"NCR-1405-{count:03d}"
        while conn.execute("SELECT 1 FROM ncr_reports WHERE ncr_number = ?", (ncr_num,)).fetchone():
            count += 1
            ncr_num = f"NCR-1405-{count:03d}"

        cur = conn.execute("""
            INSERT INTO ncr_reports (
                ncr_number, order_item_id, qc_inspection_id, defect_title,
                defect_type, severity, description, root_cause,
                disposition, disposition_notes, disposition_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ncr_num, body.order_item_id, body.qc_inspection_id, body.defect_title,
            body.defect_type, body.severity, body.description, body.root_cause,
            body.disposition or 'PENDING', body.disposition_notes, body.disposition_by,
            body.status or 'OPEN'
        ))
        ncr_id = cur.lastrowid

        if body.severity in ('MEDIUM', 'CRITICAL') or body.status in ('OPEN', 'IN_REWORK'):
            conn.execute("""
                UPDATE project_stages
                SET status = 'BLOCKED',
                    block_reason = ?,
                    updated_at = datetime('now')
                WHERE order_item_id = ? AND stage_key = 'QC'
            """, (f"توقف کیفی: عدم انطباق {ncr_num} ({body.defect_title})", body.order_item_id))

        conn.execute("""
            INSERT INTO management_alerts (alert_type, customer_id, order_id, message)
            SELECT 'NCR_OPEN', o.customer_id, o.id, ?
            FROM orders o JOIN order_items oi ON oi.order_id = o.id
            WHERE oi.id = ?
        """, (f"گزارش عدم انطباق {ncr_num} ({body.defect_title}) برای محصول {item['product_name']}", body.order_item_id))

        ncr_sev = "CRITICAL" if body.severity == 'CRITICAL' else "WARNING"
        record_system_event(
            conn,
            event_type="NCR",
            severity=ncr_sev,
            title=f"عدم انطباق {ncr_num}: {body.defect_title}",
            message=f"محصول: {item['product_name']} | نوع نقص: {body.defect_type} | شدت: {body.severity}. مرحله QC مسدود گردید.",
            actor=body.disposition_by or "واحد QC",
            entity_type="ncr_reports",
            entity_id=ncr_id,
            metadata={"ncr_number": ncr_num, "order_item_id": body.order_item_id, "severity": body.severity}
        )

        return dict(conn.execute("SELECT * FROM ncr_reports WHERE id = ?", (ncr_id,)).fetchone())


@app.get("/api/qc/ncrs/{ncr_id}")
def get_ncr(ncr_id: int):
    with connect() as conn:
        row = conn.execute("""
            SELECT n.*,
                   oi.order_id, oi.product_name, oi.quantity,
                   o.order_no, c.name AS customer_name, p.project_name, p.project_code,
                   ps.height, ps.sheet_thickness, ps.pole_type
            FROM ncr_reports n
            JOIN order_items oi ON oi.id = n.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            LEFT JOIN projects p ON p.id = o.project_id
            LEFT JOIN pole_specifications ps ON ps.order_item_id = oi.id
            WHERE n.id = ?
        """, (ncr_id,)).fetchone()
        if not row:
            raise HTTPException(404, "گزارش عدم انطباق یافت نشد")
        return dict(row)


@app.patch("/api/qc/ncrs/{ncr_id}")
def update_ncr(ncr_id: int, body: NCRUpdate):
    with connect() as conn:
        existing = conn.execute("SELECT * FROM ncr_reports WHERE id = ?", (ncr_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "گزارش عدم انطباق یافت نشد")

        updates = []
        params = []
        payload = body.model_dump(exclude_unset=True)

        for k, v in payload.items():
            updates.append(f"{k} = ?")
            params.append(v)

        if payload.get("status") in ('RESOLVED', 'CLOSED') and not existing["resolved_at"]:
            updates.append("resolved_at = datetime('now')")

        if updates:
            params.append(ncr_id)
            conn.execute(f"UPDATE ncr_reports SET {', '.join(updates)} WHERE id = ?", params)

        updated = dict(conn.execute("SELECT * FROM ncr_reports WHERE id = ?", (ncr_id,)).fetchone())

        item_id = updated["order_item_id"]
        if updated.get("status") in ('RESOLVED', 'CLOSED'):
            still_open = conn.execute("""
                SELECT COUNT(*) c FROM ncr_reports
                WHERE order_item_id = ? AND status IN ('OPEN', 'IN_REWORK') AND id != ?
            """, (item_id, ncr_id)).fetchone()["c"]
            if still_open == 0:
                conn.execute("""
                    UPDATE project_stages
                    SET status = 'IN_PROGRESS',
                        block_reason = NULL,
                        updated_at = datetime('now')
                    WHERE order_item_id = ? AND stage_key = 'QC' AND status = 'BLOCKED' AND block_reason LIKE '%عدم انطباق%'
                """, (item_id,))

        if updated.get("status") in ('RESOLVED', 'CLOSED') and existing["status"] not in ('RESOLVED', 'CLOSED'):
            record_system_event(
                conn,
                event_type="NCR",
                severity="SUCCESS",
                title=f"رفع و تعیین‌تکلیف عدم انطباق {updated['ncr_number']}",
                message=f"تصمیم اصلاحی: {updated.get('disposition') or 'تعیین‌شده'}. وضعیت جدید: {updated.get('status')}." + (f" یادداشت: {updated.get('disposition_notes')}" if updated.get('disposition_notes') else ""),
                actor=updated.get("disposition_by") or "واحد QC",
                entity_type="ncr_reports",
                entity_id=ncr_id,
                metadata={"ncr_number": updated["ncr_number"], "status": updated["status"], "disposition": updated.get("disposition")}
            )

        return updated


@app.get("/api/qc/summary")
def get_qc_summary():
    with connect() as conn:
        total_insp = conn.execute("SELECT COUNT(*) c FROM qc_inspections").fetchone()["c"]
        passed_insp = conn.execute("SELECT COUNT(*) c FROM qc_inspections WHERE result = 'PASSED'").fetchone()["c"]
        failed_insp = conn.execute("SELECT COUNT(*) c FROM qc_inspections WHERE result = 'FAILED'").fetchone()["c"]
        
        open_ncrs = conn.execute("SELECT COUNT(*) c FROM ncr_reports WHERE status = 'OPEN'").fetchone()["c"]
        rework_ncrs = conn.execute("SELECT COUNT(*) c FROM ncr_reports WHERE status = 'IN_REWORK'").fetchone()["c"]
        resolved_ncrs = conn.execute("SELECT COUNT(*) c FROM ncr_reports WHERE status IN ('RESOLVED', 'CLOSED')").fetchone()["c"]
        critical_ncrs = conn.execute("SELECT COUNT(*) c FROM ncr_reports WHERE severity = 'CRITICAL' AND status IN ('OPEN', 'IN_REWORK')").fetchone()["c"]

        gate_rows = conn.execute("""
            SELECT gate_type, result, COUNT(*) cnt
            FROM qc_inspections
            GROUP BY gate_type, result
        """).fetchall()
        gates = {}
        for gr in gate_rows:
            gt = gr["gate_type"]
            if gt not in gates:
                gates[gt] = {"PASSED": 0, "FAILED": 0, "CONDITIONAL": 0, "total": 0}
            gates[gt][gr["result"]] = gr["cnt"]
            gates[gt]["total"] += gr["cnt"]

        return {
            "total_inspections": total_insp,
            "passed_inspections": passed_insp,
            "failed_inspections": failed_insp,
            "open_ncrs": open_ncrs,
            "in_rework_ncrs": rework_ncrs,
            "resolved_ncrs": resolved_ncrs,
            "critical_ncrs": critical_ncrs,
            "gates": gates
        }


# ================= BOM & MATERIALS API ENDPOINTS =================

@app.get("/api/items/{item_id}/bom")
def get_item_bom(item_id: int):
    with connect() as conn:
        item = conn.execute("SELECT id, order_id, product_name, quantity FROM order_items WHERE id = ?", (item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "آیتم محصول یافت نشد")

        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM order_item_bom WHERE order_item_id = ? ORDER BY id ASC",
            (item_id,)
        ).fetchall()]

        spec = conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (item_id,)).fetchone()

        steel_categories = {'BODY_SHEET', 'BASE_PLATE', 'GUSSET', 'BRACKET_PIPE'}
        steel_weight_per_pole = sum(r["quantity_per_pole"] for r in rows if r["material_category"] in steel_categories)
        total_steel_weight = sum(r["total_quantity"] for r in rows if r["material_category"] in steel_categories)
        total_cost = sum((r["total_quantity"] or 0) * (r["estimated_unit_cost"] or 0) for r in rows)

        status_counts = {"IN_STOCK": 0, "PURCHASE_REQUIRED": 0, "ORDERED": 0, "RECEIVED": 0}
        for r in rows:
            st = r["procurement_status"]
            if st in status_counts:
                status_counts[st] += 1

        has_shortage = status_counts["PURCHASE_REQUIRED"] > 0

        return {
            "order_item_id": item_id,
            "product_name": item["product_name"],
            "item_quantity": item["quantity"],
            "pole_spec": dict(spec) if spec else None,
            "items": rows,
            "summary": {
                "items_count": len(rows),
                "steel_weight_per_pole_kg": round(steel_weight_per_pole, 1),
                "total_steel_weight_order_kg": round(total_steel_weight, 1),
                "total_estimated_cost": round(total_cost, 0),
                "status_counts": status_counts,
                "has_shortage": has_shortage
            }
        }


@app.post("/api/items/{item_id}/bom")
def add_bom_item(item_id: int, body: BOMItemIn):
    with connect() as conn:
        item = conn.execute("SELECT id, order_id, product_name, quantity FROM order_items WHERE id = ?", (item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "آیتم محصول یافت نشد")

        total_q = body.total_quantity
        if total_q is None:
            total_q = round(body.quantity_per_pole * float(item["quantity"]), 1)

        cur = conn.execute("""
            INSERT INTO order_item_bom (
                order_item_id, material_category, material_name, spec,
                quantity_per_pole, total_quantity, unit, estimated_unit_cost,
                procurement_status, supplier_name, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item_id, body.material_category, body.material_name, body.spec,
            body.quantity_per_pole, total_q, body.unit, body.estimated_unit_cost or 0.0,
            body.procurement_status or 'IN_STOCK', body.supplier_name, body.notes
        ))
        bom_id = cur.lastrowid
        return dict(conn.execute("SELECT * FROM order_item_bom WHERE id = ?", (bom_id,)).fetchone())


@app.post("/api/items/{item_id}/bom/generate")
def generate_bom(item_id: int):
    with connect() as conn:
        item = conn.execute("SELECT id, order_id, product_name, quantity FROM order_items WHERE id = ?", (item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "آیتم محصول یافت نشد")

        spec = conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (item_id,)).fetchone()
        spec_dict = dict(spec) if spec else {}

        conn.execute("DELETE FROM order_item_bom WHERE order_item_id = ?", (item_id,))
        bom_items = generate_default_bom_items(item_id, item["quantity"], spec_dict)
        for b in bom_items:
            conn.execute("""
                INSERT INTO order_item_bom (
                    order_item_id, material_category, material_name, spec,
                    quantity_per_pole, total_quantity, unit, estimated_unit_cost,
                    procurement_status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                b["order_item_id"], b["material_category"], b["material_name"], b["spec"],
                b["quantity_per_pole"], b["total_quantity"], b["unit"], b["estimated_unit_cost"],
                b["procurement_status"], b["notes"]
            ))

    return get_item_bom(item_id)


@app.patch("/api/bom/{bom_id}")
def update_bom_item(bom_id: int, body: BOMItemUpdate):
    with connect() as conn:
        existing = conn.execute("SELECT * FROM order_item_bom WHERE id = ?", (bom_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "قلم متریال یافت نشد")

        updates = []
        params = []
        payload = body.model_dump(exclude_unset=True)
        for k, v in payload.items():
            updates.append(f"{k} = ?")
            params.append(v)

        if updates:
            updates.append("updated_at = datetime('now')")
            params.append(bom_id)
            conn.execute(f"UPDATE order_item_bom SET {', '.join(updates)} WHERE id = ?", params)

        return dict(conn.execute("SELECT * FROM order_item_bom WHERE id = ?", (bom_id,)).fetchone())


@app.delete("/api/bom/{bom_id}")
def delete_bom_item(bom_id: int):
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM order_item_bom WHERE id = ?", (bom_id,)).fetchone():
            raise HTTPException(404, "قلم متریال یافت نشد")
        conn.execute("DELETE FROM order_item_bom WHERE id = ?", (bom_id,))
        return {"ok": True, "deleted_id": bom_id}


@app.get("/api/procurement/materials-summary")
def get_materials_summary():
    with connect() as conn:
        rows = conn.execute("""
            SELECT b.material_category, b.material_name, b.unit,
                   b.procurement_status,
                   SUM(b.total_quantity) AS total_qty,
                   COUNT(b.id) AS occurrences,
                   SUM(b.total_quantity * b.estimated_unit_cost) AS total_estimated_cost
            FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'ACTIVE'
            GROUP BY b.material_category, b.material_name, b.unit, b.procurement_status
            ORDER BY b.material_category, b.material_name
        """).fetchall()

        summary_by_cat = {}
        for r in rows:
            cat = r["material_category"]
            if cat not in summary_by_cat:
                summary_by_cat[cat] = []
            summary_by_cat[cat].append(dict(r))

        shortage_items = [dict(r) for r in conn.execute("""
            SELECT b.*, oi.product_name, o.order_no, c.name AS customer_name
            FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            WHERE b.procurement_status = 'PURCHASE_REQUIRED' AND o.status = 'ACTIVE'
            ORDER BY b.id DESC
        """).fetchall()]

        return {
            "by_category": summary_by_cat,
            "shortage_items": shortage_items,
            "shortage_count": len(shortage_items)
        }


# =========================================================
# STEP 6: FACTORY CONTROL TOWER & SYSTEM EVENTS LOG
# =========================================================

@app.get("/api/control-tower/summary")
def get_control_tower_summary():
    """
    Control Tower Executive 4-Pillars Summary:
    1. Schedule & Bottlenecks (On-track, At-risk, Delayed, Blocked stages)
    2. Quality & Compliance (Inspections, First Pass Yield, Open/Critical NCRs)
    3. Materials & Steel (BOM Tonnage, Shortages, Purchase Pipeline)
    4. Finance & Shipping (Contract Value, Collections, Debt Shipping Alerts)
    Plus recent auditable system events.
    """
    with connect() as conn:
        # 1. Schedule Pillar
        prjs = conn.execute("SELECT * FROM projects WHERE status != 'COMPLETED' AND status != 'CANCELLED'").fetchall()
        on_track, at_risk, delayed = 0, 0, 0
        attention_projects = []
        for p in prjs:
            pid = p["id"]
            base = conn.execute("SELECT * FROM project_baselines WHERE project_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1", (pid,)).fetchone()
            b_finish = base["planned_finish"] if base else p["committed_delivery_date"]
            sv = calc_schedule_variance(b_finish, p["forecast_finish"] or p["committed_delivery_date"], p["actual_finish"])
            if sv["status"] == "ON_TRACK":
                on_track += 1
            elif sv["status"] == "AT_RISK":
                at_risk += 1
            else:
                delayed += 1

            if sv["is_delayed"] or p["status"] == "BLOCKED":
                attention_projects.append({
                    "id": pid,
                    "project_code": p["project_code"],
                    "project_name": p["project_name"],
                    "status": p["status"],
                    "variance_days": sv["variance_days"],
                    "schedule_status": sv["status"],
                    "schedule_status_label": sv["status_label"],
                })

        blocked_stages_count = conn.execute("SELECT COUNT(*) c FROM project_stages WHERE status = 'BLOCKED'").fetchone()["c"]

        # 2. Quality Pillar
        total_insp = conn.execute("SELECT COUNT(*) c FROM qc_inspections").fetchone()["c"]
        passed_insp = conn.execute("SELECT COUNT(*) c FROM qc_inspections WHERE result = 'PASSED'").fetchone()["c"]
        open_ncrs = conn.execute("SELECT COUNT(*) c FROM ncr_reports WHERE status IN ('OPEN', 'IN_REWORK')").fetchone()["c"]
        critical_ncrs = conn.execute("SELECT COUNT(*) c FROM ncr_reports WHERE status IN ('OPEN', 'IN_REWORK') AND severity = 'CRITICAL'").fetchone()["c"]
        fpy = round((passed_insp / total_insp * 100), 1) if total_insp > 0 else 100.0

        recent_ncrs = [dict(r) for r in conn.execute("""
            SELECT n.*, oi.product_name, o.order_no, c.name AS customer_name
            FROM ncr_reports n
            JOIN order_items oi ON oi.id = n.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            WHERE n.status IN ('OPEN', 'IN_REWORK')
            ORDER BY CASE n.severity WHEN 'CRITICAL' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, n.id DESC
            LIMIT 5
        """).fetchall()]

        # 3. Materials Pillar
        steel_row = conn.execute("""
            SELECT COALESCE(SUM(b.total_quantity), 0) AS total_kg
            FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'ACTIVE' AND b.unit = 'KG' AND b.material_category IN ('BODY_SHEET', 'BASE_PLATE', 'GUSSET', 'BRACKET_PIPE')
        """).fetchone()
        steel_kg = float(steel_row["total_kg"] or 0)
        shortages = conn.execute("""
            SELECT COUNT(*) c FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'ACTIVE' AND b.procurement_status = 'PURCHASE_REQUIRED'
        """).fetchone()["c"]
        ordered_mat = conn.execute("""
            SELECT COUNT(*) c FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'ACTIVE' AND b.procurement_status = 'ORDERED'
        """).fetchone()["c"]
        in_stock_mat = conn.execute("""
            SELECT COUNT(*) c FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'ACTIVE' AND b.procurement_status = 'IN_STOCK'
        """).fetchone()["c"]

        shortage_items = [dict(r) for r in conn.execute("""
            SELECT b.*, oi.product_name, o.order_no, c.name AS customer_name
            FROM order_item_bom b
            JOIN order_items oi ON oi.id = b.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN customers c ON c.id = o.customer_id
            WHERE b.procurement_status = 'PURCHASE_REQUIRED' AND o.status = 'ACTIVE'
            ORDER BY b.id DESC
            LIMIT 5
        """).fetchall()]

        # 4. Finance Pillar
        active_orders = conn.execute("SELECT id FROM orders WHERE status = 'ACTIVE'").fetchall()
        tot_val = sum(order_financials(conn, o["id"])[0] for o in active_orders)
        tot_paid = sum(order_financials(conn, o["id"])[1] for o in active_orders)
        debt_alerts = conn.execute("SELECT COUNT(*) c FROM management_alerts WHERE alert_type = 'DEBT_SHIPMENT' AND active = 1").fetchone()["c"]

        # 5. Recent System Events
        recent_events = [dict(r) for r in conn.execute("""
            SELECT * FROM system_events ORDER BY id DESC LIMIT 15
        """).fetchall()]
        for ev in recent_events:
            if ev.get("metadata") and isinstance(ev["metadata"], str):
                try:
                    ev["metadata"] = json.loads(ev["metadata"])
                except Exception:
                    pass

        return {
            "schedule": {
                "total_active_projects": len(prjs),
                "on_track_count": on_track,
                "at_risk_count": at_risk,
                "delayed_count": delayed,
                "blocked_stages_count": blocked_stages_count,
                "attention_projects": attention_projects[:5],
            },
            "quality": {
                "total_inspections": total_insp,
                "passed_inspections": passed_insp,
                "first_pass_yield": fpy,
                "open_ncrs_count": open_ncrs,
                "critical_ncrs_count": critical_ncrs,
                "recent_ncrs": recent_ncrs,
            },
            "materials": {
                "steel_weight_kg": steel_kg,
                "steel_weight_ton": round(steel_kg / 1000.0, 2),
                "shortage_count": shortages,
                "ordered_count": ordered_mat,
                "in_stock_count": in_stock_mat,
                "shortage_items": shortage_items,
            },
            "finance": {
                "total_contract_value": tot_val,
                "total_paid": tot_paid,
                "total_balance": max(tot_val - tot_paid, 0),
                "collection_rate": round((tot_paid / tot_val * 100), 1) if tot_val > 0 else 100.0,
                "debt_alerts_count": debt_alerts,
            },
            "recent_events": recent_events,
        }


@app.get("/api/system-events")
def get_system_events(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0)
):
    """Returns paginated auditable system events stream with severity breakdown."""
    with connect() as conn:
        where = []
        params = []
        if event_type:
            where.append("event_type = ?")
            params.append(event_type.upper())
        if severity:
            where.append("severity = ?")
            params.append(severity.upper())

        where_str = ("WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute(f"SELECT COUNT(*) c FROM system_events {where_str}", params).fetchone()["c"]

        # Severity breakdown counts across all events
        sev_counts = {"INFO": 0, "WARNING": 0, "CRITICAL": 0, "SUCCESS": 0}
        for r in conn.execute("SELECT severity, COUNT(*) c FROM system_events GROUP BY severity").fetchall():
            sev_counts[r["severity"]] = r["c"]

        query = f"SELECT * FROM system_events {where_str} ORDER BY id DESC LIMIT ? OFFSET ?"
        rows = [dict(r) for r in conn.execute(query, params + [limit, offset]).fetchall()]
        for r in rows:
            if r.get("metadata") and isinstance(r["metadata"], str):
                try:
                    r["metadata"] = json.loads(r["metadata"])
                except Exception:
                    pass

        return {
            "items": rows,
            "total": total,
            "severity_counts": sev_counts,
        }


@app.post("/api/system-events")
def create_system_event(body: SystemEventIn):
    """Manual or automated recording of an auditable event."""
    with connect() as conn:
        eid = record_system_event(
            conn,
            event_type=body.event_type,
            severity=body.severity,
            title=body.title,
            message=body.message,
            actor=body.actor or "کاربر سیستم",
            entity_type=body.entity_type,
            entity_id=body.entity_id,
            metadata=body.metadata,
        )
        row = conn.execute("SELECT * FROM system_events WHERE id = ?", (eid,)).fetchone()
        if not row:
            raise HTTPException(500, "خطا در ثبت رویداد سیستم")
        d = dict(row)
        if d.get("metadata") and isinstance(d["metadata"], str):
            try:
                d["metadata"] = json.loads(d["metadata"])
            except Exception:
                pass
        return d



