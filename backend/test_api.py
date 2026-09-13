import os
from pathlib import Path
from fastapi.testclient import TestClient
from .main import app

client=TestClient(app)

def test_health():
    r=client.get('/api/health'); assert r.status_code==200 and r.json()['ok']

def test_dashboard():
    r=client.get('/api/dashboard'); assert r.status_code==200; data=r.json(); assert 'metrics' in data and 'projects' in data

def test_customer_summary():
    r=client.get('/api/customers/summary'); assert r.status_code==200
    rows=r.json(); assert isinstance(rows,list)
    if rows:
        assert {'order_count','active_order_count','balance'}.issubset(rows[0])

def test_projects_and_pole_specs():
    # 1. Projects listing
    rp = client.get('/api/projects')
    assert rp.status_code == 200
    projects = rp.json()
    assert isinstance(projects, list)
    assert len(projects) >= 1
    p = next((x for x in projects if x.get('order_count', 0) > 0), projects[0])
    assert {'project_code', 'customer_name', 'status', 'priority', 'risk_level'}.issubset(p)

    # 2. Project detail
    r_detail = client.get(f"/api/projects/{p['id']}")
    assert r_detail.status_code == 200
    p_detail = r_detail.json()
    assert 'orders' in p_detail and 'items' in p_detail
    assert len(p_detail['items']) >= 1
    item = p_detail['items'][0]
    assert 'pole_spec' in item
    if item['pole_spec']:
        assert 'height' in item['pole_spec'] and 'sheet_thickness' in item['pole_spec']

    # 3. Create Project
    cust = client.get('/api/customers').json()[0]
    new_prj = client.post('/api/projects', json={
        'customer_id': cust['id'],
        'project_name': 'پروژه تست پایه‌چراغ ۱۲ متری',
        'site_location': 'اصفهان - اتوبان ذوب‌آهن',
        'project_manager': 'مهندس رضوانی',
        'priority': 'HIGH',
        'status': 'ENGINEERING'
    })
    assert new_prj.status_code == 200
    created = new_prj.json()
    assert created['priority'] == 'HIGH'
    assert 'PRJ-' in created['project_code']

    # 4. Update Project status
    patch_prj = client.patch(f"/api/projects/{created['id']}", json={'status': 'READY_FOR_PRODUCTION'})
    assert patch_prj.status_code == 200
    assert patch_prj.json()['status'] == 'READY_FOR_PRODUCTION'

    # 5. Get and Update Item Spec
    item_id = item['id']
    spec_r = client.get(f"/api/items/{item_id}/spec")
    assert spec_r.status_code == 200
    spec_save = client.put(f"/api/items/{item_id}/spec", json={
        'pole_type': 'چندضلعی تلسکوپی',
        'height': 12.0,
        'bottom_diameter': 240.0,
        'top_diameter': 100.0,
        'sheet_thickness': 4.0,
        'sides_count': 12,
        'bracket_type': 'دوطرفه',
        'bracket_count': 2,
        'drawing_number': 'DWG-RN-1200'
    })
    assert spec_save.status_code == 200
    assert spec_save.json()['height'] == 12.0
    assert spec_save.json()['sides_count'] == 12


