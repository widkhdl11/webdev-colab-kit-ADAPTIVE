-- ═════════════════════════════════════════════════════════════════════════
-- 0009 — 마감일은 달력에 있는 날짜다
--
-- `date` 타입은 `'infinity'` 와 `'-infinity'` 를 받는다. 비교(`>=`)는 무한에서도 멀쩡히
-- 도는데 뺄셈은 죽는다:
--
--   select date 'infinity' >= current_date  →  true
--   select date 'infinity' - current_date   →  ERROR: cannot subtract infinite dates
--
-- 0008 의 순위 함수가 날짜 산술을 도입하면서 그 조합이 열렸다. 0007 까지는 컬럼을 그대로
-- 정렬했으므로 무한값도 그냥 정렬됐다.
--
-- **닿는 경로가 실제로 있다.** 0002 의 열 권한 목록에 `recruit_until` 이 있고
-- `studies_update_host` 는 호스트 본인을 통과시킨다. 로그인 사용자 하나가 자기 스터디에
-- 무한값을 쓰고 모집글을 붙이면, 그 모집글은 공개로 나가므로 `/posts?sort=deadline` 의 정렬
-- 대상에 들어가고 목록 질의 전체가 실패한다 — **비로그인 방문자까지 500 을 본다.**
--
-- 두 자리를 같이 막는다. **어느 하나만 적용돼도 500 은 안 난다:**
--   ① 제약만 붙으면 새 무한값이 안 들어온다 (기존 행이 있으면 제약 추가 자체가 실패해 드러난다)
--   ② 함수만 고치면 기존 무한값이 띠의 양 끝으로 가고 뺄셈을 안 탄다
-- ═════════════════════════════════════════════════════════════════════════

-- ① 쓰기 경계. 이쪽이 본체다 — "마감일은 달력에 있는 날짜다"가 규칙이면
--    JS·SQL 어느 소비자도 무한값을 볼 일이 없다.
alter table public.studies drop constraint if exists studies_recruit_until_finite;
alter table public.studies add constraint studies_recruit_until_finite
  check (
    recruit_until is null
    or (recruit_until > '-infinity'::date and recruit_until < 'infinity'::date)
  );

comment on constraint studies_recruit_until_finite on public.studies is
  '마감일은 유한한 날짜다. 무한값은 비교를 통과하고 뺄셈에서 죽어, 「마감 임박순」 목록을 통째로 500 으로 만든다(0008).';

-- ② 순위 함수의 안전 실패. 제약이 붙기 전에 들어온 행이나, 제약을 떼는 변경이 왔을 때를
--    대비한다. 무한 가지는 **비교만** 하고 뺄셈을 안 탄다.
--    나머지는 0008 과 같다 — 그 파일의 주석이 이 함수의 근거다.
--
-- **`leakproof` 를 붙이지 마라.** 지금 이 함수가 정책을 통과 못 한 행에 대해 아예 불리지
-- 않는 것은 non-leakproof 라서다. 성능 때문에 붙이는 순간 그 겹이 사라진다.
create or replace function public.study_deadline_rank(public.posts) returns integer
language sql stable set search_path = '' as $fn$
  select case
           when u.d is null                then 2000000
           when u.d = 'infinity'::date     then 999999
           when u.d = '-infinity'::date    then 2999999
           when u.d >= current_date        then least(u.d - current_date, 999999)
           else                                 2000001 + least(current_date - u.d, 999998)
         end
  from (select public.study_recruit_until($1) as d) u;
$fn$;
