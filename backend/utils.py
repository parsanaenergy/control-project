from datetime import datetime, date

STAGES = [
    ("DESIGN", "طراحی", 0.10),
    ("PURCHASE", "خرید", 0.15),
    ("PRODUCTION", "تولید", 0.45),
    ("QC", "QC", 0.10),
    ("PACKAGING", "بسته‌بندی", 0.10),
    ("DELIVERY", "تحویل", 0.05),
    ("COLLECTION", "وصول", 0.05),
]

STAGE_WEIGHTS = {k: w for k, _, w in STAGES}


def calc_weighted_progress(stages: list) -> int:
    """Calculate weighted physical progress from a list of stage dicts or rows."""
    if not stages:
        return 0
    total_w = 0.0
    weighted_p = 0.0
    for s in stages:
        # Support dict or sqlite3.Row
        w = s["weight"] if (hasattr(s, "__getitem__") and "weight" in s and s["weight"] is not None) else STAGE_WEIGHTS.get(s.get("stage_key", ""), 0.14)
        p = s["progress"] if (hasattr(s, "__getitem__") and "progress" in s and s["progress"] is not None) else 0
        w = float(w or 0.14)
        p = float(p or 0)
        total_w += w
        weighted_p += w * p
    if total_w <= 0:
        total_w = 1.0
    return min(100, max(0, round(weighted_p / total_w)))


def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def today_iso():
    return date.today().isoformat()


def make_code(prefix: str, number: int, min_digits: int = 1) -> str:
    return f"{prefix}{number:0{min_digits}d}"


def calc_pole_steel_weight(height: float, bottom_diameter: float, top_diameter: float, sheet_thickness: float) -> float:
    """
    Calculates estimated steel weight of a tapered pole body in KG.
    height in meters, diameters and thickness in mm.
    Density of structural steel ST37/ST52 is ~7850 kg/m^3.
    """
    import math
    if not height or height <= 0 or not sheet_thickness or sheet_thickness <= 0:
        return 0.0

    b_dia = float(bottom_diameter or 160.0) / 1000.0
    t_dia = float(top_diameter or 80.0) / 1000.0
    mean_dia = (b_dia + t_dia) / 2.0
    h = float(height)
    t = float(sheet_thickness) / 1000.0

    area_m2 = math.pi * mean_dia * h
    volume_m3 = area_m2 * t
    weight_kg = volume_m3 * 7850.0
    return round(weight_kg, 1)


