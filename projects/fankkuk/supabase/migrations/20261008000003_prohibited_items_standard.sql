-- 보낼 수 없는 물품 처음 목록을 택배 표준약관 수탁 거절 품목에 맞춘다 (admin-console INV-K9, DECISIONS 2026-10-08 — 정책 질문 ④).
-- 근거: 택배 표준약관 제12조(운송물의 수탁거절) 중 물건에 관한 호 — 8 위험물 · 9 위법한 물건 · 10 현금화 가능한 물건 ·
--       11 재생 불가능한 서류 · 12 살아 있는 동물·동물 사체 · 6 한 포장 가액 300만 원 초과. 여기에 상하는 음식(기존 줄)을 둔다.
--       계약할 택배사의 약관을 받으면 운영자가 /admin/prohibited 에서 맞춘다.
-- 다시 돌려도 결과가 같다: 고치기는 처음 넣은 문구 그대로일 때만, 넣기는 같은 이름이 없을 때만. 운영자가 고친 줄·더한 줄은 건드리지 않는다.
-- 운영자 처리가 아니라서 바뀐 기록(prohibited_item_changes)은 남기지 않는다 — 20261005000006 의 첫 목록과 같다.

update public.prohibited_items
set name = '살아 있는 동물·동물 사체와 식물', updated_at = now()
where name = '살아 있는 동물과 식물' and description = '';

update public.prohibited_items
set description = '화약류·인화물질처럼 운송 중 위험한 물건은 보낼 수 없어요.', updated_at = now()
where name = '폭발·인화성 물질 등 위험물' and description = '';

update public.prohibited_items
set name = '현금·카드·상품권·유가증권', description = '수표·어음처럼 현금으로 바꿀 수 있는 물건은 보낼 수 없어요.', updated_at = now()
where name = '현금과 상품권' and description = '';

insert into public.prohibited_items (name, description)
select v.name, v.description
from (values
  ('위법한 물건', '밀수품·군수품처럼 허가받지 않았거나 법에 어긋나는 물건은 보낼 수 없어요.'),
  ('다시 만들 수 없는 서류', '계약서·원고처럼 잃어버리면 되돌릴 수 없는 서류는 보낼 수 없어요.'),
  ('가액이 300만 원을 넘는 물건', '한 상자에 든 물건 값이 300만 원을 넘으면 보낼 수 없어요.')
) as v (name, description)
where not exists (select 1 from public.prohibited_items p where p.name = v.name);
