-- 로컬 시험 계정의 연락처 — 로컬 DB 에만 넣는다(호스팅 DB 에는 넣지 않는다). 0002_account_contacts.sql 다음에 적용한다.
-- 적용: docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/manual/0002_account_contacts.local-seed.sql
-- 시험 계정은 확인된 이메일로 시작한다(my-account 스펙 비범위). 주소는 지어낸 값이다(example.com).
-- 달토끼는 휴대폰 번호가 없는 계정이다(S2b).

update pii.account_contacts c
   set email = s.email, phone = s.phone
  from (values
    ('byeolbit_fan', 'byeolbit.fan@example.com', '01012345678'),
    ('daltokki_fan', 'daltokki.fan@example.com', null),
    ('gureumppang_fan', 'gureumppang.fan@example.com', '01022223333'),
    ('somsatang_fan', 'somsatang.fan@example.com', '01044445555'),
    ('haneul_fan', 'haneul.fan@example.com', '01066667777'),
    ('haru_creator', 'haru.creator@example.com', '01088889999'),
    ('momo_creator', 'momo.creator@example.com', '01011112222')
  ) as s (login_id, email, phone)
  join public.profiles p on p.login_id = s.login_id
 where c.account_id = p.id;
