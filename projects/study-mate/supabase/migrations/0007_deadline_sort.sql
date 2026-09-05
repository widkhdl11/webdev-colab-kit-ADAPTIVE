-- ═════════════════════════════════════════════════════════════════════════
-- 0007 — 「마감 임박순」이 실제로 정렬하게 한다
--
-- 목록은 "모두 N건 · 마감 임박순"이라고 적어 놓고 실제로는 uuid 순으로 나왔다.
-- 조회 코드가 `order("recruit_until", { referencedTable: "study" })` 를 걸었는데,
-- 그 옵션은 **임베드된 자원 안쪽**의 정렬이다. `study` 는 모집글 하나에 하나뿐이라
-- 그 안을 정렬하는 것은 아무 일도 하지 않고, 남는 것은 뒤에 붙은 `id` 오름차순뿐이었다.
-- 오류가 안 나서 화면을 봐도 모른다 — **그럴듯한 순서로 틀린다.**
--
-- PostgREST 는 부모 행을 자식 컬럼으로 정렬해 주지 않으므로, 0003 이 목록 필터에 쓴 것과
-- 같은 방법으로 그 값을 모집글 쪽 계산 컬럼으로 낸다.
-- ═════════════════════════════════════════════════════════════════════════

-- 이 모집글이 속한 스터디의 모집 마감일.
--
-- **`security definer` 가 아니다.** 0002 의 accepted_count·recruiting 이 definer 여야 했던
-- 이유는 그것들이 읽는 `participants` 의 조회 정책이 스터디 가시성보다 **좁아서** 부르는
-- 사람마다 답이 실제로 갈라졌기 때문이다. 여기서 읽는 `studies` 는 사정이 다르다 —
-- 모집글 조회 정책과 스터디 조회 정책의 조건이 글자 그대로 같다:
--
--   posts_read   → study_is_visible(study_id, uid) = deleted_at is null or host_id = uid
--   studies_read →                                   deleted_at is null or host_id = uid
--
-- 즉 모집글이 보이는 사람은 그 스터디 행도 보인다. 부르는 사람의 시야로 읽어도 답이 같고,
-- definer 로 두면 얻는 것 없이 정책을 우회하는 자리가 하나 늘어난다.
--
-- **인라인은 근거가 아니다.** 한때 여기에 "definer 인 SQL 함수는 인라인되지 않으니 invoker 로
-- 두면 정렬이 행마다 함수 호출이 되는 것을 피한다"고 적혀 있었는데 사실이 아니다 — Postgres 는
-- `prosecdef` 뿐 아니라 `proconfig` 가 비어 있지 않아도 인라인을 포기하고, 이 함수는
-- `set search_path = ''` 를 달고 있다. definer 여부와 무관하게 어차피 행마다 호출이다.
-- 얻어지지 않는 이득을 근거로 남겨 두면 다음 사람이 그 근거로 다른 판단을 내린다.
--
-- **이 판단은 두 정책이 같다는 것에 기댄다.** `studies_read` 를 좁히는 변경(예: 비공개
-- 스터디)이 오면 여기도 같이 봐야 한다.
create or replace function public.study_recruit_until(public.posts) returns date
language sql stable set search_path = '' as $fn$
  select s.recruit_until from public.studies s where s.id = $1.study_id;
$fn$;

comment on function public.study_recruit_until(public.posts) is
  '「마감 임박순」 정렬 키. 모집글에는 마감일이 없고 스터디에 있는데, PostgREST 는 부모를 자식 컬럼으로 정렬하지 못한다.';
