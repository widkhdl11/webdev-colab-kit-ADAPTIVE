-- 선물함 이름 1~14자 · 간단한 설명 0~36자로 낮춘다(2026-11-11 사용자 「카드 폭을 좁히고 글자 제한을 적절하게」).
-- 근거: 카드 폭 288 에서 상태 뱃지 옆 이름 칸은 한 줄 7자·두 줄 14자, 설명은 두 줄 38자(실측).
--
-- 운영에 이미 긴 이름·설명이 있을 수 있다. 그 행은 그대로 둔다(카드에서 두 줄 말줄임).
-- 표의 check 제약(이름 1~40자 · 설명 1~100자)은 그대로 둔다 — 새 한도를 check 로 걸면 `not valid` 로 붙여도
-- 옛 행의 상태를 바꾸는 UPDATE 마다 새 한도로 다시 검사돼 긴 이름의 선물함이 마감·전환되지 않는다.
-- 그래서 새 한도는 「새로 쓰는 값」만 보는 트리거로 건다 — INSERT, 또는 이름·설명이 바뀌는 UPDATE 일 때만.
--
-- 한도 값은 규칙 함수(revgift_box_rules)의 name_max · description_max 한 곳에 둔다. 만들기 함수와 트리거가 그 값을 읽는다.
-- 만들기 함수의 크리에이터 판정(auth.uid() 한 줄, INV-GB7) · 인원·공개 검사 · 금칙어 필터 · 초대 토큰은
-- 20261111000020 본문 그대로다(revgift-box INV-GB3). 설명 길이 검사만 상수 100 → 규칙 값으로 바꿨다.
-- 다시 돌려도 결과가 같다.

-- ── 규칙 값 ────────────────────────────────────────────
-- 20261109000040 값에서 name_max 40 → 14, description_max 36 을 더했다. 나머지는 그대로다.
create or replace function public.revgift_box_rules()
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'capacity_max', 100,        -- INV-GB3 받을 인원
    'name_max', 14,             -- INV-GB3 이름 (Q3, 2026-11-11 40 → 14)
    'description_max', 36,      -- 간단한 설명(2026-11-11 100 → 36)
    'early_max_rank', 50,       -- INV-GB14 초기 크리에이터(혜택은 계정을 유지하는 동안 — 2026-11-09)
    'early_monthly_lines', 30,  -- INV-GB15 한 달 300원 줄
    'personal_max_krw', 100000, -- INV-GB16 개인접수 실비 상한 (Q13)
    'cod_max_krw', 100000,      -- INV-GB13 착불 큰 상자 택배비 상한 (Q13)
    'tier_limits', jsonb_build_array(                                   -- INV-GB12 실측 구간(작은 것부터)
      jsonb_build_object('tier', 'xsmall', 'size_cm', 80, 'weight_kg', 2),
      jsonb_build_object('tier', 'small', 'size_cm', 100, 'weight_kg', 5),
      jsonb_build_object('tier', 'medium', 'size_cm', 120, 'weight_kg', 10),
      jsonb_build_object('tier', 'large', 'size_cm', 140, 'weight_kg', 15)),
    'carton_count_max', 100,    -- INV-GB11 보낸 상자 수(1 이상 — 상한은 선물함 받을 인원과 같게)
    'carton_wait_hours', 168,   -- INV-GB11 첫 큰 상자 입고 뒤 도착 안 함까지
    'awaiting_box_hours', 720,  -- INV-GB1 Q10 「다음」 뒤 큰 상자가 하나도 없으면 자동 취소
    'hold_hours', 168,          -- INV-GB12 Q11 확인 필요 카드 기한
    'cancelled_arrival_hours', 168, -- INV-GB23 취소한 선물함 상자 카드 기한
    'pay_due_hours', 72,        -- INV-GB18 결제 기한(명세서 발행 + 72시간 → 결제 기한 지남)
    'unpaid_return_hours', 168, -- INV-GB19 명세서 발행 + 168시간까지 결제가 없으면 착불 반송
    'pending_payment_hours', 24, -- INV-GB18 결제 대기는 만든 지 24시간이 지나면 닫힌다(payment INV-M15)
    'copy_after_ship_hours', 72, -- INV-GB20 출고 확정 + 72시간에 사본 삭제(reverse-gift INV-R9)
    'print_max', 3              -- INV-GB20 한 신청에 주소 열기 최대 3회(다시 출력 포함)
  )
$$;

-- ── 새로 쓰는 값의 한도 ────────────────────────────────
create or replace function public.revgift_boxes_text_limits()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_rules jsonb := public.revgift_box_rules();
begin
  if (tg_op = 'INSERT' or new.name is distinct from old.name)
     and char_length(new.name) > (v_rules ->> 'name_max')::integer then
    raise exception '선물함 이름 꼴이 틀리다' using errcode = '22023';
  end if;
  if new.description is not null and (tg_op = 'INSERT' or new.description is distinct from old.description)
     and char_length(new.description) > (v_rules ->> 'description_max')::integer then
    raise exception '간단한 설명이 너무 길다' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists revgift_boxes_text_limits on public.revgift_boxes;
create trigger revgift_boxes_text_limits
  before insert or update of name, description on public.revgift_boxes
  for each row execute function public.revgift_boxes_text_limits();

-- ── 만들기 ──────────────────────────────────
create or replace function public.create_revgift_box(p_name text, p_capacity integer, p_is_public boolean, p_description text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_rules jsonb := public.revgift_box_rules();
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := public.app_trim(coalesce(p_description, ''));
  v_problem text;
  v_token text;
  v_id uuid;
begin
  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where auth.uid() is not null and c.profile_id = auth.uid() and p.role = 'creator';
  if v_creator_id is null then
    raise exception '크리에이터만 선물함을 만든다' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > (v_rules ->> 'name_max')::integer then
    raise exception '선물함 이름 꼴이 틀리다' using errcode = '22023';
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > (v_rules ->> 'capacity_max')::integer then
    raise exception '받을 인원 꼴이 틀리다' using errcode = '22023';
  end if;
  if p_is_public is null then
    raise exception '공개 여부가 없다' using errcode = '22023';
  end if;
  -- 간단한 설명: 0~규칙 값(description_max)자, 팬을 부르는 이름과 같은 글자 규칙과 같은 필터
  if char_length(v_description) > (v_rules ->> 'description_max')::integer then
    raise exception '간단한 설명이 너무 길다' using errcode = '22023';
  end if;
  if v_description ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    raise exception '간단한 설명에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  if v_description <> '' then
    v_problem := public.creator_tag_text_problem(v_description);
    if v_problem = 'banned' then
      raise exception '간단한 설명에 쓸 수 없는 말이 들어 있다' using errcode = 'P0087';
    elsif v_problem = 'contact' then
      raise exception '간단한 설명에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0088';
    elsif v_problem = 'symbols' then
      raise exception '간단한 설명에 글자나 숫자가 하나는 있어야 한다' using errcode = 'P0089';
    end if;
  end if;
  if not p_is_public then
    v_token := public.revgift_box_new_token();
  end if;
  insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, invite_token, description)
  values (auth.uid(), v_creator_id, v_name, p_capacity, p_is_public, v_token, nullif(v_description, ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end $$;

revoke all on function public.create_revgift_box(text, integer, boolean, text) from public, anon, service_role;
grant execute on function public.create_revgift_box(text, integer, boolean, text) to authenticated;
