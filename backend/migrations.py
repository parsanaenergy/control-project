"""Database migration engine for Factory Project Manager.
Supports safe, versioned, idempotent schema and data migrations for SQLite.
"""
import sys
import sqlite3
from pathlib import Path
from typing import Callable, List, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "factory.db"


def get_connection(db_path: Path = None) -> sqlite3.Connection:
    path = db_path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    )
    return cur.fetchone() is not None


def column_exists(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    if not table_exists(conn, table_name):
        return False
    cur = conn.execute(f"PRAGMA table_info({table_name})")
    columns = [row["name"] for row in cur.fetchall()]
    return column_name in columns


def add_column_if_not_exists(
    conn: sqlite3.Connection, table_name: str, column_name: str, column_def: str
) -> bool:
    """Adds a column to an existing table if it does not already exist. Returns True if added."""
    if not column_exists(conn, table_name, column_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}")
        return True
    return False


def create_index_if_not_exists(
    conn: sqlite3.Connection, index_name: str, table_name: str, columns_sql: str
) -> bool:
    sql = f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name}({columns_sql})"
    conn.execute(sql)
    return True


# ---------------------------------------------------------------------------
# Migration Definitions
# ---------------------------------------------------------------------------

def migration_0001_initial_schema(conn: sqlite3.Connection):
    """Ensure original 10 tables and indexes exist."""
    from .db import SCHEMA
    conn.executescript(SCHEMA)


