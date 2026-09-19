-- 태그에 **축**을 더한다 (badge-keywords INV-B1, 2026-08-27).
--
-- 뱃지 키워드는 축이 둘이다:
--   field — 분야. 무엇에 대한 글인가 (`코딩`·`보안`·`프론트엔드`). 글마다 1~3개.
--   kind  — 사건종류. 무슨 일이 일어났나 (`출시`·`규제`·`투자`). 글마다 0~2개.
--
-- 왜 나누나: 690건 실측(2026-08-15)에서 "이 글이 다루는 것"만 물었더니 107종이
-- **전부 분야**였고 사건종류가 한 건도 안 나왔다. 안 물으면 안 만든다. 그래서 프롬프트가
-- 두 질문을 따로 하는데, 저장까지 나눠 둬야 화면이 두 축을 갈라 보여줄 수 있다
-- (design-rules 2026-08-27: 분야는 청회색, 사건종류는 모래빛).
--
-- **테이블을 새로 만들지 않는다.** `tag(normalized_name unique)` + `item_tag` 다대다 구조는
-- 그대로 두고 칸 하나만 더한다 — 고정 5개였던 것은 코드의 결정이지 스키마 제약이 아니었다.
alter table public.tag
  add column if not exists axis text not null default 'field';

-- 값 셋 밖은 막는다. `legacy` 는 고정 5개 시절 태그(모델·에이전트·MCP·엔지니어링·툴)다.
--
-- 왜 legacy 를 두나: 그 태그들과 거기 붙은 `item_tag` 475건을 **지우지 않기로 했다**
-- (2026-08-15). 지금 지우면 피드의 필터 칩 5개가 빈 결과를 내는데 대체할 뱃지 줄이 아직 없다.
-- 그렇다고 `field` 로 두면 뱃지 줄이 켜지는 날 옛 태그가 분야 뱃지로 섞여 나온다.
-- 셋째 값으로 갈라 두면 **화면이 뱃지 줄을 붙일 때 한 줄로 걸러낼 수 있고**, 그때
-- 칩과 함께 정리한다.
alter table public.tag
  drop constraint if exists tag_axis_check;
alter table public.tag
  add constraint tag_axis_check
  check (axis in ('field', 'kind', 'legacy'));

-- 【2026-08-31 에 파일에서 뺐다 — 여기 있으면 안 되는 문장이었다】
--
-- 원래 이 자리에 있던 것:
--   update public.tag set axis = 'legacy'
--     where normalized_name in ('모델', '에이전트', 'mcp', '엔지니어링', '툴');
--
-- 2026-08-27 에 손으로 1회 실행했고 그때 `tag` 5행이 legacy 가 됐다. 0007 이 그 5행을 지웠다.
--
-- **왜 뺐나**: 이 문장의 전제("이 update 는 이 다섯 행에만 닿는다")가 지금은 거짓이다.
-- `에이전트`·`MCP` 는 모델이 만드는 키워드로 다시 나오고 있어서(0007 주석의 2026-08-30
-- 시험 실행), `--all` 로 재적용하면 **지금 쓰는 키워드 행**이 legacy 로 내려가고 이어서
-- 0007 의 delete 가 그것을 지운다. `item_tag` 는 on delete cascade 라 연결도 같이 사라지고,
-- 그 글들은 `keywords_at` 이 이미 차 있어 **다시 물어보지 않는다** — 조용히 영구 손실이다.
--
-- rules/supabase.md 가 0003 사건을 근거로 정한 것 그대로다: 일회성 데이터 정정은 파일에 두지
-- 않고 손으로 한 번 실행한 뒤 이력만 주석으로 남긴다. (새 DB·리셋에서는 legacy 행 자체가
-- 없으므로 이 문장도 0007 의 delete 도 애초에 할 일이 없다.)

-- 축으로 거르는 조회(뱃지 줄은 legacy 를 뺀다)가 매번 전체를 훑지 않게.
create index if not exists tag_axis_idx on public.tag (axis);
