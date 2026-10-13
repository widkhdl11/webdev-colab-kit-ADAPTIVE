-- 링크 아이디 예약어 — v18 재디자인이 public 아래에 새로 둔 첫 단계 이름 둘(INV-E2 S2c 가 잡음, 2026-10-14).
-- fonts: 제목 글꼴 파일 폴더(/fonts/...) · sidebar-boot: 사이드바 접힘 상태를 그리기 전에 다는 스크립트(/sidebar-boot.js).
-- 이 이름을 크리에이터 링크 아이디로 받으면 그 크리에이터 페이지 주소와 사이트 파일 주소가 겹친다.
-- 이미 그 아이디를 쓰는 크리에이터가 있어도 예약어는 새로 저장할 때만 본다(update_my_creator_handle) — 지금 쓰는 아이디는 그대로 둔다.

insert into public.creator_handle_reserved (word)
values ('fonts'), ('sidebar-boot')
on conflict (word) do nothing;