def migration_0002_add_projects_and_pole_specs(conn: sqlite3.Connection):
    """Add projects and pole_specifications tables, link orders to projects, and backfill existing data."""
    # 1. Create projects table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_code TEXT NOT NULL UNIQUE,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            project_name TEXT NOT NULL,
            site_location TEXT,
            project_manager TEXT,
            priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
            status TEXT NOT NULL DEFAULT 'ENGINEERING' CHECK(status IN ('DRAFT','ENGINEERING','WAITING_APPROVAL','READY_FOR_PRODUCTION','IN_PRODUCTION','QC','READY_FOR_DELIVERY','DELIVERED','CLOSED','CANCELLED','ON_HOLD')),
            risk_level TEXT NOT NULL DEFAULT 'LOW' CHECK(risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
            contract_no TEXT,
            contract_date TEXT,
            contract_value REAL DEFAULT 0,
            planned_start TEXT,
            planned_finish TEXT,
            committed_delivery_date TEXT,
            actual_start TEXT,
            actual_finish TEXT,
            forecast_finish TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_projects_customer", "projects", "customer_id")
    create_index_if_not_exists(conn, "idx_projects_status", "projects", "status")

    # 2. Add project_id to orders
    add_column_if_not_exists(conn, "orders", "project_id", "INTEGER REFERENCES projects(id)")
    create_index_if_not_exists(conn, "idx_orders_project", "orders", "project_id")

    # 3. Create pole_specifications table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pole_specifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_item_id INTEGER NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
            pole_type TEXT,
            height REAL,
            bottom_diameter REAL,
            top_diameter REAL,
            sheet_thickness REAL,
            sides_count INTEGER DEFAULT 0,
            section_count INTEGER DEFAULT 1,
            bracket_type TEXT,
            bracket_count INTEGER DEFAULT 0,
            bracket_length REAL,
            bracket_angle REAL,
            base_plate_dim TEXT,
            anchor_bolt_spec TEXT,
            welding_spec TEXT,
            surface_treatment TEXT,
            coating_thickness REAL,
            drawing_number TEXT,
            drawing_revision TEXT DEFAULT 'Rev A',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_pole_specs_item", "pole_specifications", "order_item_id")

    # 4. Backfill existing orders without project_id
    orders_without_project = conn.execute(
        "SELECT id, order_no, customer_id, order_date, delivery_date, registered_by, description FROM orders WHERE project_id IS NULL"
    ).fetchall()

    for row in orders_without_project:
        oid = row["id"]
        order_no = row["order_no"]
        cid = row["customer_id"]
        prj_code = f"PRJ-{order_no}"
        prj_name = f"پروژه سازه {order_no}"
        
        total_val = conn.execute(
            "SELECT COALESCE(SUM(quantity * unit_price), 0) v FROM order_items WHERE order_id = ?", (oid,)
        ).fetchone()["v"]

        cur = conn.execute(
            """INSERT INTO projects (
                project_code, customer_id, project_name, project_manager,
                contract_no, contract_date, contract_value, committed_delivery_date,
                description, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PRODUCTION')""",
            (
                prj_code, cid, prj_name, row["registered_by"] or "مدیر کارخانه",
                order_no, row["order_date"], total_val, row["delivery_date"],
                row["description"]
            )
        )
        pid = cur.lastrowid
        conn.execute("UPDATE orders SET project_id = ? WHERE id = ?", (pid, oid))

    # 5. Backfill default pole specifications for existing items if not present
    existing_items = conn.execute("SELECT id, product_name, paint_type, color, galvanized, galvanized_notes FROM order_items").fetchall()
    for item in existing_items:
        has_spec = conn.execute("SELECT 1 FROM pole_specifications WHERE order_item_id = ?", (item["id"],)).fetchone()
        if not has_spec:
            conn.execute(
                """INSERT INTO pole_specifications (
                    order_item_id, pole_type, height, bottom_diameter, top_diameter, sheet_thickness,
                    sides_count, section_count, surface_treatment, drawing_number, drawing_revision
                ) VALUES (?, 'چندضلعی استاندارد', 9.0, 180.0, 80.0, 3.0, 8, 1, ?, 'DWG-1001', 'Rev A')""",
                (item["id"], "گالوانیزه گرم" if item["galvanized"] else (item["paint_type"] or "رنگ پودری الکترواستاتیک"))
            )


def migration_0003_weighted_progress_and_blockers(conn: sqlite3.Connection):
    """Add weight, status, and block_reason to project_stages, and add block_reason/BLOCKED status to department_tasks."""
    # 1. Update project_stages schema
    add_column_if_not_exists(conn, "project_stages", "weight", "REAL DEFAULT 0.14")
    add_column_if_not_exists(conn, "project_stages", "status", "TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','DONE','BLOCKED'))")
    add_column_if_not_exists(conn, "project_stages", "block_reason", "TEXT")

    # Set standard engineering weights for pole fabrication
    standard_weights = {
        "DESIGN": 0.10,
        "PURCHASE": 0.15,
        "PRODUCTION": 0.45,
        "QC": 0.10,
        "PACKAGING": 0.10,
        "DELIVERY": 0.05,
        "COLLECTION": 0.05,
    }
    for skey, w in standard_weights.items():
        conn.execute("UPDATE project_stages SET weight = ? WHERE stage_key = ?", (w, skey))

    # Backfill status based on progress
    conn.execute("UPDATE project_stages SET status = 'DONE' WHERE progress >= 100 AND status = 'TODO'")
    conn.execute("UPDATE project_stages SET status = 'IN_PROGRESS' WHERE progress > 0 AND progress < 100 AND status = 'TODO'")

    # 2. Update department_tasks to support BLOCKED status and block_reason
    if not column_exists(conn, "department_tasks", "block_reason"):
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("""
            CREATE TABLE department_tasks_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
                department TEXT NOT NULL CHECK(department IN ('PURCHASE','PRODUCTION')),
                title TEXT NOT NULL,
                description TEXT,
                assignee TEXT,
                status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','DONE','BLOCKED')),
                due_date TEXT,
                reminder_date TEXT,
                block_reason TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            INSERT INTO department_tasks_new (
                id, order_id, order_item_id, department, title, description, assignee,
                status, due_date, reminder_date, created_at, updated_at
            )
            SELECT id, order_id, order_item_id, department, title, description, assignee,
                   status, due_date, reminder_date, created_at, updated_at
            FROM department_tasks
        """)
        conn.execute("DROP TABLE department_tasks")
        conn.execute("ALTER TABLE department_tasks_new RENAME TO department_tasks")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_order ON department_tasks(order_id, department, due_date)")
        conn.execute("PRAGMA foreign_keys = ON")


def migration_0004_qc_gates_and_ncr(conn: sqlite3.Connection):
    # 1. Create qc_inspections table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS qc_inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
            gate_type TEXT NOT NULL CHECK(gate_type IN ('INCOMING_FORMING', 'WELDING', 'COATING', 'FINAL_ASSEMBLY')),
            inspector_name TEXT NOT NULL,
            inspection_date TEXT NOT NULL DEFAULT (date('now')),
            result TEXT NOT NULL CHECK(result IN ('PASSED', 'FAILED', 'CONDITIONAL')),
            measured_values TEXT,
            check_items TEXT,
            remarks TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_qc_inspections_item", "qc_inspections", "order_item_id")
    create_index_if_not_exists(conn, "idx_qc_gate", "qc_inspections", "gate_type, result")

    # 2. Create ncr_reports table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ncr_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ncr_number TEXT NOT NULL UNIQUE,
            order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
            qc_inspection_id INTEGER REFERENCES qc_inspections(id) ON DELETE SET NULL,
            defect_title TEXT NOT NULL,
            defect_type TEXT NOT NULL CHECK(defect_type IN ('DIMENSION', 'WELDING', 'GALVANIZING_COATING', 'DEFORMATION', 'ASSEMBLY', 'OTHER')),
            severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(severity IN ('MINOR', 'MEDIUM', 'CRITICAL')),
            description TEXT NOT NULL,
            root_cause TEXT,
            disposition TEXT CHECK(disposition IN ('REWORK', 'SCRAP', 'CONCESSION', 'PENDING')),
            disposition_notes TEXT,
            disposition_by TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_REWORK', 'RESOLVED', 'CLOSED')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            resolved_at TEXT
        )
    """)
    create_index_if_not_exists(conn, "idx_ncr_order_item", "ncr_reports", "order_item_id")
    create_index_if_not_exists(conn, "idx_ncr_status", "ncr_reports", "status")

    # 3. Seed initial inspection sample data for existing items
    items = conn.execute("SELECT id FROM order_items ORDER BY id ASC").fetchall()
    if items:
        cnt = conn.execute("SELECT COUNT(*) c FROM qc_inspections").fetchone()["c"]
        if cnt == 0:
            first_item = items[0]["id"]
            conn.execute("""
                INSERT INTO qc_inspections (
                    order_item_id, gate_type, inspector_name, inspection_date, result,
                    measured_values, check_items, remarks
                ) VALUES (?, 'INCOMING_FORMING', 'مهندس کاظمی (کنترل کیفیت)', date('now'), 'PASSED',
                    '{"thickness_mm": 4.0, "sides_count": 8, "forming_radius_ok": true}',
                    '{"material_cert_approved": true, "dimensional_tolerance_ok": true, "edge_chamfer_ok": true}',
                    'ضخامت و ابعاد خم مطابق نقشه ساخت تایید شد.'
                )
            """, (first_item,))
            conn.execute("""
                INSERT INTO qc_inspections (
                    order_item_id, gate_type, inspector_name, inspection_date, result,
                    measured_values, check_items, remarks
                ) VALUES (?, 'WELDING', 'مهندس کاظمی (کنترل کیفیت)', date('now'), 'PASSED',
                    '{"throat_thickness_mm": 6.0, "welding_current_a": 280}',
                    '{"vt_visual_check": true, "full_penetration": true, "no_undercut": true}',
                    'بازرسی چشمی جوش طولی بدنه و گلویی بیس‌پلیت انجام شد و تایید گردید.'
                )
            """, (first_item,))

            target_item = items[1]["id"] if len(items) > 1 else first_item
            conn.execute("""
                INSERT INTO ncr_reports (
                    ncr_number, order_item_id, defect_title, defect_type, severity,
                    description, root_cause, disposition, disposition_notes, disposition_by,
                    status, created_at
                ) VALUES (
                    'NCR-1405-001', ?, 'پاشش مازاد جوش و نایکنواختی پوشش گالوانیزه لچکی', 'GALVANIZING_COATING', 'MINOR',
                    'مشاهده قطرات سرد روی لچکی تقویتی بیس‌پلیت و عدم پرداخت مناسب سطح پیش از اسیدشویی',
                    'عدم سنگ‌زنی دقیق اپراتور جوشکاری پیش از ارسال به گالوانیزه گرم',
                    'REWORK', 'سنگ‌زنی سطحی و لکه‌گیری با پوشش غنی از روی (Zinc Spray)',
                    'مهندس کاظمی (QC)', 'IN_REWORK', datetime('now')
                )
            """, (target_item,))


def migration_0005_bom_and_materials(conn: sqlite3.Connection):
    """Create order_item_bom table and seed initial BOM items based on pole engineering specs."""
    from .utils import generate_default_bom_items

    # 1. Create order_item_bom table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS order_item_bom (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
            material_category TEXT NOT NULL CHECK(material_category IN ('BODY_SHEET', 'BASE_PLATE', 'GUSSET', 'BRACKET_PIPE', 'ANCHOR_BOLTS', 'COATING', 'ELECTRICAL', 'OTHER')),
            material_name TEXT NOT NULL,
            spec TEXT,
            quantity_per_pole REAL NOT NULL DEFAULT 1,
            total_quantity REAL NOT NULL,
            unit TEXT NOT NULL DEFAULT 'KG' CHECK(unit IN ('KG', 'METER', 'PIECE', 'SET', 'LTR', 'SHEET')),
            estimated_unit_cost REAL DEFAULT 0,
            procurement_status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK(procurement_status IN ('IN_STOCK', 'PURCHASE_REQUIRED', 'ORDERED', 'RECEIVED')),
            supplier_name TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_bom_order_item", "order_item_bom", "order_item_id")
    create_index_if_not_exists(conn, "idx_bom_status", "order_item_bom", "procurement_status")
    create_index_if_not_exists(conn, "idx_bom_category", "order_item_bom", "material_category")

    # 2. Seed default BOM items for existing order_items
    items = conn.execute("SELECT id, quantity FROM order_items").fetchall()
    for it in items:
        item_id = it["id"]
        qty = float(it["quantity"] or 1)
        c = conn.execute("SELECT COUNT(*) c FROM order_item_bom WHERE order_item_id = ?", (item_id,)).fetchone()["c"]
        if c == 0:
            spec_row = conn.execute("SELECT * FROM pole_specifications WHERE order_item_id = ?", (item_id,)).fetchone()
            spec_dict = dict(spec_row) if spec_row else {}
            bom_entries = generate_default_bom_items(item_id, qty, spec_dict)
            for b in bom_entries:
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


def migration_0006_baselines_and_milestones(conn: sqlite3.Connection):
    """Add project_baselines and project_milestones tables for schedule baseline control and milestone tracking."""
    # 1. project_baselines table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS project_baselines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            baseline_version INTEGER NOT NULL DEFAULT 1,
            baseline_name TEXT NOT NULL,
            baseline_date TEXT NOT NULL DEFAULT (date('now')),
            planned_start TEXT,
            planned_finish TEXT,
            contract_value REAL DEFAULT 0,
            scope_poles_count INTEGER DEFAULT 0,
            approved_by TEXT,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_baselines_project", "project_baselines", "project_id")

    # 2. project_milestones table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS project_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            milestone_code TEXT,
            title TEXT NOT NULL,
            stage_key TEXT,
            baseline_date TEXT,
            forecast_date TEXT,
            actual_date TEXT,
            status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED', 'IN_PROGRESS', 'ACHIEVED', 'DELAYED')),
            weight REAL DEFAULT 0.20,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_milestones_project", "project_milestones", "project_id")
    create_index_if_not_exists(conn, "idx_milestones_status", "project_milestones", "status")

    # 3. Backfill baselines & milestones for existing projects
    from .utils import generate_default_project_milestones
    prjs = conn.execute("SELECT * FROM projects").fetchall()
    for p in prjs:
        pid = p["id"]
        has_b = conn.execute("SELECT 1 FROM project_baselines WHERE project_id = ?", (pid,)).fetchone()
        if not has_b:
            total_poles_row = conn.execute("""
                SELECT COALESCE(SUM(oi.quantity), 0) AS q
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.project_id = ?
            """, (pid,)).fetchone()
            scope_count = int(total_poles_row["q"] or 0) if total_poles_row else 0
            p_start = p["planned_start"] or (p["created_at"][:10] if p["created_at"] else "2026-01-01")
            p_finish = p["planned_finish"] or p["committed_delivery_date"] or p_start
            conn.execute("""
                INSERT INTO project_baselines (
                    project_id, baseline_version, baseline_name, baseline_date,
                    planned_start, planned_finish, contract_value, scope_poles_count,
                    approved_by, notes, is_active
                ) VALUES (?, 1, 'خط مبنای اولیه (Rev 0)', ?, ?, ?, ?, ?, ?, 'ثبت اولیه بر اساس قرارداد و برنامه زمان‌بندی', 1)
            """, (
                pid, p["created_at"][:10] if p["created_at"] else "2026-01-01", p_start, p_finish,
                float(p["contract_value"] or 0), scope_count,
                p["project_manager"] or "مدیریت کارخانه"
            ))

        has_m = conn.execute("SELECT 1 FROM project_milestones WHERE project_id = ?", (pid,)).fetchone()
        if not has_m:
            m_list = generate_default_project_milestones(
                pid,
                p["planned_start"] or (p["created_at"][:10] if p["created_at"] else "2026-01-01"),
                p["planned_finish"] or p["committed_delivery_date"]
            )
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


def migration_0007_system_events(conn: sqlite3.Connection):
    """Create system_events table for auditable operational event logging, management alerts, and AI layer readiness."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS system_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL', 'SUCCESS')),
            entity_type TEXT,
            entity_id INTEGER,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            actor TEXT DEFAULT 'سیستم',
            metadata JSON,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    create_index_if_not_exists(conn, "idx_events_type", "system_events", "event_type")
    create_index_if_not_exists(conn, "idx_events_severity", "system_events", "severity")
    create_index_if_not_exists(conn, "idx_events_created", "system_events", "created_at DESC")

    # Seed initial events from existing projects, NCRs, and blocked stages
    for p in conn.execute("SELECT * FROM projects ORDER BY id ASC LIMIT 5").fetchall():
        conn.execute("""
            INSERT INTO system_events (event_type, severity, entity_type, entity_id, title, message, actor, created_at)
            VALUES ('PROJECT', 'INFO', 'projects', ?, ?, ?, ?, ?)
        """, (
            p["id"],
            f"ایجاد پروژه {p['project_code']}",
            f"پروژه {p['project_name']} با وضعیت {p['status']} در سیستم ثبت شد.",
            p["project_manager"] or "سیستم",
            p["created_at"]
        ))

    for n in conn.execute("SELECT * FROM ncr_reports ORDER BY id ASC LIMIT 5").fetchall():
        conn.execute("""
            INSERT INTO system_events (event_type, severity, entity_type, entity_id, title, message, actor, created_at)
            VALUES ('NCR', 'CRITICAL', 'ncr_reports', ?, ?, ?, ?, ?)
        """, (
            n["id"],
            f"گزارش عدم انطباق کیفی {n['ncr_number']}",
            f"ایراد {n['defect_title']} با شدت {n['severity']} ثبت شد: {n['description']}",
            n["disposition_by"] or "واحد QC",
            n["created_at"]
        ))

    for st in conn.execute("SELECT * FROM project_stages WHERE status = 'BLOCKED' ORDER BY id ASC LIMIT 5").fetchall():
        conn.execute("""
            INSERT INTO system_events (event_type, severity, entity_type, entity_id, title, message, actor, created_at)
            VALUES ('STAGE', 'WARNING', 'project_stages', ?, ?, ?, ?, ?)
        """, (
            st["id"],
            f"توقف در مرحله «{st['stage_name_fa']}»",
            f"فعالیت به علت «{st['block_reason'] or 'مانع اعلام‌نشده'}» متوقف گردید.",
            st["updated_by"] or "سرپرست خط",
            st["updated_at"]
        ))