def test_weighted_progress_and_blockers():
    # 1. Fetch an order and check stages
    orders = client.get('/api/orders').json()
    assert len(orders) >= 1
    oid = orders[0]['id']
    detail = client.get(f"/api/orders/{oid}").json()
    item = detail['items'][0]
    stages = item['stages']
    assert len(stages) == 7

    # Check that weights are present and match standard engineering weights
    prod_stage = next(s for s in stages if s['stage_key'] == 'PRODUCTION')
    assert prod_stage['weight'] == 0.45

    # 2. Update stage with BLOCKED status and reason
    stage_id = prod_stage['id']
    patch_r = client.patch(f"/api/stages/{stage_id}", json={
        'status': 'BLOCKED',
        'block_reason': 'توقف به دلیل عدم تامین ورق ۴ میلیمتر',
        'progress': 30
    })
    assert patch_r.status_code == 200
    st_data = patch_r.json()
    assert st_data['status'] == 'BLOCKED'
    assert st_data['block_reason'] == 'توقف به دلیل عدم تامین ورق ۴ میلیمتر'

    # 3. Check dashboard reflects blocked stage
    dash = client.get('/api/dashboard').json()
    assert dash['metrics']['blocked_count'] >= 1
    assert any(b['kind'] == 'stage' and b['order_id'] == oid for b in dash.get('blockers', []))

    # 4. Create and update a BLOCKED department task
    task_r = client.post('/api/tasks', json={
        'order_id': oid,
        'order_item_id': item['id'],
        'department': 'PURCHASE',
        'title': 'خرید رنگ الکترواستاتیک RAL 9005',
        'status': 'BLOCKED',
        'block_reason': 'عدم تایید پیش‌فاکتور توسط امور مالی'
    })
    assert task_r.status_code == 200
    task_data = task_r.json()
    assert task_data['status'] == 'BLOCKED'
    assert task_data['block_reason'] == 'عدم تایید پیش‌فاکتور توسط امور مالی'

    # 5. Check task listing
    tasks = client.get(f"/api/tasks?order_id={oid}").json()
    assert any(t['id'] == task_data['id'] and t['status'] == 'BLOCKED' for t in tasks)

    # 6. Unblock the stage and task
    unblock_r = client.patch(f"/api/stages/{stage_id}", json={
        'status': 'IN_PROGRESS',
        'progress': 60
    })
    assert unblock_r.status_code == 200
    assert unblock_r.json()['status'] == 'IN_PROGRESS'
    assert unblock_r.json()['block_reason'] is None

    unblock_task = client.patch(f"/api/tasks/{task_data['id']}", json={'status': 'IN_PROGRESS'})
    assert unblock_task.status_code == 200
    assert unblock_task.json()['status'] == 'IN_PROGRESS'


