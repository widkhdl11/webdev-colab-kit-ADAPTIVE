# A4 태그 직접 입력 공개 + 업계 기본 필터 — 하다 멈춘 자리 (2026-10-10)

- 스펙: creator-tags INV-T4(바꿈)·T7·T8, S4c·S7~S8b. DECISIONS 2026-10-10 A~C 의 A4.
- 코드·화면·단위 시험은 끝(tsc·단위 시험 통과). 화면 확인: 설정에서 전화번호 거부 문구, 공개 페이지에 「치지직 · 버추얼 · 팝콘TV」, 운영자 금칙어 칸 동작.
- 리뷰 넷(보안·코드·UI·시험 감사) 받고 반영함 — 마이그레이션 20261010000005_tag_filter.sql 과 creator-tags-db 시험을 고쳤다.
- 남은 일:
  1. 다른 통합 시험이 돌고 있지 않은지 확인한 뒤 고친 마이그레이션을 로컬에 다시 적용한다
     (`docker cp supabase/migrations/20261010000005_tag_filter.sql supabase_db_fankkuk:/tmp/m5.sql` → `psql -1 -f /tmp/m5.sql`, 기록표에는 이미 있다).
  2. 로컬 DB 에만 남은 처음 금칙어 7개(니미·애미·애비·토토·야사·보지·자지)는 새 파일에서 뺐지만 DB 에는 남아 있다 — 한 번만 손으로 지운다
     (`delete from public.creator_tag_banned_words where word in ('니미','애미','애비','토토','야사','보지','자지')`). 파일에는 넣지 않는다(조건 없는 정정은 마이그레이션에 두지 않는다).
  3. `npx vitest run --config vitest.integration.config.mts creator-tags-db creator-signup-db signup-db` → 초록이면 변이 한 번(허용 목록 빼기 → sussex 시험 빨간불) 확인.
  4. A4 커밋(wip 커밋 위에 이어서). 이 폴더와 wip-late-box 폴더를 지운다.
- 개발 서버(localhost:3000)의 작업 프로세스가 죽어 크리에이터 상세 페이지가 500 이다 — 코드가 아니라 서버 상태(DB 함수 정상, 07:09 에는 같은 페이지 정상). 화면 확인 전에 개발 서버를 다시 켠다.
