-- 요약을 칸으로 나눠 저장한다 (ingestion-ranking INV-S8 · hot-issue INV-G2, 2026-09-23).
--
-- ── 왜 필요한가 ──────────────────────────────────────────────────────────────
-- 상세 화면이 「한 줄 요약 → signal 포인트 → 핵심 → 표」 순으로 바뀐다(사용자 결정 2026-09-23).
-- 같은 날 먼저 한 방식은 한 줄 요약과 표를 `summary` 문자열에 이어 붙이고 화면이 첫 문단을
-- 한 줄 요약으로 추측하는 것이었다. 그러면 옛 요약과 새 요약을 가를 근거가 **길이뿐**이고,
-- 화면이 문자열 안의 기호를 해석해야 했다(content-safety INV-D7 이 그 해석을 없앴다).
--
-- ── 칸 ───────────────────────────────────────────────────────────────────────
-- `one_line`         한 줄 요약. **이 칸이 있으면 새 형식이다** — 화면이 새 순서로 그린다.
--                    옛 행은 null 로 남는다(다시 요약하지 않는다, 사용자 결정 2026-09-23).
-- `summary_table`    {"head": [...], "rows": [[...], ...]} 또는 null. 모양 검사는 코드가 저장할 때와
--                    그릴 때 둘 다 한다(열 2~3·행 1~8·빈 칸 없음) — DB 제약으로 박지 않는 이유는
--                    한도가 화면 폭에서 온 값이라 화면이 바뀌면 같이 바뀌기 때문이다.
-- `hot_issue_reasons` {"변화": "근거 문장", ...} — 참인 질문만 키가 있다. 0009 의 `hot_issue_answers` 와
--                    같은 이유로 jsonb 다(질문은 고칠 것을 전제로 만든 값이라 컬럼 이름으로 박지 않는다).
--                    답(참/거짓)과 칸을 가르는 이유: 근거가 비어도 판정은 살아 있어야 한다(S31d).
--
-- 핵심 셋은 기존 `summary_points` 를 그대로 쓴다. `summary` 에는 한 줄 요약과 같은 글을 넣는다 —
-- 재시도 조건(`summary is null`)과 카드 미리보기가 이 칸을 읽으므로 비워 두면 같은 글이 매 주기
-- 다시 요약된다.
--
-- ── 적용 순서 ────────────────────────────────────────────────────────────────
-- **코드를 배포하기 전에 적용한다.** 새 코드는 저장할 때 이 칸들을 쓰므로, 칸이 없으면 update 가
-- PGRST204 로 실패하고 요약·판정이 전부 실패로 떨어진다. 반대 순서(칸만 먼저)는 안전하다 —
-- 옛 코드는 이 칸들을 모른다.
--
-- RLS 는 `item` 의 기존 행 단위 정책을 그대로 따른다(0009 와 같다).
alter table public.item add column if not exists one_line text;
alter table public.item add column if not exists summary_table jsonb;
alter table public.item add column if not exists hot_issue_reasons jsonb;

comment on column public.item.one_line is
  '한 줄 요약(한 문장·80자 이내). 있으면 새 요약 형식이다. null = 옛 요약 또는 요약 없음.';
comment on column public.item.summary_table is
  '요약에 딸린 표 {head, rows}. 열 2~3·행 1~8. 비교할 수치가 없는 글은 null.';
comment on column public.item.hot_issue_reasons is
  '핫이슈 판정에서 참인 질문마다의 근거 한 문장 {질문키: 문장}. null = 근거 저장 이전의 판정.';