def test_qc_gates_and_ncr():
    # 1. Check QC summary
    summary_r = client.get('/api/qc/summary')
    assert summary_r.status_code == 200
    summary = summary_r.json()
    assert 'total_inspections' in summary and 'gates' in summary

    # 2. Fetch an item
    orders = client.get('/api/orders').json()
    assert len(orders) >= 1
    oid = orders[0]['id']
    detail = client.get(f"/api/orders/{oid}").json()
    item = detail['items'][0]
    item_id = item['id']

    # 3. Create a QC inspection for COATING
    insp_r = client.post('/api/qc/inspections', json={
        'order_item_id': item_id,
        'gate_type': 'COATING',
        'inspector_name': 'مهندس احمدی (QC)',
        'result': 'PASSED',
        'measured_values': {'coating_thickness_microns': 85.5},
        'check_items': {'adhesion_test_ok': True, 'surface_uniformity': True},
        'remarks': 'ضخامت پوشش گالوانیزه استاندارد است'
    })
    assert insp_r.status_code == 200
    insp_data = insp_r.json()
    assert insp_data['gate_type'] == 'COATING'
    assert insp_data['result'] == 'PASSED'

    # 4. List inspections
    list_r = client.get(f"/api/qc/inspections?order_item_id={item_id}")
    assert list_r.status_code == 200
    inspections = list_r.json()
    assert any(i['id'] == insp_data['id'] for i in inspections)

    # 5. Create a CRITICAL NCR report
    ncr_r = client.post('/api/qc/ncrs', json={
        'order_item_id': item_id,
        'qc_inspection_id': insp_data['id'],
        'defect_title': 'اعوجاج بیس‌پلیت بیش از حد مجاز',
        'defect_type': 'DEFORMATION',
        'severity': 'CRITICAL',
        'description': 'تابیدگی ۳ میلیمتری در صفحه بیس‌پلیت پس از جوش لچکی‌ها',
        'root_cause': 'حرارت ورودی بیش از حد حین جوشکاری CO2',
        'disposition': 'PENDING',
        'status': 'OPEN'
    })
    assert ncr_r.status_code == 200
    ncr_data = ncr_r.json()
    assert 'NCR-' in ncr_data['ncr_number']
    assert ncr_data['severity'] == 'CRITICAL'

    # 6. Verify that item's QC stage was auto-BLOCKED by this NCR
    detail_blocked = client.get(f"/api/orders/{oid}").json()
    item_blocked = next(it for it in detail_blocked['items'] if it['id'] == item_id)
    qc_stage = next(st for st in item_blocked['stages'] if st['stage_key'] == 'QC')
    assert qc_stage['status'] == 'BLOCKED'
    assert 'NCR-' in (qc_stage['block_reason'] or '')

    # 7. Verify dashboard includes this NCR in blockers and metrics
    dash = client.get('/api/dashboard').json()
    assert dash['metrics']['open_ncrs_count'] >= 1
    assert any(b['kind'] == 'ncr' and b.get('ncr_number') == ncr_data['ncr_number'] for b in dash['blockers'])

    # 8. Resolve the NCR and any other open NCR on this item
    patch_ncr = client.patch(f"/api/qc/ncrs/{ncr_data['id']}", json={
        'disposition': 'REWORK',
        'disposition_notes': 'پرس‌کاری سرد بیس‌پلیت جهت رفع تابیدگی و بازرسی مجدد با خط‌کش مهندسی',
        'disposition_by': 'مهندس کاظمی',
        'status': 'RESOLVED'
    })
    assert patch_ncr.status_code == 200
    resolved_ncr = patch_ncr.json()
    assert resolved_ncr['status'] == 'RESOLVED'
    assert resolved_ncr['disposition'] == 'REWORK'
    assert resolved_ncr['resolved_at'] is not None

    for other_ncr in client.get(f"/api/qc/ncrs?order_item_id={item_id}").json():
        if other_ncr['status'] in ('OPEN', 'IN_REWORK'):
            client.patch(f"/api/qc/ncrs/{other_ncr['id']}", json={'status': 'RESOLVED', 'disposition': 'REWORK'})

    # 9. Verify QC stage is automatically unblocked
    detail_unblocked = client.get(f"/api/orders/{oid}").json()
    item_unblocked = next(it for it in detail_unblocked['items'] if it['id'] == item_id)
    qc_stage_unblocked = next(st for st in item_unblocked['stages'] if st['stage_key'] == 'QC')
    assert qc_stage_unblocked['status'] != 'BLOCKED'