def generate_default_bom_items(item_id: int, item_quantity: float, pole_spec: dict = None) -> list:
    """
    Generates standard Bill of Materials (BOM) items for a lighting pole based on engineering specs.
    """
    spec = pole_spec or {}
    h = float(spec.get("height") or 9.0)
    b_dia = float(spec.get("bottom_diameter") or 180.0)
    t_dia = float(spec.get("top_diameter") or 80.0)
    th = float(spec.get("sheet_thickness") or 3.0)
    sides = int(spec.get("sides_count") or 8)
    qty = float(item_quantity or 1)

    body_weight_kg = calc_pole_steel_weight(h, b_dia, t_dia, th)
    if body_weight_kg <= 0:
        body_weight_kg = round(h * 11.5 * (th / 3.0), 1)

    base_dim = str(spec.get("base_plate_dim") or "400x400x16")
    base_weight_kg = 20.0
    try:
        parts = [float(x.strip()) for x in base_dim.lower().replace("×", "x").split("x") if x.strip()]
        if len(parts) >= 3:
            base_weight_kg = round((parts[0] / 1000.0) * (parts[1] / 1000.0) * (parts[2] / 1000.0) * 7850.0, 1)
    except Exception:
        base_weight_kg = 20.0

    gusset_weight_kg = round(base_weight_kg * 0.15, 1)

    bracket_type = spec.get("bracket_type") or "دوطرفه"
    bracket_count = int(spec.get("bracket_count") or 2)
    bracket_len = float(spec.get("bracket_length") or 1.2)
    bracket_weight_kg = round(bracket_count * bracket_len * 4.5, 1)

    anchor_spec = str(spec.get("anchor_bolt_spec") or "4xM20x600")

    surface_treatment = spec.get("surface_treatment") or "گالوانیزه گرم"
    is_galv = "گالوانیزه" in surface_treatment
    coating_qty_kg = round((body_weight_kg + base_weight_kg) * (0.05 if is_galv else 0.02), 1)

    return [
        {
            "order_item_id": item_id,
            "material_category": "BODY_SHEET",
            "material_name": f"ورق فولادی بدنه ST37 ({th}mm)",
            "spec": f"ورق سیاه نورد گرم ST37 - ضخامت {th} میل - مقطع {sides} وجهی",
            "quantity_per_pole": body_weight_kg,
            "total_quantity": round(body_weight_kg * qty, 1),
            "unit": "KG",
            "estimated_unit_cost": 45000.0,
            "procurement_status": "IN_STOCK",
            "notes": f"محاسبه مهندسی برای ارتفاع {h}م و قطر {b_dia} به {t_dia}"
        },
        {
            "order_item_id": item_id,
            "material_category": "BASE_PLATE",
            "material_name": "بیس‌پلیت فولادی (صفحه ستون)",
            "spec": f"ورق فولادی برش‌خورده CNC به ابعاد {base_dim} میلیمتر",
            "quantity_per_pole": base_weight_kg,
            "total_quantity": round(base_weight_kg * qty, 1),
            "unit": "KG",
            "estimated_unit_cost": 48000.0,
            "procurement_status": "IN_STOCK",
            "notes": "سوراخ‌کاری شده مطابق شابلون انکربولت"
        },
        {
            "order_item_id": item_id,
            "material_category": "GUSSET",
            "material_name": "لچکی‌های تقویتی بیس‌پلیت (۴ عدد)",
            "spec": "ورق مثلثی لچکی ضخامت ۸ میلیمتر برش پلاسما",
            "quantity_per_pole": gusset_weight_kg,
            "total_quantity": round(gusset_weight_kg * qty, 1),
            "unit": "KG",
            "estimated_unit_cost": 48000.0,
            "procurement_status": "IN_STOCK",
            "notes": "جهت مهار تنش‌های خمشی پایه"
        },
        {
            "order_item_id": item_id,
            "material_category": "BRACKET_PIPE",
            "material_name": f"لوله و پروفیل براکت/دستک ({bracket_type})",
            "spec": f"لوله درزدار سایز ۴۸/۶۰ میلیمتر - {bracket_count} شاخه طول {bracket_len}م",
            "quantity_per_pole": bracket_weight_kg,
            "total_quantity": round(bracket_weight_kg * qty, 1),
            "unit": "KG",
            "estimated_unit_cost": 52000.0,
            "procurement_status": "IN_STOCK",
            "notes": f"دستک {bracket_type}"
        },
        {
            "order_item_id": item_id,
            "material_category": "ANCHOR_BOLTS",
            "material_name": "مجموعه انکربولت با مهره و واشر",
            "spec": anchor_spec,
            "quantity_per_pole": 1.0,
            "total_quantity": qty,
            "unit": "SET",
            "estimated_unit_cost": 380000.0,
            "procurement_status": "IN_STOCK",
            "notes": "همراه با شابلون و دو عدد مهره شش‌گوش گالوانیزه"
        },
        {
            "order_item_id": item_id,
            "material_category": "COATING",
            "material_name": f"مواد پوشش سطحی ({surface_treatment})",
            "spec": f"پوشش محافظ {surface_treatment} مطابق استاندارد ASTM A123",
            "quantity_per_pole": coating_qty_kg,
            "total_quantity": round(coating_qty_kg * qty, 1),
            "unit": "KG",
            "estimated_unit_cost": 120000.0 if is_galv else 95000.0,
            "procurement_status": "IN_STOCK",
            "notes": "شمش روی ویژه گالوانیزه گرم / پودر رنگ"
        },
        {
            "order_item_id": item_id,
            "material_category": "ELECTRICAL",
            "material_name": "ترمینال و فیوز مینیاتوری داخل دریچه",
            "spec": "ترمینال کلمپ ریلی ۶ آمپر + کابل نسوز سیلیکونی ۲x۱.۵",
            "quantity_per_pole": 1.0,
            "total_quantity": qty,
            "unit": "SET",
            "estimated_unit_cost": 180000.0,
            "procurement_status": "IN_STOCK",
            "notes": "نصب داخل دریچه دسترسی پایین پایه"
        }
    ]


