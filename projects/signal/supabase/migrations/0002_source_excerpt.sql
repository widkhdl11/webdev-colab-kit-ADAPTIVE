-- 출처가 준 요약글을 따로 담는다 (ingestion-ranking INV-S2 확장, 2026-08-09).
--
-- 왜 summary 에 안 넣나: summary 는 **AI 가 만든 것**이고, 비어 있다는 사실이
-- 재생성 대상이라는 신호다(INV-S3). 여기에 RSS 요약글을 넣으면 그 신호가 사라져
-- AI 요약이 영영 생기지 않는다.
--
-- 무엇에 쓰나 두 가지다:
--   ① 요약 생성의 **근거**. 본문이 없는 항목(OpenAI 피드)은 이게 유일한 근거다 —
--      제목만 주고 요약시키면 지어낸다(INV-S1 위반).
--   ② AI 요약이 아직·끝내 없을 때 화면에 대신 보여줄 글.
alter table public.item
  add column if not exists source_excerpt text;

-- 요약 생성 대상 조회에 쓴다: summary 가 없고 **근거가 있는** 것.
-- 근거 없는 항목은 아무리 재시도해도 요약할 수 없으므로 후보에서 빼야 한다.
create index if not exists item_summarizable_idx
  on public.item (published_at desc)
  where summary is null
    and (content_html <> '' or source_excerpt is not null);