def test_bom_and_materials():
    # 1. Fetch an order item
    orders = client.get('/api/orders').json()
    assert len(orders) >= 1
    oid = orders[0]['id']
    detail = client.get(f"/api/orders/{oid}").json()
    item = detail['items'][0]
    item_id = item['id']

    # 2. Get BOM for this item
    bom_r = client.get(f"/api/items/{item_id}/bom")
    assert bom_r.status_code == 200
    bom_data = bom_r.json()
    assert 'items' in bom_data and 'summary' in bom_data
    assert bom_data['summary']['items_count'] >= 5
    assert bom_data['summary']['steel_weight_per_pole_kg'] > 0
    assert any(b['material_category'] == 'BODY_SHEET' for b in bom_data['items'])

    # 3. Add a custom material item with shortage
    add_r = client.post(f"/api/items/{item_id}/bom", json={
        'material_category': 'ELECTRICAL',
        'material_name': 'پروژکتور ال‌ای‌دی ۱۵۰ وات SMD',
        'spec': 'پروژکتور خیابانی ضدآب IP66 چیپ اسرام',
        'quantity_per_pole': 2.0,
        'unit': 'PIECE',
        'estimated_unit_cost': 1850000.0,
        'procurement_status': 'PURCHASE_REQUIRED',
        'notes': 'نیاز به خرید فوری توسط بازرگانی'
    })
    assert add_r.status_code == 200
    added = add_r.json()
    assert added['material_name'] == 'پروژکتور ال‌ای‌دی ۱۵۰ وات SMD'
    assert added['procurement_status'] == 'PURCHASE_REQUIRED'

    # 4. Check that has_shortage is now true
    bom_updated = client.get(f"/api/items/{item_id}/bom").json()
    assert bom_updated['summary']['has_shortage'] is True
    assert bom_updated['summary']['status_counts']['PURCHASE_REQUIRED'] >= 1

    # 5. Check procurement summary
    mat_summary = client.get('/api/procurement/materials-summary').json()
    assert 'by_category' in mat_summary
    assert mat_summary['shortage_count'] >= 1

    # 6. Update BOM item to ORDERED
    bom_id = added['id']
    patch_r = client.patch(f"/api/bom/{bom_id}", json={
        'procurement_status': 'ORDERED',
        'supplier_name': 'شرکت گلنور روشنایی',
        'notes': 'پیش‌فاکتور تأیید و سفارش‌گذاری شد'
    })
    assert patch_r.status_code == 200
    assert patch_r.json()['procurement_status'] == 'ORDERED'
    assert patch_r.json()['supplier_name'] == 'شرکت گلنور روشنایی'

    # 7. Delete custom BOM item
    del_r = client.delete(f"/api/bom/{bom_id}")
    assert del_r.status_code == 200
    assert del_r.json()['ok'] is True


def test_baselines_and_milestones():
    # 1. Projects listing includes schedule intelligence
    prjs = client.get('/api/projects').json()
    assert len(prjs) >= 1
    p = prjs[0]
    assert 'schedule_variance' in p
    assert 'schedule_status' in p
    assert 'active_baseline' in p

    pid = p['id']

    # 2. Project detail includes baselines and milestones
    p_detail = client.get(f"/api/projects/{pid}").json()
    assert 'baselines' in p_detail
    assert 'milestones' in p_detail
    assert 'milestones_summary' in p_detail
    assert len(p_detail['baselines']) >= 1
    assert len(p_detail['milestones']) >= 1
    m0 = p_detail['milestones'][0]
    assert {'milestone_code', 'title', 'baseline_date', 'status', 'variance_days'}.issubset(m0)

    # 3. Schedule endpoint
    sch = client.get(f"/api/projects/{pid}/schedule").json()
    assert 'schedule_variance_days' in sch
    assert 'schedule_status' in sch
    assert 'stage_dependencies' in sch
    assert 'PURCHASE' in sch['stage_dependencies']

    # 4. Create new baseline snapshot (Rev 2)
    b_new = client.post(f"/api/projects/{pid}/baselines", json={
        'baseline_name': 'خط مبنای بازنگری‌شده (Rev 1)',
        'planned_start': '2026-09-01',
        'planned_finish': '2026-11-30',
        'notes': 'تصویب تمدید زمان توسط کارفرما',
        'is_active': True
    })
    assert b_new.status_code == 200
    b_data = b_new.json()
    assert b_data['baseline_version'] >= 2
    assert b_data['is_active'] == 1

    # 5. Add custom milestone
    m_new = client.post(f"/api/projects/{pid}/milestones", json={
        'milestone_code': 'M-TEST',
        'title': 'آزمون بارگذاری خمشی در آزمایشگاه مرجع',
        'stage_key': 'QC',
        'baseline_date': '2026-10-15',
        'status': 'PLANNED',
        'notes': 'الزام استاندارد ملی سازه'
    })
    assert m_new.status_code == 200
    m_data = m_new.json()
    mid = m_data['id']
    assert m_data['milestone_code'] == 'M-TEST'

    # 6. Update milestone to ACHIEVED
    m_patch = client.patch(f"/api/milestones/{mid}", json={
        'status': 'ACHIEVED',
        'notes': 'آزمون با تأیید بازرس استاندارد پاس شد'
    })
    assert m_patch.status_code == 200
    assert m_patch.json()['status'] == 'ACHIEVED'
    assert m_patch.json()['actual_date'] is not None

    # 7. Delete test milestone
    m_del = client.delete(f"/api/milestones/{mid}")
    assert m_del.status_code == 200
    assert m_del.json()['ok'] is True

    # 8. Check stage dependency enrichment on order
    orders = client.get('/api/orders').json()
    if orders:
        ord_detail = client.get(f"/api/orders/{orders[0]['id']}").json()
        if ord_detail.get('items'):
            stg = ord_detail['items'][0]['stages']
            assert len(stg) >= 1
            # Purchase stage should have predecessor info
            purchase_stg = next((s for s in stg if s.get('stage_key') == 'PURCHASE'), None)
            if purchase_stg:
                assert purchase_stg['predecessor_key'] == 'DESIGN'
                assert 'predecessor_done' in purchase_stg


