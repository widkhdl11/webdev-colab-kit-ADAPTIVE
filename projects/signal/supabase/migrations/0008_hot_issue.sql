-- 핫이슈 판정을 담을 자리 (hot-issue.md INV-G1 · H1 · H2, 2026-09-20).
--
-- ── 무엇을 저장하고 무엇을 저장하지 않나 (INV-H2) ────────────────────────────
-- 가르는 기준은 **다시 계산했을 때 같은 값이 나오는가**다.
--   이슈성 — 저장하지 않는다. 입력(교차 발행처 수·소스 weight·발행시각)이 전부 DB 에
--            이미 있고 시간만 흐르므로 조회 시점에 계산한다. 저장하면 시간이 지나 낡고,
--            갱신 배치가 절반만 돌면 순서가 뒤섞인다 (INV-R1 과 같은 이유).
--   중요도 — 저장한다. 모델 판정이라 다시 물으면 다른 값이 나올 수 있고 요금도 다시 나간다.

alter table public.item
  add column if not exists importance smallint;

-- 값 셋 밖은 막는다. 중요도는 문턱 질문 셋(INV-G2) 중 참인 개수라 0~3 뿐이다.
alter table public.item
  drop constraint if exists item_importance_check;
alter table public.item
  add constraint item_importance_check
  check (importance is null or (importance >= 0 and importance <= 3));

-- ── 물어봤다는 표시 (INV-G2 실패 처리) ───────────────────────────────────────
-- 중요도 `0` 과 `못 물어봤다`를 값으로는 가를 수 없다. 0 은 "물어봤고 셋 다 아니었다"이고
-- null 은 "판정이 실패했거나 아직 차례가 안 왔다"다. 시각 칸을 따로 둬야
-- **판정에 실패한 글이 다음 주기에 다시 잡힌다.** keywords_at(0007)과 같은 자리·같은 이유다.
alter table public.item
  add column if not exists hot_issue_at timestamptz;

-- 후보 조회(아직 안 물어본 것 + 발행시각 내림차순)가 매번 전체를 훑지 않게.
-- 부분 인덱스로 둔다 — 채워진 행은 후보가 아니라 인덱스에 담을 이유가 없다(0007 과 같다).
create index if not exists item_missing_hot_issue_idx
  on public.item (published_at desc)
  where hot_issue_at is null;

-- ── 문 배정 (INV-H1) ─────────────────────────────────────────────────────────
-- keywords-and-kinds.md INV-N1 의 문 넷 중 **1번만** 이번에 연다.
-- 값이 없는 항목은 핫이슈 화면에 안 나온다 — 비어 있는 것이 곧 "판정 못 받음"이다.
alter table public.item
  add column if not exists gate text;

-- **아직 안 여는 문을 미리 허용하지 않는다.** 허용해 두면 2번·3번 값이 들어올 수 있는데
-- 그 문을 그리는 화면이 없어서, 그 글들은 어디에도 안 나오면서 배정은 받은 상태가 된다.
-- 문을 열 때 이 제약을 넓힌다.
alter table public.item
  drop constraint if exists item_gate_check;
alter table public.item
  add constraint item_gate_check
  check (gate is null or gate in ('gate1'));

create index if not exists item_gate_idx on public.item (gate) where gate is not null;

-- ── 종류 (INV-G1) ────────────────────────────────────────────────────────────
-- **항목의 칸으로 두지 않는다.** 한 글이 뉴스이면서 툴일 수 있어서(새 툴을 발표한 글이
-- 그렇다), 칸 하나로 두면 하나만 고르게 되고 그 글이 한쪽 화면에서 사라진다.
--
-- `tag` 를 재활용하지 않는 이유: 그쪽 축은 뱃지 키워드의 `field`/`kind` 이고 그 값들은
-- 모델이 자유롭게 만든다(badge-keywords INV-B1). 여기 값은 둘로 닫혀 있어서, 같은 표에 두면
-- 뱃지 줄 조회가 매번 이 둘을 걸러내야 하고 걸러내는 것을 잊은 자리가 화면에 샌다.
create table if not exists public.item_kind (
  item_id uuid not null references public.item (id) on delete cascade,
  kind text not null check (kind in ('news', 'tool')),
  primary key (item_id, kind)
);

create index if not exists item_kind_kind_idx on public.item_kind (kind);

-- 읽기는 공개, 쓰기는 정책 없음 — 0001 이 `item`·`tag` 에 건 것과 같다.
-- RLS 를 켜고 insert/update 정책을 만들지 않으면 publishable 키로는 쓸 수 없고,
-- 수집은 서버에서 secret 키로 돈다(INV-S4).
alter table public.item_kind enable row level security;

drop policy if exists "item_kind read" on public.item_kind;
create policy "item_kind read" on public.item_kind for select using (true);
