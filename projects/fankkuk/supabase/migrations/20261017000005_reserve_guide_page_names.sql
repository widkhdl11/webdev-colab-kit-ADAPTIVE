-- 링크 아이디 예약어 — 2026-10-17 안내·법정 페이지 묶음이 src/app 아래에 새로 둔 첫 단계 이름 넷(INV-E2 S2c 가 잡음).
-- dispute: 분쟁 처리 안내 · guide: 이용 안내 · inspection: 검수 안내 · refund: 환불 안내.
-- 이 이름을 크리에이터 링크 아이디로 받으면 그 크리에이터 페이지 주소와 사이트 페이지 주소가 겹친다.
-- 이미 그 아이디를 쓰는 크리에이터가 있어도 예약어는 새로 저장할 때만 본다(update_my_creator_handle) — 지금 쓰는 아이디는 그대로 둔다.

insert into public.creator_handle_reserved (word)
values ('dispute'), ('guide'), ('inspection'), ('refund')
on conflict (word) do nothing;
