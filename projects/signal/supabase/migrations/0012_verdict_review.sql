-- 판정 검토 — 핫이슈 판정을 사람이 매주 표본으로 채점한다 (docs/specs/verdict-review.md, 2026-09-24).
--
-- ── 무엇이 생기나 ────────────────────────────────────────────────────────────
-- verdict_review_week   한 주(ISO 주차, 한국 시간). 표본 추출 기록 + 답 시각 + 닫힘.
-- verdict_review_item   그 주의 표본 글. 뽑은 순간의 사본과 사람의 답.
-- verdict_review_run    주간 실행 한 번의 결과(성공·실패). 대시보드가 실패와 「안 돌았음」을 본다.
-- answer_verdict_item() 답 하나를 쓰는 유일한 길. 한 트랜잭션에서 잠그고·닫혔나 보고·쓴다.
-- create_verdict_week() 주와 표본을 한 트랜잭션에서 만든다 — 표본 0건인 주가 남지 않게.
--
-- ── 권한 (INV-VR9) ───────────────────────────────────────────────────────────
-- 세 테이블 모두 RLS 를 켜고 정책을 **하나도 만들지 않는다** — ingest_run(0005)과 같은 경계다.
-- 공개 키로는 읽지도 쓰지도 못하고, 서버가 secret 키로만 다룬다. 함수는 PUBLIC 이 기본으로
-- 실행할 수 있으므로 **실행 권한을 회수**한다(RLS 가 막아 주긴 하지만 한 겹에 기대지 않는다).
--
-- ── 다시 돌려도 안전한가 ──────────────────────────────────────────────────────
-- 전부 `if not exists` / `create or replace` / `drop ... if exists` 다. 데이터를 바꾸는 문장이 없다.
-- 적용 순서: **코드 배포 전에 적용한다.** 새 코드의 수집 실행이 이 테이블을 읽는다 — 테이블이 없으면
-- 주간 실행만 실패로 기록되고 수집은 그대로 돈다(INV-VR8). 반대 순서도 안전하다.

