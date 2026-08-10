-- 한국어 제목을 따로 담는다 (ingestion-ranking INV-S6, 2026-08-10).
--
-- 왜 title 을 덮어쓰지 않나: 원문이 진실이라는 게 이 제품의 규칙이다(INV-S1).
-- 번역문으로 덮으면 번역이 틀렸을 때 대조할 원본이 사라진다. 상세 화면은 둘 다 보여준다.
alter table public.item
  add column if not exists title_ko text;

-- 번역 대상 조회에 쓴다: title_ko 가 없는 것.
--
-- 요약 후보 인덱스(item_summarizable_idx)와 조건이 **다른 게 핵심이다** — 요약은 근거(본문·
-- 출처 요약글)가 있어야 하지만, 번역의 근거는 제목 자신이라 근거 없는 항목도 번역한다.
-- 같은 조건으로 묶으면 본문도 요약글도 없는 항목(HN 링크 글 다수)이 영어 제목으로 영영 남는다.
create index if not exists item_untranslated_idx
  on public.item (published_at desc)
  where title_ko is null;

-- 기존 요약을 새 기준(네다섯 문장 + 핵심 항목)으로 다시 만드는 일회성 조치는
-- **이 파일에 두지 않는다.** 아래 SQL 을 2026-08-10 에 한 번 손으로 실행했다:
--
--   update public.item set summary = null, summary_points = '{}';
--
-- 왜 파일에서 뺐나: 이 스크립트는 이름을 안 주면 폴더의 .sql 을 **전부** 다시 적용한다
-- (scripts/apply-migrations.mjs). 위 문장은 조건이 없어서, 다음에 0004 를 추가하고
-- 습관대로 전부 돌리는 순간 그동안 만든 요약이 통째로 날아가고 전부 재과금된다.
-- 이 파일의 나머지(add column / create index)는 `if not exists` 라 다시 돌려도 무해하다.
--
-- 규칙: 마이그레이션 파일에는 **재실행해도 같은 결과가 나오는 것만** 담는다.
