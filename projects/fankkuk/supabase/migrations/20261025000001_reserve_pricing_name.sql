-- 링크 아이디 예약어 — 요금 안내 페이지가 src/app 아래에 둔 첫 단계 이름 하나(INV-E2 S2c 가 잡음, 2026-10-25).
-- pricing: 요금 안내(/pricing).
-- 이 이름을 크리에이터 링크 아이디로 받으면 그 크리에이터 페이지 주소와 사이트 페이지 주소가 겹친다.
-- 이미 그 아이디를 쓰는 크리에이터가 있어도 예약어는 새로 저장할 때만 본다(update_my_creator_handle) — 지금 쓰는 아이디는 그대로 둔다.

insert into public.creator_handle_reserved (word)
values ('pricing')
on conflict (word) do nothing;
