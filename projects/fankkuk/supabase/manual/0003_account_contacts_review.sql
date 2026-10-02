-- 내 정보 — 리뷰 반영(2026-10-02, security·code-reviewer). 0002_account_contacts.sql 다음에 적용한다. 사람이 직접 적용한다.
-- 적용(로컬, Bash): docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/manual/0003_account_contacts_review.sql
--
-- 1) 이메일 꼴을 허용 문자 목록으로 좁힌다. 쉼표·꺾쇠가 든 주소는 메일 라이브러리가 「이름 <주소>」나 주소 여러 개로
--    읽어, 저장한 값과 다른 곳으로 메일이 갈 수 있었다(INV-A5·A7). 앱 서버의 검사식과 같은 식이다.
-- 2) 확인 대기 주소와 같은 주소로 다시 저장하면 메일을 또 보내지 않는다 — 닉네임만 고친 저장이 방금 보낸 링크를
--    무효로 만들고 한도를 깎았다.
-- 3) 한도 확인과 보낸 기록을 저장 함수 한 곳에서 같은 잠금 안에 한다(INV-A8). 저장이 링크 없는 기록 한 줄을 남기고,
--    발급 함수는 그 줄에 링크를 단다. 이전에는 확인(저장)과 기록(발급)이 따로라, 동시에 온 저장 넷이 모두 통과했다.
-- 4) 링크 확인이 연락처 줄을 먼저 잠근다 — 발급과 잠그는 순서가 반대라 둘이 겹치면 교착으로 한쪽이 취소됐다.
-- 파일 전체가 한 트랜잭션이다.

begin;

-- 지금 저장된 값 중 새 꼴에 맞지 않는 것이 있으면 여기서 실패한다(로컬 시험 계정은 모두 맞는다).
alter table pii.account_contacts drop constraint account_contacts_email_check;
alter table pii.account_contacts drop constraint account_contacts_pending_email_check;
alter table pii.account_contacts add constraint account_contacts_email_check
  check (email is null or (char_length(email) <= 254 and email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'));
alter table pii.account_contacts add constraint account_contacts_pending_email_check
  check (pending_email is null or (char_length(pending_email) <= 254 and pending_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'));

-- 고치는 칸은 닉네임·알림 둘·확인 대기 이메일뿐이다(INV-A4).
-- 이메일이 확인된 이메일과도, 지금 확인 대기 이메일과도 다를 때만 새 확인이 필요하다 — 그때 true.
-- 새 확인이 필요하면 같은 잠금 안에서 지난 한 시간 개수를 세고(다섯 통이면 FK429, 아무것도 안 바뀜),
-- 보낸 기록 한 줄을 바로 남긴다. 그 줄의 해시 칸은 아무도 모르는 임의 값이라 발급 전에는 어떤 링크로도 열리지 않는다.
create or replace function public.update_my_account(p_nickname text, p_email text, p_notify_kakao boolean, p_notify_email boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_current text;
  v_pending text;
  v_needs_mail boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if char_length(v_nickname) not between 1 and 12 then
    raise exception '닉네임은 1~12자다' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' then
    raise exception '이메일 꼴이 아니다' using errcode = '22023';
  end if;
  if p_notify_kakao is null or p_notify_email is null then
    raise exception '알림 설정이 비었다' using errcode = '22023';
  end if;

  insert into pii.account_contacts (account_id) values (v_uid) on conflict (account_id) do nothing;
  -- 같은 계정의 저장·발급·링크 확인이 이 줄에서 차례로 지나간다(INV-A8). 잠그는 순서: 연락처 줄 → 확인 기록.
  select c.email, c.pending_email into v_current, v_pending
    from pii.account_contacts c where c.account_id = v_uid for update;

  v_needs_mail := (v_current is null or lower(v_current) <> lower(v_email))
              and (v_pending is null or lower(v_pending) <> lower(v_email));
  if v_needs_mail then
    if (
      select count(*) from pii.email_verifications v
      where v.account_id = v_uid and v.sent_at > now() - interval '1 hour'
    ) >= 5 then
      raise exception '확인 메일 한도를 넘었다' using errcode = 'FK429';
    end if;
    insert into pii.email_verifications (account_id, email, token_hash, expires_at)
    values (v_uid, v_email, extensions.gen_random_bytes(32), now() + interval '24 hours');
  end if;

  update public.profiles set nickname = v_nickname where id = v_uid;
  update pii.account_contacts
     set notify_kakao = p_notify_kakao,
         notify_email = p_notify_email,
         pending_email = case when v_needs_mail then v_email else pending_email end,
         updated_at = now()
   where account_id = v_uid;
  return v_needs_mail;
end;
$$;

-- 확인 대기 이메일의 가장 최근 기록(저장이 남긴 줄)에 링크를 단다. 다른 살아 있는 링크는 모두 무효(INV-A7).
-- 개수는 세지 않는다 — 기록을 남길 때 저장 함수가 이미 셌다. 저장이 남긴 줄이 없으면 링크를 만들지 않는다.
create or replace function public.issue_email_verification(p_account_id uuid)
returns table (token text, email text, nickname text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pending text;
  v_id bigint;
  v_token text;
begin
  select c.pending_email into v_pending from pii.account_contacts c where c.account_id = p_account_id for update;
  if v_pending is null then
    raise exception '확인 대기 이메일이 없다' using errcode = 'P0002';
  end if;
  select v.id into v_id from pii.email_verifications v
   where v.account_id = p_account_id and v.email = v_pending
     and v.used_at is null and v.revoked_at is null and v.expires_at > now()
   order by v.id desc limit 1
   for update;
  if v_id is null then
    raise exception '보낸 기록이 없다' using errcode = 'P0002';
  end if;

  update pii.email_verifications v set revoked_at = now()
   where v.account_id = p_account_id and v.id <> v_id and v.used_at is null and v.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update pii.email_verifications v set token_hash = extensions.digest(v_token, 'sha256') where v.id = v_id;

  return query
    select v_token, v_pending, p.nickname from public.profiles p where p.id = p_account_id;
end;
$$;

-- 링크 확인. 잠그는 순서를 저장·발급과 같게(연락처 줄 → 확인 기록) 맞췄다. 나머지 조건은 0002 와 같다.
create or replace function public.confirm_my_email(p_token text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row pii.email_verifications%rowtype;
  v_pending text;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;

  select c.pending_email into v_pending from pii.account_contacts c where c.account_id = v_uid for update;

  select * into v_row from pii.email_verifications v
   where v.token_hash = extensions.digest(p_token, 'sha256') for update;
  if not found or v_row.account_id <> v_uid or v_row.used_at is not null
     or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;
  if v_pending is null or v_pending <> v_row.email then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;

  update pii.account_contacts set email = v_row.email, pending_email = null, updated_at = now() where account_id = v_uid;
  update pii.email_verifications set used_at = now() where id = v_row.id;
  return v_row.email;
end;
$$;

-- create or replace 는 권한을 그대로 둔다. 0002 의 grant·revoke 가 유지된다.

commit;
