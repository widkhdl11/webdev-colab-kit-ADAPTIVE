-- signal 초기 스키마 — ingestion-ranking.md 의 INV-C1 · R1 · T1 · T2 를 DB 가 강제한다.
--
-- 여기 적힌 제약이 곧 그 불변식이다. 애플리케이션 코드에도 같은 판정이 있지만,
-- 서버 코드는 우회할 수 있고 DB 제약은 못 한다 (rules/supabase: 인가는 필터가 아니라 RLS로).

create extension if not exists "pgcrypto";

-- ── 소식 ────────────────────────────────────────────────────────────────────
create table if not exists public.item (
  id uuid primary key default gen_random_uuid(),

  -- INV-C1: 항목의 유일성은 정규화된 원문 URL 로 판정한다.
  -- 이 unique 가 없으면 같은 기사가 재수집마다 새 행으로 쌓여 피드가 오염된다.
  canonical_url text not null unique,

  -- INV-C2: 정규화 이전 주소도 보존한다 (추적 파라미터를 지운 주소가 404 인 출처가 있다).
  original_url text not null,

  title text not null,

  -- INV-S2: 요약 생성이 실패하면 null 로 적재된다. null 인 것이 다음 주기의 재시도 대상이고
  -- (INV-S3), 그래서 not null 을 걸면 안 된다.
  summary text,
  summary_points text[] not null default '{}',

  content_html text not null default '',

  -- 소스 설정(코드)의 id. weight 는 여기 복사하지 않는다 — INV-R4.
  source_id text not null,
  source_name text not null,

  -- INV-C5: UTC 로만 저장한다. timestamptz 라 타임존이 섞일 수 없다.
  published_at timestamptz not null,
  -- INV-C5: 수집시각으로 대체했는지. 대체값은 "이때 발행됐다"가 아니라 "이때 우리가 봤다"다.
  published_at_is_fallback boolean not null default false,
  fetched_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

  -- INV-R1: 점수 컬럼이 **없다.** 점수는 (published_at, 소스 weight, 조회시각)에서
  -- 조회 시점에 계산하는 파생값이다. 저장하면 시간이 지나 낡고, 갱신 배치가 절반만 돌면
  -- 순위가 뒤섞인다. is_trending 도 같은 이유로 없다 (INV-R5).
);

-- 날짜 그룹 + 최신순 조회 경로.
create index if not exists item_published_at_idx
  on public.item (published_at desc);

-- INV-S3: 재시도 대상(summary 가 없는 것)만 빠르게 고른다.
create index if not exists item_missing_summary_idx
  on public.item (fetched_at desc)
  where summary is null;

-- ── 태그 ────────────────────────────────────────────────────────────────────
create table if not exists public.tag (
  -- INV-T2: 유일성은 대리키(id) + 정규화된 태그명(unique)으로 정한다.
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 'MCP' 와 'mcp' 가 다른 태그가 되면 필터가 쪼개진다.
  normalized_name text not null unique
);

-- INV-T1: 항목↔태그는 다대다다. 항목의 단일 필드가 아니다 —
-- 필드로 두면 항목당 태그를 하나밖에 못 담아 다중 태그 필터가 붕괴한다.
create table if not exists public.item_tag (
  item_id uuid not null references public.item (id) on delete cascade,
  tag_id uuid not null references public.tag (id) on delete cascade,
  primary key (item_id, tag_id)
);

create index if not exists item_tag_tag_id_idx on public.item_tag (tag_id);

-- ── 읽기 권한 ───────────────────────────────────────────────────────────────
-- 로그인이 없는 사이트라 읽기는 전부 공개다. 쓰기는 정책을 만들지 않는다 —
-- RLS 가 켜져 있고 insert/update 정책이 없으면 publishable 키로는 쓸 수 없다.
-- 수집은 서버에서 secret 키로 돈다 (INV-S4).
alter table public.item enable row level security;
alter table public.tag enable row level security;
alter table public.item_tag enable row level security;

create policy "item 공개 읽기" on public.item for select using (true);
create policy "tag 공개 읽기" on public.tag for select using (true);
create policy "item_tag 공개 읽기" on public.item_tag for select using (true);
