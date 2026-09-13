import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "factory.db"

SCHEMA = r'''
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    prefix TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    description TEXT,
    start_counter INTEGER NOT NULL,
    next_order_counter INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    project_id INTEGER REFERENCES projects(id),
    order_date TEXT NOT NULL,
    delivery_date TEXT,
    payment_due_date TEXT,
    registered_by TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL DEFAULT 0,
    paint_type TEXT,
    color TEXT,
    cable_status TEXT,
    projector_type TEXT,
    projector_brand TEXT,
    special_notes TEXT,
    galvanized INTEGER NOT NULL DEFAULT 0,
    galvanized_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
);

CREATE TABLE IF NOT EXISTS project_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL,
    stage_name_fa TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    due_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT,
    note TEXT,
    weight REAL DEFAULT 0.14,
    status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','DONE','BLOCKED')),
    block_reason TEXT,
    UNIQUE(order_item_id, stage_key)
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
    department TEXT NOT NULL CHECK(department IN ('PURCHASE','PRODUCTION','GENERAL')),
    body TEXT NOT NULL,
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS department_tasks (
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
);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON department_tasks(order_id, department, due_date);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_code TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_date TEXT NOT NULL,
    description TEXT,
    registered_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    voided INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_code TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    shipment_date TEXT NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    destination TEXT,
    carrier TEXT,
    waybill TEXT,
    receiver TEXT,
    delivery_status TEXT,
    description TEXT,
    registered_by TEXT,
    debt_at_shipment REAL NOT NULL DEFAULT 0,
    debt_override INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS management_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    order_id INTEGER REFERENCES orders(id),
    shipment_id INTEGER REFERENCES shipments(id),
    message TEXT NOT NULL,
    amount REAL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
);

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_item ON shipments(order_item_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_item ON qc_inspections(order_item_id);
CREATE INDEX IF NOT EXISTS idx_ncr_order_item ON ncr_reports(order_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_order_item ON order_item_bom(order_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_status ON order_item_bom(procurement_status);
'''

@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    from .migrations import run_migrations
    run_migrations(db_path=DB_PATH)


def row_dict(row):
    return dict(row) if row is not None else None