STAGE_DEPENDENCIES = {
    "PURCHASE": {"depends_on": "DESIGN", "title": "خرید متریال", "predecessor_title": "طراحی و مهندسی"},
    "PRODUCTION": {"depends_on": "PURCHASE", "title": "ساخت و تولید", "predecessor_title": "تأمین متریال"},
    "QC": {"depends_on": "PRODUCTION", "title": "کنترل کیفیت", "predecessor_title": "تولید سازه"},
    "PACKAGING": {"depends_on": "QC", "title": "بسته‌بندی", "predecessor_title": "کنترل کیفیت"},
    "DELIVERY": {"depends_on": "PACKAGING", "title": "تحویل و بارگیری", "predecessor_title": "بسته‌بندی"},
    "COLLECTION": {"depends_on": "DELIVERY", "title": "وصول مطالبات", "predecessor_title": "تحویل کالا"},
}


def parse_date_safe(d_str: str):
    if not d_str or not isinstance(d_str, str):
        return None
    try:
        return datetime.strptime(d_str[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def calc_schedule_variance(baseline_finish: str = None, forecast_finish: str = None, actual_finish: str = None) -> dict:
    """
    Calculates Schedule Variance (SV) in days and health rating.
    SV = Target/Actual Finish - Baseline Finish
    SV <= 0: ON_TRACK (Ahead or on time)
    1 <= SV <= 7: AT_RISK (Minor delay)
    SV > 7: DELAYED (Critical delay)
    """
    b_date = parse_date_safe(baseline_finish)
    comp_date = parse_date_safe(actual_finish) or parse_date_safe(forecast_finish)

    if not b_date or not comp_date:
        return {
            "variance_days": 0,
            "status": "ON_TRACK",
            "status_label": "طبق برنامه",
            "is_delayed": False,
        }

    diff_days = (comp_date - b_date).days
    if diff_days <= 0:
        status = "ON_TRACK"
        status_label = "طبق برنامه"
        is_delayed = False
    elif diff_days <= 7:
        status = "AT_RISK"
        status_label = "در معرض تأخیر"
        is_delayed = True
    else:
        status = "DELAYED"
        status_label = "دارای تأخیر بحرانی"
        is_delayed = True

    return {
        "variance_days": diff_days,
        "status": status,
        "status_label": status_label,
        "is_delayed": is_delayed,
    }


def generate_default_project_milestones(project_id: int, start_date_str: str = None, finish_date_str: str = None) -> list:
    """
    Generates 5 standard lighting pole manufacturing milestones:
    M1: تصویب نقشه مهندسی و شاپ دراوینگ
    M2: تأمین ورق فولادی و انکربولت
    M3: اتمام برش، خمکاری و جوشکاری
    M4: اتمام پوشش گالوانیزه/رنگ و تست کیفی
    M5: تست نهایی، بسته‌بندی و تحویل به کارفرما
    """
    from datetime import timedelta
    start = parse_date_safe(start_date_str) or date.today()
    finish = parse_date_safe(finish_date_str) or (start + timedelta(days=30))
    if finish < start:
        finish = start + timedelta(days=30)

    total_days = max((finish - start).days, 5)

    # Milestone distribution fractions: M1: 15%, M2: 35%, M3: 70%, M4: 88%, M5: 100%
    fractions = [0.15, 0.35, 0.70, 0.88, 1.00]
    definitions = [
        ("M1", "تصویب نقشه ساخت و شاپ دراوینگ", "DESIGN", 0.15),
        ("M2", "تأمین ورق فولادی ST37/ST52 و اتصالات", "PURCHASE", 0.20),
        ("M3", "اتمام برش، نورد/خم‌کاری و جوشکاری سازه", "PRODUCTION", 0.35),
        ("M4", "پوشش گالوانیزه گرم / رنگ و بازرسی QC", "QC", 0.15),
        ("M5", "بسته‌بندی، تست نهایی و بارگیری محموله", "DELIVERY", 0.15),
    ]

    milestones = []
    for (code, title, stage, weight), frac in zip(definitions, fractions):
        m_date = (start + timedelta(days=round(total_days * frac))).isoformat()
        milestones.append({
            "project_id": project_id,
            "milestone_code": code,
            "title": title,
            "stage_key": stage,
            "baseline_date": m_date,
            "forecast_date": m_date,
            "actual_date": None,
            "status": "PLANNED",
            "weight": weight,
            "notes": f"نقطه عطف استاندارد مهندسی سازه {code}"
        })
    return milestones


def enrich_stages_with_dependencies(stages: list) -> list:
    """
    Enriches stage dicts with Finish-to-Start predecessor dependency state and warnings.
    """
    stage_by_key = {s.get("stage_key"): s for s in stages if isinstance(s, dict)}
    for s in stages:
        if not isinstance(s, dict):
            continue
        k = s.get("stage_key")
        dep = STAGE_DEPENDENCIES.get(k)
        if dep:
            pred_key = dep["depends_on"]
            pred = stage_by_key.get(pred_key)
            s["predecessor_key"] = pred_key
            s["predecessor_title"] = dep["predecessor_title"]
            if pred:
                pred_done = (float(pred.get("progress") or 0) >= 100) or (pred.get("status") == "DONE")
                pred_blocked = (pred.get("status") == "BLOCKED")
                s["predecessor_done"] = pred_done
                s["predecessor_blocked"] = pred_blocked
                if pred_blocked:
                    s["dependency_warning"] = f"مرحله پیش‌نیاز ({dep['predecessor_title']}) متوقف شده است: {pred.get('block_reason') or ''}"
                elif not pred_done and float(s.get("progress") or 0) > 0:
                    s["dependency_warning"] = f"هشدار پیش‌نیاز: مرحله ({dep['predecessor_title']}) هنوز تکمیل نشده است ({int(pred.get('progress') or 0)}٪)"
                else:
                    s["dependency_warning"] = None
            else:
                s["predecessor_done"] = True
                s["predecessor_blocked"] = False
                s["dependency_warning"] = None
        else:
            s["predecessor_key"] = None
            s["predecessor_title"] = None
            s["predecessor_done"] = True
            s["predecessor_blocked"] = False
            s["dependency_warning"] = None
    return stages


def record_system_event(
    conn,
    event_type: str,
    severity: str,
    title: str,
    message: str,
    actor: str = "سیستم",
    entity_type: str = None,
    entity_id: int = None,
    metadata: dict = None
) -> int:
    """
    Records an auditable system event into system_events table.
    """
    import json
    meta_json = json.dumps(metadata, ensure_ascii=False) if metadata else None
    try:
        cur = conn.execute("""
            INSERT INTO system_events (
                event_type, severity, entity_type, entity_id,
                title, message, actor, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            event_type.upper(), severity.upper(), entity_type, entity_id,
            title.strip(), message.strip(), actor or "سیستم", meta_json
        ))
        return cur.lastrowid
    except Exception:
        # Avoid crashing primary workflows if event recording encounters any schema issue
        return 0




