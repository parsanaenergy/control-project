"""Sanity test of the requested business flow against a temporary reset of the local DB."""
from pathlib import Path
import shutil
from fastapi.testclient import TestClient
from .db import DB_PATH
from .main import app

backup = DB_PATH.with_suffix('.backup_for_test')
if DB_PATH.exists(): shutil.copy2(DB_PATH, backup)
try:
    if DB_PATH.exists(): DB_PATH.unlink()
    with TestClient(app) as c:
        assert c.get('/api/health').status_code == 200
        # New customer must explicitly provide the first counter.
        rc=c.post('/api/customers',json={'name':'هوشمند','prefix':'HM','start_counter':12})
        assert rc.status_code==200, rc.text
        cust=rc.json(); assert cust['next_order_counter']==12
        order={'customer_id':cust['id'],'order_date':'2026-09-12','delivery_date':'2026-10-12','payment_due_date':'2026-10-12','registered_by':'test','items':[{'product_name':'محصول تست','quantity':10,'unit_price':1000,'galvanized':True,'galvanized_notes':'گرم'}]}
        ro=c.post('/api/orders',json=order); assert ro.status_code==200, ro.text
        oid=ro.json()['id']; assert ro.json()['order_no']=='HM12'
        d=c.get(f'/api/orders/{oid}').json(); item=d['items'][0]
        assert [s['stage_name_fa'] for s in item['stages']]==['طراحی','خرید','تولید','QC','بسته‌بندی','تحویل','وصول']
        # project note + product note
        assert c.post('/api/notes',json={'order_id':oid,'department':'PURCHASE','body':'یادداشت پروژه'}).status_code==200
        assert c.post('/api/notes',json={'order_id':oid,'order_item_id':item['id'],'department':'PURCHASE','body':'یادداشت محصول'}).status_code==200
        # Debt blocks first attempt.
        ship={'order_id':oid,'order_item_id':item['id'],'shipment_date':'2026-09-13','quantity':4,'override_debt':False}
        blocked=c.post('/api/shipments',json=ship); assert blocked.status_code==409
        # Override creates shipment + dashboard alarm.
        ship['override_debt']=True
        assert c.post('/api/shipments',json=ship).status_code==200
        dash=c.get('/api/dashboard').json(); assert any(a['order_id']==oid for a in dash['alerts'])
        # Full payment clears the debt shipment alarm.
        assert c.post('/api/payments',json={'order_id':oid,'payment_type':'واریز','amount':10000,'payment_date':'2026-09-14'}).status_code==200
        dash=c.get('/api/dashboard').json(); assert not any(a['order_id']==oid and a['active'] for a in dash['alerts'])
        # Remaining shipment must be 6.
        d=c.get(f'/api/orders/{oid}').json(); assert d['items'][0]['remaining_quantity']==6
        print('E2E OK: customer counter, order, stages, notes, debt guard, alert, payment, remaining shipment')
finally:
    if backup.exists():
        if DB_PATH.exists(): DB_PATH.unlink()
        shutil.move(backup, DB_PATH)