def test_control_tower_and_system_events():
    # 1. Test Control Tower Summary 4 Pillars
    r = client.get('/api/control-tower/summary')
    assert r.status_code == 200
    data = r.json()
    assert {'schedule', 'quality', 'materials', 'finance', 'recent_events'}.issubset(data)

    # Pillar 1: Schedule
    sch = data['schedule']
    assert {'total_active_projects', 'on_track_count', 'at_risk_count', 'delayed_count', 'blocked_stages_count'}.issubset(sch)
    assert sch['total_active_projects'] >= 1

    # Pillar 2: Quality
    q = data['quality']
    assert {'total_inspections', 'passed_inspections', 'first_pass_yield', 'open_ncrs_count'}.issubset(q)
    assert 0.0 <= q['first_pass_yield'] <= 100.0

    # Pillar 3: Materials
    mat = data['materials']
    assert {'steel_weight_kg', 'steel_weight_ton', 'shortage_count', 'ordered_count', 'in_stock_count'}.issubset(mat)

    # Pillar 4: Finance
    fin = data['finance']
    assert {'total_contract_value', 'total_paid', 'total_balance', 'collection_rate'}.issubset(fin)

    # Events list
    assert isinstance(data['recent_events'], list)
    assert len(data['recent_events']) >= 1

    # 2. Test manual System Event POST
    post_ev = client.post('/api/system-events', json={
        'event_type': 'TEST_ALERT',
        'severity': 'WARNING',
        'title': 'هشدار آزمایشی برج کنترل',
        'message': 'این رویداد به عنوان تست جامع گام ۶ در سیستم ثبت شد.',
        'actor': 'مهندس ناظر',
        'entity_type': 'test',
        'entity_id': 999,
        'metadata': {'test_key': 'test_val'}
    })
    assert post_ev.status_code == 200
    created_ev = post_ev.json()
    assert created_ev['id'] > 0
    assert created_ev['event_type'] == 'TEST_ALERT'
    assert created_ev['severity'] == 'WARNING'

    # 3. Test System Events GET list and filtering
    events_r = client.get('/api/system-events?limit=20')
    assert events_r.status_code == 200
    ev_data = events_r.json()
    assert 'items' in ev_data and 'total' in ev_data and 'severity_counts' in ev_data
    assert ev_data['total'] >= 1
    assert 'WARNING' in ev_data['severity_counts']

    # Filter by event_type
    filtered_r = client.get('/api/system-events?event_type=TEST_ALERT')
    assert filtered_r.status_code == 200
    filtered_data = filtered_r.json()
    assert any(x['id'] == created_ev['id'] for x in filtered_data['items'])


if __name__ == '__main__':
    test_health()
    test_dashboard()
    test_customer_summary()
    test_projects_and_pole_specs()
    test_weighted_progress_and_blockers()
    test_qc_gates_and_ncr()
    test_bom_and_materials()
    test_baselines_and_milestones()
    test_control_tower_and_system_events()
    print("ALL API TESTS PASSED SUCCESSFULLY!")



