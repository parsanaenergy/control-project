from .db import connect, init_db
from .utils import STAGES


def seed_demo():
    init_db()
    with connect() as conn:
        exists = conn.execute("SELECT 1 FROM customers LIMIT 1").fetchone()
        if exists:
            return
        cur = conn.execute(
            """INSERT INTO customers(code,name,prefix,start_counter,next_order_counter,created_at)
               VALUES(?,?,?,?,?,?)""",
            ("C000001", "hoshmand", "MD", 11, 12, "2026-09-12T00:00:00"),
        )
        cid = cur.lastrowid
        cur = conn.execute(
            """INSERT INTO orders(order_no,customer_id,order_date,delivery_date,payment_due_date,registered_by,status)
               VALUES(?,?,?,?,?,?,?)""",
            ("MD11", cid, "2026-09-12", "2026-10-12", "2026-10-12", "ASUS", "ACTIVE"),
        )
        oid = cur.lastrowid
        cur = conn.execute(
            """INSERT INTO order_items(item_code,order_id,product_name,quantity,unit_price,paint_type,color,cable_status,
               projector_type,projector_brand,special_notes,galvanized,galvanized_notes)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("I000001", oid, "افرینش", 2, 25000, "Powder", "مشکی پودر", "دارد", "دارد", "دارد", "گالوانیزه", 0, None),
        )
        iid = cur.lastrowid
        for key, fa, weight in STAGES:
            progress = 25 if key == "DESIGN" else 50 if key == "QC" else 0
            note = "نقشه تحویل داده شد" if key == "DESIGN" else None
            status = "DONE" if progress >= 100 else "IN_PROGRESS" if progress > 0 else "TODO"
            conn.execute(
                """INSERT INTO project_stages(order_item_id,stage_key,stage_name_fa,progress,due_date,updated_by,note,updated_at,weight,status)
                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (iid, key, fa, progress, "2026-10-12", "ASUS", note, "2026-09-12T00:00:00", weight, status),
            )

if __name__ == "__main__":
    seed_demo()
    print("Demo database initialized")
