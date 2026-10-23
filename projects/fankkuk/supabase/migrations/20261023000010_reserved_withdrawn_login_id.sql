-- 탈퇴 처리가 쓰는 아이디 예약 (2026-10-23, 배포 전 확인 · 보안 리뷰 낮음). 스펙: docs/specs/signup.md INV-U6, my-account INV-A15.
--
-- 무엇이 틀렸나
--   가명 계정의 아이디는 `withdrawn_<16자리>`, 같이 쓰는 「탈퇴한 회원」 계정은 `withdrawn_shared`(20261023000004)인데 이 꼴이 예약돼 있지 않았다.
--   누가 가입으로 `withdrawn_shared` 를 먼저 가져가면 0004 의 계정 줄 넣기가 고유값 충돌로 실패한다(계정을 빼앗는 길은 아님).
--   같이 쓰는 크리에이터 행의 링크 주소 `withdrawn-shared` 는 막을 것이 없다 — 가입은 링크 주소를 `c-` + 무작위 값으로만 만들고 바꾸는 경로가 없다.
--
-- 무엇을 바꾸나
--   탈퇴하지 않은 계정 줄은 아이디를 `withdrawn_` 로 시작하게 넣거나 바꿀 수 없다(FKU03 — create_account 의 「이미 쓰는 아이디」와 같은 코드라
--   가입 처리가 같은 문구로 알린다). 앱 서버의 가입·미리 확인도 같은 판정을 먼저 한다(isReservedLoginId).
--   제약이 아니라 트리거인 까닭: 이미 그런 아이디를 가진 줄이 있으면 제약은(not valid 여도) 그 줄의 닉네임 고치기까지 막는다.
--   트리거는 아이디를 넣거나 바꿀 때만 본다. 운영에 이미 있는지는 0004 적용 전에 사람이 확인한다(PROGRESS).

create or replace function public.reject_reserved_login_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.withdrawn_at is null and new.login_id like 'withdrawn\_%' then
    raise exception '탈퇴 처리가 쓰는 아이디다' using errcode = 'FKU03';
  end if;
  return new;
end $$;
revoke all on function public.reject_reserved_login_id() from public, anon, authenticated, service_role;

drop trigger if exists profiles_reserved_login_id on public.profiles;
create trigger profiles_reserved_login_id before insert or update of login_id on public.profiles
for each row execute function public.reject_reserved_login_id();
