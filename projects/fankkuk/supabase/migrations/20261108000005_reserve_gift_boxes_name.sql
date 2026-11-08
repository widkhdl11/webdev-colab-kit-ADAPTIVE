-- 링크 아이디 예약어 — 선물함 신청 화면이 src/app 아래에 둔 첫 단계 이름 하나(INV-E2 S2c 가 잡음, 2026-11-08 선물함 2부).
-- gift-boxes: 팬 신청 화면(/gift-boxes/[boxId]). 지금 아이디 꼴(영소문자·숫자·밑줄)로는 만들 수 없는 이름이지만, 첫 단계 주소는 모두 예약어에 둔다.
-- 이미 그 아이디를 쓰는 크리에이터가 있어도 예약어는 새로 저장할 때만 본다(update_my_creator_handle) — 지금 쓰는 아이디는 그대로 둔다.

insert into public.creator_handle_reserved (word)
values ('gift-boxes')
on conflict (word) do nothing;
