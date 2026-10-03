-- 역조공 팬 주소 — 받기(주소 저장)와 몫 닫기(주소 지우기). 스펙: docs/specs/reverse-gift.md (INV-R4·R5·R6·R9·R10)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 마이그레이션 20261004000002_reverse_gifts.sql 다음에 적용한다.
--
-- 적용(로컬, PowerShell — `!` 명령도 PowerShell 로 돈다):
--   Get-Content projects/fankkuk/supabase/manual/0005_revgift_address.sql -Raw -Encoding utf8 | docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- 오류 코드: 22023 봉인 형식이 아님 · P0002 없는 몫(남의 몫·결제 전 포함 — 같은 답) · P0022 지금 상태에서는 받을 수 없음
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 몫 하나에 주소 하나(INV-R6). 다른 몫·내 정보와 이어지지 않는다 — 열쇠가 몫 id 뿐이다.
-- 값은 팬 브라우저에서 봉인된 봉투(INV-R5): 주소·받는 사람 이름·전화번호와 그 몫의 주문번호를 함께 봉인한 것.
create table pii.revgift_addresses (
  share_id uuid primary key references public.revgift_shares (id) on delete cascade,
  envelope jsonb not null,
  created_at timestamptz not null default now()
);
alter table pii.revgift_addresses enable row level security;

-- 봉인 형식 검사 — 앱 쪽 parseEnvelope 와 같은 모양만 받는다(키 다섯 개, 판 1, 알고리즘 이름, base64 세 칸).
-- 길이는 base64 글자 수로 본다: 감싼 키 256바이트 이상 = 344자 이상, IV 12바이트 = 16자, 암호문 17바이트 이상 = 24자 이상.
create function pii.is_sealed_envelope(p jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and (select array_agg(k order by k) from jsonb_object_keys(p) k) = array['alg', 'ciphertext', 'iv', 'v', 'wrappedKey']
     and p -> 'v' = '1'::jsonb
     and p ->> 'alg' = 'RSA-OAEP-256+A256GCM'
     and jsonb_typeof(p -> 'wrappedKey') = 'string' and (p ->> 'wrappedKey') ~ '^[A-Za-z0-9+/]+={0,2}$' and length(p ->> 'wrappedKey') >= 344
     and jsonb_typeof(p -> 'iv') = 'string' and (p ->> 'iv') ~ '^[A-Za-z0-9+/]+={0,2}$' and length(p ->> 'iv') = 16
     and jsonb_typeof(p -> 'ciphertext') = 'string' and (p ->> 'ciphertext') ~ '^[A-Za-z0-9+/]+={0,2}$' and length(p ->> 'ciphertext') >= 24;
$$;

alter table pii.revgift_addresses add constraint revgift_addresses_sealed check (pii.is_sealed_envelope(envelope));

-- ── 팬: 받기(INV-R4·R10) ────────────────────────────────

-- 로그인한 팬 본인의 몫에만 주소가 들어간다. 몫 줄을 잠근 뒤 확인하고 저장한다 —
-- 같은 몫의 받기 두 번, 받기와 기한 처리가 겹쳐도 하나만 반영된다.
create function public.accept_revgift(p_order_no text, p_envelope jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_send public.revgift_sends;
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found or auth.uid() is null or v_share.fan_id is distinct from auth.uid() then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select * into v_send from public.revgift_sends where id = v_share.send_id;
  if v_send.status <> 'done' then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.reply <> 'waiting'
     or v_share.returned_at is not null or v_share.cancelled_at is not null
     or now() >= public.revgift_deadline(v_send.settled_at) then
    raise exception '지금은 받을 수 없다' using errcode = 'P0022';
  end if;

  insert into pii.revgift_addresses (share_id, envelope) values (v_share.id, p_envelope);
  update public.revgift_shares set reply = 'accepted', replied_at = now() where id = v_share.id;
end $$;

-- ── 몫 닫기(앱 서버 전용, INV-R9) ───────────────────────

-- 출고 확정·반송·취소. 상태를 바꾸는 같은 처리 안에서 주소를 지운다.
create function public.close_revgift_share(p_order_no text, p_outcome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
begin
  if p_outcome not in ('shipped', 'returned', 'cancelled') then
    raise exception 'shipped·returned·cancelled 만' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.shipped_at is not null or v_share.returned_at is not null or v_share.cancelled_at is not null then
    raise exception '이미 닫힌 몫이다' using errcode = 'P0022';
  end if;

  if p_outcome = 'shipped' then
    -- 출고는 받기를 했고 검수가 끝난 몫만(표의 제약도 같은 것을 막는다)
    if v_share.reply <> 'accepted' or v_share.inspected_at is null then
      raise exception '받기와 검수가 끝난 몫만 출고한다' using errcode = 'P0022';
    end if;
    update public.revgift_shares set shipped_at = now() where id = v_share.id;
  elsif p_outcome = 'returned' then
    update public.revgift_shares set returned_at = now() where id = v_share.id;
  else
    update public.revgift_shares set cancelled_at = now() where id = v_share.id;
  end if;

  delete from pii.revgift_addresses where share_id = v_share.id;
end $$;

revoke all on function pii.is_sealed_envelope(jsonb) from public, anon, authenticated;
revoke all on function public.accept_revgift(text, jsonb) from public, anon, service_role;
grant execute on function public.accept_revgift(text, jsonb) to authenticated;
revoke all on function public.close_revgift_share(text, text) from public, anon, authenticated;
grant execute on function public.close_revgift_share(text, text) to service_role;
-- 받기 함수는 security definer 라 주소 검사 함수를 소유자 권한으로 부른다. 화면 쪽 키는 pii 를 직접 못 본다.

commit;
