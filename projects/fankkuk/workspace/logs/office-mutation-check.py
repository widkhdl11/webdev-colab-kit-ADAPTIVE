import re, subprocess, sys
ROOT = r'C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk'
mig = open(ROOT + '/supabase/migrations/20261005000007_office_workflow.sql', encoding='utf-8').read()


def block(name):
    m = re.search(r'create (?:or replace )?function public\.' + name + r'\(.*?\n(?:end \$\$;|\$\$;)\n', mig, re.S)
    assert m, name
    return re.sub(r'^create (or replace )?function', 'create or replace function', m.group(0))


def psql(sql):
    return subprocess.run(['docker', 'exec', '-i', 'supabase_db_fankkuk', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], input=sql.encode(), capture_output=True)


OP = "if not public.is_operator() then"
F = "if false then"
M = [
    ('inbound: operator', 'office_scan_inbound', OP, F),
    ('inbound: pending W2', 'office_scan_inbound', "if exists (select 1 from public.office_label_pending where operator_id = auth.uid()) then", F),
    ('inbound: lock', 'office_scan_inbound', "where inbound_waybill_no = p_waybill for update;", "where inbound_waybill_no = p_waybill; perform pg_sleep(0.3);"),
    ('inbound: reprint guard', 'office_scan_inbound', "if v.state = 'received' and v.labeled_at is null\n     and not exists (select 1 from public.office_label_pending where parcel_id = v.id) then", "if v.state = 'received' then"),
    ('waybill format', 'office_check_waybill', "if p_no is null or p_no !~ '^[0-9]{10,14}$' then", "if p_no is null then"),
    ('qr format', 'office_lock_qr', "if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then", "if p_qr is null then"),
    ('label: operator', 'office_confirm_label', OP, F),
    ('label: state', 'office_confirm_label', "if v.state <> 'received' then", F),
    ('label: mismatch', 'office_confirm_label', "if not exists (select 1 from public.office_label_pending where operator_id = auth.uid() and parcel_id = v.id) then", F),
    ('unmatched: operator', 'office_record_unmatched', OP, F),
    ('unmatched: initial', 'office_record_unmatched', "if char_length(coalesce(p_sender_initial, '')) <> 1 or", "if false or"),
    ('match: owner', 'match_unmatched', "where b.id = p_box_id and o.fan_id = auth.uid() and", "where b.id = p_box_id and"),
    ('match: deadline', 'match_unmatched', "\n      and arrived_at > now() - interval '168 hours'", ""),
    ('match: already matched', 'match_unmatched', "where waybill_no = p_waybill and matched_parcel_id is null and expired_at is null", "where waybill_no = p_waybill and expired_at is null"),
    ('insp: operator', 'office_record_inspection', OP, F),
    ('insp: state', 'office_record_inspection', "if v.state <> 'labeled' then", F),
    ('insp: values', 'office_record_inspection', "if exists (select 1 from jsonb_each_text(p_result) e where e.key <> 'outcome' and e.value not in ('clear', 'found'))\n     or", "if"),
    ('insp: fan keys', 'office_record_inspection', "if v_keys is distinct from array['bluetooth', 'metal', 'outcome', 'rf'] then", F),
    ('insp: tracker hold', 'office_record_inspection', "if v_tracker <> (v_outcome = 'hold') then", F),
    ('insp: share keys', 'office_record_inspection', "if v_keys is distinct from array['outcome', 'prohibited', 'surface'] then", F),
    ('insp: share found', 'office_record_inspection', "if v_outcome = 'hold' or (v_found and v_outcome <> 'return') then", F),
    ('scan insp: operator', 'office_scan_inspect', OP, F),
    ('scan insp: state', 'office_scan_inspect', "if v.state <> 'labeled' then", F),
    ('scan insp: record W4', 'office_scan_inspect', "if v_outcome is null then\n    raise", "if false then\n    raise"),
    ('scan insp: dead', 'office_scan_inspect', "when v_outcome = 'return' or public.office_parcel_dead(v) then", "when v_outcome = 'return' then"),
    ('scan insp: alert', 'office_scan_inspect', "if v_next = 'held' then", F),
    ('print: owner', 'office_print_label', "if not public.is_owner() then", F),
    ('print: state', 'office_print_label', "if v.state <> 'inspected' then", F),
    ('print: shippable', 'office_print_label', "if not public.office_parcel_shippable(v) then", F),
    ('ship: approval', 'office_parcel_shippable', "        and o.approved_at is not null\n", ""),
    ('ship: difference', 'office_parcel_shippable', "        and not exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')\n", ""),
    ('ship: share accepted', 'office_parcel_shippable', "and s.reply = 'accepted'", ""),
    ('ship: order dead', 'office_parcel_shippable', "        and o.status not in ('rejected', 'expired', 'canceled')\n", ""),
    ('shipment: operator', 'office_confirm_shipment', OP, F),
    ('shipment: state', 'office_confirm_shipment', "if v.state <> 'label_printed' then", F),
    ('shipment: waybill', 'office_confirm_shipment', "if v.outbound_waybill_no is distinct from p_waybill then", F),
    ('shipment: shred', 'office_confirm_shipment', "  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());\n", ""),
    ('ret print: state', 'office_print_return_label', "if v.state <> 'return_waiting' then", F),
    ('ret confirm: waybill', 'office_confirm_return', "if v.return_waybill_no is distinct from p_waybill then", F),
    ('ret confirm: shred', 'office_confirm_return', "  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());\n", ""),
    ('approve: deadline', 'approve_request', "      and v_now < o.registered_at + interval '168 hours'\n", ""),
    ('expiry: operator', 'office_run_expiry', "if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then", F),
    ('expiry: gift 168', 'office_run_expiry', "      and o.registered_at <= now() - interval '168 hours'", "      and o.registered_at <= now() - interval '167 hours'"),
    ('expiry: unmatched', 'office_run_expiry', "where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'", "where false"),
    ('expiry: diff 168', 'office_run_expiry', "        and d.created_at <= now() - interval '168 hours'", "        and d.created_at <= now() - interval '167 hours'"),
    ('expiry: dead parcels', 'office_run_expiry', "  where p.state = 'inspected' and public.office_parcel_dead(p);", "  where false;"),
    ('expiry: revgifts', 'office_run_expiry', "    v_revgifts := public.expire_revgifts();", "    v_revgifts := 0;"),
    ('set box: owner', 'set_box_waybill', "where b.id = p_box_id and o.fan_id = auth.uid()", "where b.id = p_box_id"),
    ('set box: received', 'set_box_waybill', "  else\n    raise exception '이미 입고된 상자다' using errcode = '55000';", "  else\n    update public.office_parcels set inbound_waybill_no = p_waybill where id = v.id;"),
    ('set share: owner', 'set_share_waybill', "where s.id = p_share_id and d.sender_id = auth.uid()", "where s.id = p_share_id"),
    ('read parcels filter', 'admin_office_parcels', "  where public.is_operator()\n", "  where true\n"),
    ('read unmatched filter', 'admin_unmatched_parcels', "  where public.is_operator()\n", "  where true\n"),
    ('run one: filter', 'office_run_expiry', "      and (p_order_no is null or o.order_no = p_order_no)\n", ""),
    ('next step shippable', 'office_next_step', "when public.office_parcel_shippable(p_parcel) then 'print_label'", "when true then 'print_label'"),
    ('pending label mine', 'office_my_pending_label', "where l.operator_id = auth.uid() and", "where"),
    ('by qr operator', 'office_parcel_by_qr', "  if not public.is_operator() then\n    return;", "  if false then\n    return;"),
    ('by qr notfound', 'office_parcel_by_qr', "  if not found then", "  if false then"),
    ('expiry due filter', 'admin_expiry_due', "  where public.is_operator()\n", "  where true\n"),
    ('expiry due 168', 'admin_expiry_due', "      and o.registered_at <= now() - interval '168 hours'\n    union all", "    union all"),
    ('revgift shares filter', 'admin_revgift_shares', "  where public.is_operator()\n", "  where true\n"),
    ('my boxes owner', 'my_gift_boxes', "and o.fan_id = auth.uid()", ""),
    ('my shares owner', 'my_share_boxes', "where d.sender_id = auth.uid() and", "where"),
    ('insp: once', 'office_record_inspection', "if exists (select 1 from public.office_inspections i where i.parcel_id = v.id) then", F),
    ('insp: null value', 'office_record_inspection', "(e.value is null or e.value not in ('clear', 'found'))", "(e.value not in ('clear', 'found'))"),
    ('sync: received_at any status', 'office_sync_order', "  where o.id = p_order_id and o.received_at is null\n", "  where false\n"),
    ('sync: no regress', 'office_sync_order', "  v_min := greatest(v_min, coalesce(v_now, 0));", "  v_min := v_min;"),
    ('sync: terminal excluded', 'office_sync_order', "filter (where p.state is null or p.state not in ('held', 'returned'))", "filter (where true)"),
    ('match: rate limit', 'match_unmatched', "a.at > now() - interval '24 hours') >= 10 then", "a.at > now() - interval '24 hours') >= 1000 then"),
    ('unmatched: recorded twice', 'office_record_unmatched', "\n     or exists (select 1 from public.office_unmatched where waybill_no = p_waybill) then", " then"),
    ('inbound: recorded flag', 'office_scan_inbound', "case when exists (select 1 from public.office_unmatched u where u.waybill_no = p_waybill) then 'unmatched_recorded' else 'unmatched' end", "'unmatched'"),
    ('next step dead', 'office_next_step', "                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'\n", ""),
    ('run one: dead filter', 'office_run_expiry', "\n    and (p_order_no is null\n         or exists", "\n    and (true\n         or exists"),
    ('sync min', 'office_sync_order', "  select min(coalesce(", "  select max(coalesce("),
]
only = sys.argv[1:]
for label, fn, old, new in M:
    if only and label not in only:
        continue
    orig = block(fn)
    if old not in orig:
        print('MISSING ' + label, flush=True)
        continue
    r = psql(orig.replace(old, new, 1))
    if r.returncode != 0:
        print('APPLYFAIL ' + label + ' ' + r.stderr.decode()[:200], flush=True)
        psql(orig)
        continue
    t = subprocess.run('npx vitest run --config vitest.integration.config.mts tests/integration/office-workflow-db.integration.test.ts tests/integration/office-reads-db.integration.test.ts tests/integration/office-review-db.integration.test.ts', shell=True, cwd=ROOT, capture_output=True)
    out = t.stdout.decode('utf-8', 'replace')
    m = re.search(r'Tests\s+(.*)', out)
    print(('RED   ' if t.returncode != 0 else 'GREEN ') + label + ' :: ' + (m.group(1).strip() if m else '?'), flush=True)
    r = psql(orig)
    assert r.returncode == 0, ('restore', label, r.stderr.decode())