create table if not exists public.verdict_review_week (
  week text primary key
    check (week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
  extracted_at timestamptz not null,
  seed integer not null,
  pool_size integer not null check (pool_size >= 0),
  -- {"hot": n, "not_hot": n} — 상한·후보 부족으로 못 채운 수
  shortfall jsonb not null,
  first_answer_at timestamptz,
  -- 모든 글에 답이 생긴 순간. 한 번만 적힌다 — 걸린 시간의 끝(INV-VR4·VR6)
  completed_at timestamptz,
  -- 닫힘 표지(INV-VR5). 닫는 쪽이 집계를 읽기 **전에** 커밋한다. 있으면 답을 안 받는다.
  closing_at timestamptz,
  status text check (status in ('reviewed', 'unreviewed')),
  closed_at timestamptz,
  -- 닫힐 때의 집계 한 줄(정확도·방향별·질문별·출처별·오류 종류·걸린 분)
  summary jsonb,
  created_at timestamptz not null default now(),
  constraint verdict_review_week_closed_together
    check ((status is null) = (closed_at is null) and (status is null) = (summary is null)),
  constraint verdict_review_week_close_after_marker
    check (status is null or closing_at is not null)
);

create table if not exists public.verdict_review_item (
  week text not null references public.verdict_review_week (week) on delete cascade,
  -- item 행을 가리키되 FK 는 걸지 않는다: 표본은 사본을 들고 있어서 원본 글이 지워져도 채점 기록은 남아야 한다.
  item_id uuid not null,
  position smallint not null check (position between 1 and 40),
  hot boolean not null,
  -- 뽑은 순간의 사본 {title, source, source_name, url, judged_at, true_questions, reasons, summary}
  snapshot jsonb not null,
  answer text check (answer in ('correct', 'wrong', 'unsure')),
  direction text,
  answered_at timestamptz,
  primary key (week, item_id),
  unique (week, position),
  -- 방향은 틀리다에만, 그리고 판정에 맞는 것만(INV-VR3)
  constraint verdict_review_item_direction
    check (
      (answer is distinct from 'wrong' and direction is null)
      or (answer = 'wrong' and hot and direction in ('should_not_be_hot', 'wrong_reason', 'unknown'))
      or (answer = 'wrong' and not hot and direction = 'should_be_hot')
    ),
  constraint verdict_review_item_answered_at check ((answer is null) = (answered_at is null))
);

create table if not exists public.verdict_review_run (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  -- 한 줄. 실패면 무엇이 실패했는지, 성공이면 무엇을 했는지(뽑음·닫음·할 일 없음)
  message text not null check (char_length(message) <= 300)
);

create index if not exists verdict_review_run_ran_at_idx on public.verdict_review_run (ran_at desc);

alter table public.verdict_review_week enable row level security;
alter table public.verdict_review_item enable row level security;
alter table public.verdict_review_run enable row level security;
-- 정책을 만들지 않는다 — 의도적이다(위 「권한」).

-- ── 표본 칸은 다시 쓰지 않는다 (INV-VR2) ──────────────────────────────────────
-- 코드가 실수로 표본을 고쳐도 DB 가 거부한다. 바뀔 수 있는 것은 답 칸뿐이다.
create or replace function public.verdict_review_item_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.week is distinct from old.week
     or new.item_id is distinct from old.item_id
     or new.position is distinct from old.position
     or new.hot is distinct from old.hot
     or new.snapshot is distinct from old.snapshot then
    raise exception 'verdict_review_item: 표본 칸은 바꿀 수 없다 (INV-VR2)';
  end if;
  return new;
end $$;

drop trigger if exists verdict_review_item_freeze on public.verdict_review_item;
create trigger verdict_review_item_freeze
  before update on public.verdict_review_item
  for each row execute function public.verdict_review_item_freeze();

create or replace function public.verdict_review_week_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.week is distinct from old.week
     or new.extracted_at is distinct from old.extracted_at
     or new.seed is distinct from old.seed
     or new.pool_size is distinct from old.pool_size
     or new.shortfall is distinct from old.shortfall then
    raise exception 'verdict_review_week: 추출 기록은 바꿀 수 없다 (INV-VR2)';
  end if;
  -- 한 번 적힌 시각·닫힘은 되돌리지 않는다(INV-VR4·VR5)
  if old.first_answer_at is not null and new.first_answer_at is distinct from old.first_answer_at
     or old.completed_at is not null and new.completed_at is distinct from old.completed_at
     or old.closing_at is not null and new.closing_at is distinct from old.closing_at
     or old.status is not null and (new.status is distinct from old.status
                                    or new.summary is distinct from old.summary
                                    or new.closed_at is distinct from old.closed_at) then
    raise exception 'verdict_review_week: 한 번 적힌 시각·닫힘은 바꿀 수 없다 (INV-VR4·VR5)';
  end if;
  return new;
end $$;

drop trigger if exists verdict_review_week_freeze on public.verdict_review_week;
create trigger verdict_review_week_freeze
  before update on public.verdict_review_week
  for each row execute function public.verdict_review_week_freeze();

-- ── 답 하나 쓰기 (INV-VR3·VR4·VR5) ───────────────────────────────────────────
-- 돌려주는 값: {"ok": true} 또는 {"error": "<코드>"}. 코드: no_week · closed · no_item · bad_answer · bad_direction
-- 왜 함수인가: 「닫혔나 확인 → 답 쓰기 → 주의 시각 채우기」가 한 트랜잭션이어야 닫는 쪽과 순서가 선다.
-- 주의 행을 `for update` 로 잠근다 — 닫는 쪽의 표지 update 가 이 잠금을 기다리므로, 표지가 커밋된
-- 뒤에는 새 답이 없고 진행 중이던 답은 표지보다 먼저 끝난다.
-- (for share 로 잠그면 같은 주에 동시에 답한 두 트랜잭션이 둘 다 주 행을 고치려다 교착에 빠진다.)
create or replace function public.answer_verdict_item(
  p_week text, p_item uuid, p_answer text, p_direction text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  w public.verdict_review_week%rowtype;
  r public.verdict_review_item%rowtype;
  d text;
begin
  select * into w from public.verdict_review_week where week = p_week for update;
  if not found then return jsonb_build_object('error', 'no_week'); end if;
  if w.closing_at is not null or w.status is not null or now() - w.extracted_at >= interval '7 days' then
    return jsonb_build_object('error', 'closed');
  end if;

  select * into r from public.verdict_review_item where week = p_week and item_id = p_item for update;
  if not found then return jsonb_build_object('error', 'no_item'); end if;

  if p_answer is null or p_answer not in ('correct', 'wrong', 'unsure') then
    return jsonb_build_object('error', 'bad_answer');
  end if;
  if p_answer = 'wrong' then
    -- 고를 방향이 하나뿐이면(아님 글) 그것이다. 둘인데 안 골랐으면 「어느 쪽인지 안 고름」.
    d := coalesce(p_direction, case when r.hot then 'unknown' else 'should_be_hot' end);
    if (r.hot and d not in ('should_not_be_hot', 'wrong_reason', 'unknown'))
       or (not r.hot and d <> 'should_be_hot') then
      return jsonb_build_object('error', 'bad_direction');
    end if;
  else
    if p_direction is not null then return jsonb_build_object('error', 'bad_direction'); end if;
    d := null;
  end if;

  update public.verdict_review_item
     set answer = p_answer, direction = d, answered_at = now()
   where week = p_week and item_id = p_item;

  update public.verdict_review_week
     set first_answer_at = coalesce(first_answer_at, now()),
         completed_at = coalesce(
           completed_at,
           case when not exists (
             select 1 from public.verdict_review_item where week = p_week and answer is null
           ) then now() end)
   where week = p_week;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.answer_verdict_item(text, uuid, text, text) from public;
revoke all on function public.answer_verdict_item(text, uuid, text, text) from anon, authenticated;
grant execute on function public.answer_verdict_item(text, uuid, text, text) to service_role;

-- ── 주와 표본을 한 번에 만들기 (INV-VR2) ─────────────────────────────────────
-- 돌려주는 값: 만들었으면 true, 그 주가 이미 있으면 false(아무것도 안 바꿈).
-- 왜 함수인가: 주 행과 표본 행을 따로 넣으면 그 사이에서 멈출 때(네트워크 오류·서버리스 종료) **표본 0건인
-- 주**가 남고, 그 주는 「이미 있다」로 영영 다시 안 뽑힌다. 한 트랜잭션이면 표본 넣기가 실패할 때 주도 같이
-- 되돌아간다. (2026-09-24 코드 리뷰)
create or replace function public.create_verdict_week(
  p_week text, p_extracted_at timestamptz, p_seed integer, p_pool_size integer, p_shortfall jsonb, p_items jsonb
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.verdict_review_week (week, extracted_at, seed, pool_size, shortfall)
  values (p_week, p_extracted_at, p_seed, p_pool_size, p_shortfall)
  on conflict (week) do nothing;
  if not found then return false; end if;

  insert into public.verdict_review_item (week, item_id, position, hot, snapshot)
  select p_week, (e ->> 'item_id')::uuid, (e ->> 'position')::smallint, (e ->> 'hot')::boolean, e -> 'snapshot'
  from jsonb_array_elements(p_items) as e;

  return true;
end $$;

revoke all on function public.create_verdict_week(text, timestamptz, integer, integer, jsonb, jsonb) from public;
revoke all on function public.create_verdict_week(text, timestamptz, integer, integer, jsonb, jsonb) from anon, authenticated;
grant execute on function public.create_verdict_week(text, timestamptz, integer, integer, jsonb, jsonb) to service_role;

-- 트리거 함수는 트리거 밖에서 부를 수 없지만(PostgreSQL 이 거부한다) 공개 역할의 실행 권한도 걷어 둔다.
revoke all on function public.verdict_review_item_freeze() from public, anon, authenticated;
revoke all on function public.verdict_review_week_freeze() from public, anon, authenticated;

comment on table public.verdict_review_week is
  '판정 검토 한 주(ISO 주차, KST). 공개 정책 없음 — 서버가 secret 키로만 읽고 쓴다.';
comment on table public.verdict_review_item is
  '판정 검토 표본 글. snapshot 은 뽑은 순간의 사본이고 바꿀 수 없다(트리거). 답은 answer_verdict_item() 으로만.';
comment on table public.verdict_review_run is
  '판정 검토 주간 실행 기록. 대시보드가 마지막 실패와 8일 넘은 공백을 본다.';
