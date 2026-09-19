-- 공식 발표 여부의 **근거**를 남긴다 (content-selection INV-O2, 2026-08-11).
--
-- 왜 boolean 이 아닌가: 두 근거의 확실성이 다르기 때문이다.
--   byUrl     — 원문 주소가 그 주체의 도메인. 기계가 대조한 것이라 확실하다(INV-O3).
--   byContent — 글 내용을 보고 모델이 판단한 것. 틀릴 수 있다.
-- 한 칸에 true/false 로 합치면 모델 판단이 주소 근거와 같은 확실성으로 보이고,
-- 모델이 틀린 날 사용자가 그대로 믿는다. 화면도 이 값으로 표시를 가른다.
alter table public.item
  add column if not exists official_basis text not null default 'none';

-- 값 세 개 밖은 막는다. 앱 경계(row.ts·ports.ts)도 모르는 값을 none 으로 떨어뜨리지만,
-- 그건 읽는 쪽 방어라 잘못된 값이 들어가는 것 자체는 못 막는다.
-- drop 을 먼저 하는 이유: 이 파일은 --all 로 다시 적용될 수 있고,
-- add constraint 는 if not exists 를 지원하지 않아 두 번째 실행에서 실패한다.
alter table public.item
  drop constraint if exists item_official_basis_check;
alter table public.item
  add constraint item_official_basis_check
  check (official_basis in ('none', 'byUrl', 'byContent'));