MIGRATIONS: List[Tuple[str, Callable[[sqlite3.Connection], None]]] = [
    ("0001_initial_schema", migration_0001_initial_schema),
    ("0002_add_projects_and_pole_specs", migration_0002_add_projects_and_pole_specs),
    ("0003_weighted_progress_and_blockers", migration_0003_weighted_progress_and_blockers),
    ("0004_qc_gates_and_ncr", migration_0004_qc_gates_and_ncr),
    ("0005_bom_and_materials", migration_0005_bom_and_materials),
    ("0006_baselines_and_milestones", migration_0006_baselines_and_milestones),
    ("0007_system_events", migration_0007_system_events),
]


def ensure_migrations_table(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)


def get_applied_migrations(conn: sqlite3.Connection) -> List[str]:
    ensure_migrations_table(conn)
    cur = conn.execute("SELECT name FROM schema_migrations ORDER BY id ASC")
    return [row["name"] for row in cur.fetchall()]


if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def run_migrations(db_path: Path = None, verbose: bool = False) -> List[str]:
    """Applies any pending migrations in sequential order."""
    conn = get_connection(db_path)
    applied_now = []
    try:
        ensure_migrations_table(conn)
        already_applied = set(get_applied_migrations(conn))

        for name, fn in MIGRATIONS:
            if name not in already_applied:
                if verbose:
                    print(f"Applying migration: {name} ...", flush=True)
                fn(conn)
                conn.execute(
                    "INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))",
                    (name,)
                )
                conn.commit()
                applied_now.append(name)
                if verbose:
                    print(f"  [OK] Applied: {name}", flush=True)

        return applied_now
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Migration failed during execution: {e}") from e
    finally:
        conn.close()


def print_status(db_path: Path = None):
    conn = get_connection(db_path)
    try:
        ensure_migrations_table(conn)
        already_applied = set(get_applied_migrations(conn))
        print("Schema Migrations Status:")
        print("----------------------------------------")
        for name, _ in MIGRATIONS:
            status = "APPLIED" if name in already_applied else "PENDING"
            print(f"  [{status:7s}] {name}")
        print("----------------------------------------")
    finally:
        conn.close()


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "apply"
    if action == "status":
        print_status()
    else:
        newly_applied = run_migrations(verbose=True)
        if newly_applied:
            print(f"Successfully applied {len(newly_applied)} migration(s).")
        else:
            print("Database is up to date. No pending migrations.")
