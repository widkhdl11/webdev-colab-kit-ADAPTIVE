-- 수집 실행 이력 — 개발자용 파이프라인 대시보드가 읽는 자리 (2026-08-17).
--
-- 실행마다 한 행이 쌓이고 지우지 않는 이력 로그다. 지금 화면은 최신 1행만 보여주지만,
-- 나중에 추이 그래프를 만들 때 다시 쌓을 필요가 없도록 처음부터 이렇게 둔다.
--
-- 공개 select 정책을 두지 않는다 (INV-S4 와 같은 경계): 여기엔 소스 전략·토큰 사용량 같은
-- 내부 정보가 담긴다. RLS 만 켜고 정책을 안 만들면 publishable 키로는 못 읽고,
-- 대시보드는 서버 컴포넌트가 secret 키로만 읽는다.
create table if not exists public.ingest_run (
  id uuid primary key,
  started_at timestamptz not null,
  elapsed_ms integer not null,

  -- 실행 하나의 계측값을 통째로 담는다. 칸마다 컬럼을 만들면 계측 항목이 늘 때마다
  -- 마이그레이션이 또 필요하다 — 이 값은 불변식이 아니라 관찰용이다(budgets.ts 의 usage 와 같은 이유).
  -- budget 도 같은 이유로 여기 있다: bool 하나만 남기면 "떨어졌다"만 보이고 어느 소스·
  -- 어느 단계가 잘렸는지가 안 보인다(2026-08-17 리뷰 — 이 화면을 만든 이유 자체가 그 질문이다).
  usage jsonb not null,
  sources jsonb not null,
  budget jsonb not null,

  created_at timestamptz not null default now()
);

create index if not exists ingest_run_created_at_idx
  on public.ingest_run (created_at desc);

alter table public.ingest_run enable row level security;
-- select 정책을 만들지 않는다 — 의도적이다 (위 주석 참고). insert 도 없다: 쓰기는 서버가
-- secret 키로 RLS 를 우회해서 한다(수집·적재와 같은 경로).

-- 이번 실행이 이 항목을 손댔다는 표시. 소스별 "이번에 가져온 글" 조회에 쓴다.
-- FK 를 걸지 않는다: item 은 소스 단계에서 먼저 적재되고 ingest_run 행은 실행이 끝나야
-- 쓰이므로, FK 를 걸면 실행 도중에는 참조 대상이 없어 매번 위반이 난다.
alter table public.item
  add column if not exists last_ingest_run_id uuid;

create index if not exists item_last_ingest_run_idx
  on public.item (source_id, last_ingest_run_id);
