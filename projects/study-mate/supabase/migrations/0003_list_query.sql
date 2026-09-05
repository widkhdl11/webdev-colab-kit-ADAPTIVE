-- ═════════════════════════════════════════════════════════════════════════
-- 0003 — 목록 화면이 필요로 하는 판정
--
-- 화면 목록(docs/IA.md 「스터디 하나에 모집글은 여럿이다」)이 정한 규칙을 데이터베이스가
-- 판정하게 한다. 애플리케이션에서 걸러 내면 **페이지를 나눈 순간 규칙이 깨진다** —
-- 한 페이지 안에서만 중복을 지우게 되어 2쪽에 같은 스터디가 다시 나온다.
-- ═════════════════════════════════════════════════════════════════════════

-- 이 모집글이 그 스터디의 가장 최근 것인가.
--
-- 계산 컬럼이라 목록 질의가 `is_latest_for_study=eq.true` 로 거를 수 있고, 정렬·쪽 나눔이
-- 그 위에서 그대로 돈다. 스캔한 행마다 한 번씩 도는데, posts(study_id, created_at desc)
-- 인덱스가 있어 각각은 인덱스 한 번 타는 값이다(0002 의 posts_study_created_idx).
--
-- created_at 이 같은 두 글이 있으면 id 로 가른다 — 안 그러면 답이 두 개가 되어
-- 목록이 새로고침마다 달라진다.
create or replace function public.is_latest_for_study(public.posts) returns boolean
language sql stable set search_path = '' as $fn$
  select $1.id = (
    select p.id
      from public.posts p
     where p.study_id = $1.study_id
     order by p.created_at desc, p.id desc
     limit 1
  );
$fn$;

comment on function public.is_latest_for_study(public.posts) is
  '목록은 스터디마다 가장 최근 모집글 한 장만 보여준다 (docs/IA.md). 지난 회차 글은 주소로는 계속 열린다.';
