# 가입 번호 암호화 적용 순서

가입 휴대폰 번호를 숫자 대신 암호문·해시로 바꾸는 작업(signup INV-U18)을 DB 에 적용하는 순서다. 개인정보 SQL 이라 사람이 적용한다.
**로컬에서 먼저 끝까지 해 보고, 통합 시험이 통과한 뒤 시험 사이트에 한다.**

파일:
- `supabase/manual/0028_phone_encrypt.sql` — 새 칸·함수 교체·휴대폰 비밀번호 찾기·대표 번호 보기와 접속 기록
- `scripts/phone-encrypt-backfill.mjs` — 기존 번호 변환(숫자 → 암호문·해시·앞 3자리·뒤 4자리, 숫자는 지움)
- `supabase/manual/0029_phone_plaintext_drop.sql` — 옛 숫자 칸 지우기(변환이 끝난 뒤에만 된다)

키 두 개: `FANKKUK_PHONE_ENC_KEY`(암호화) · `FANKKUK_PHONE_HASH_KEY`(같은 번호 찾기). 각각 아래 명령으로 한 번씩 만든다(둘은 달라야 한다).

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

로컬과 시험 사이트는 **서로 다른 키**를 쓴다(DB 가 다르다). 네 값 모두 비밀번호 관리 프로그램에 먼저 저장한다 — 키를 잃으면 저장된 번호를 못 열어 알림톡이 멈추고, 회원이 번호를 다시 인증해야 한다.

## 1. 로컬

> PowerShell 은 `<`(파일을 명령에 넣기)를 쓸 수 없다. 아래 `docker exec … < 파일` 명령은 `cmd /c "…"` 로 감싸서 친다
> (예: `cmd /c "docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase\manual\0028_phone_encrypt.sql"`).
> 나머지 명령(node·확인 쿼리)은 그대로 된다.

1. 키 두 개를 `.env.local` 에 넣는다(이름=값 한 줄씩). 개발 서버를 다시 켠다.
2. 0028 적용:
   ```
   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/manual/0028_phone_encrypt.sql
   ```
   끝에 나오는 네 줄(contacts_has_hash · old_email_reset_gone · reset_not_callable_by_login · backfill_not_callable_by_login)이 모두 `t`.
3. 변환 — 먼저 세어 보고, 그다음 실제로:
   ```
   node --env-file=.env.local scripts/phone-encrypt-backfill.mjs --dry-run
   node --env-file=.env.local scripts/phone-encrypt-backfill.mjs
   ```
   마지막 줄이 `… 겹침 0 · 남은 줄 0` 이어야 한다. 번호는 출력되지 않는다.
4. 확인 쿼리 — `plain_left` 0, `encrypted` 가 번호 있는 계정 수:
   ```
   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -c "select count(*) filter (where phone is not null) as plain_left, count(*) filter (where phone_hash is not null) as encrypted from pii.account_contacts;"
   ```
5. 0029 적용:
   ```
   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/manual/0029_phone_plaintext_drop.sql
   ```
   끝의 세 줄(contacts_plain_gone · verifications_plain_gone · backfill_gone)이 모두 `t`.
6. 알려 주면 에이전트가 통합 시험·화면 확인을 돌린다.

## 2. 시험 사이트

**0028 적용과 앱 배포는 붙여서 한다.** 0028 만 적용된 동안에는 옛 앱의 가입·번호 바꾸기·인증번호 받기가 거부되고, 새 앱만 배포된 동안에는 새 앱의 같은 기능이 거부된다(둘 다 안전하게 실패한다 — 숫자 번호가 저장되는 일은 없다).

1. Vercel → Settings → Environment Variables 에 시험 사이트용 키 두 개를 **Sensitive** 로 넣는다(Production·Preview).
2. 0028 을 원격 DB 에 적용한다(Supabase SQL 편집기에 파일 내용을 붙여 실행하거나 psql 로). 끝의 네 줄이 `t`.
3. 바로 앱을 배포한다(push → Vercel).
4. 변환 — 아래 네 줄만 담은 임시 파일(예: `.env.remote-backfill`)을 `projects/fankkuk` 폴더에 만든다. 이름은 정확히 이대로다(`NEXT_PUBLIC_SUPABASE_URL` 같은 앱 쪽 이름은 읽지 않는다).
   ```
   SUPABASE_URL=https://<프로젝트 ref>.supabase.co
   SUPABASE_SECRET_KEY=<Supabase → Project Settings → API Keys 의 secret 키>
   FANKKUK_PHONE_ENC_KEY=<Vercel 에 넣은 값과 같게>
   FANKKUK_PHONE_HASH_KEY=<Vercel 에 넣은 값과 같게>
   ```
   메모장으로 만들고 UTF-8 로 저장한다. PowerShell 의 `echo … > 파일` 은 UTF-16 으로 저장돼 node 가 한 줄도 읽지 못한다. 그다음:
   ```
   node --env-file=.env.remote-backfill scripts/phone-encrypt-backfill.mjs --dry-run
   node --env-file=.env.remote-backfill scripts/phone-encrypt-backfill.mjs
   ```
   끝나면 임시 파일을 지운다.
5. 확인 쿼리(SQL 편집기):
   ```
   select count(*) filter (where phone is not null) as plain_left, count(*) filter (where phone_hash is not null) as encrypted from pii.account_contacts;
   ```
6. 0029 를 적용한다. 끝의 세 줄이 `t`.
7. 운영자 화면 「보내지 못한 알림」에 `phone_unreadable` 로 남은 카카오 알림이 있으면 「알림 지금 보내기」.
8. 시험 사이트에서 비밀번호 찾기에 번호를 넣으면 「지금은 비밀번호 찾기를 이용할 수 없습니다」가 나오는 것이 맞다. 시험 사이트의 인증번호는 늘 000000 이라 열어 두면 번호만 알아도 남의 비밀번호를 바꿀 수 있어서 닫았다(2026-11-06 결정). 가입·번호 바꾸기는 000000 으로 그대로 된다.

## 문제가 생기면

- 변환이 `겹침` 을 내면: 2단계와 4단계 사이에 같은 번호로 새 가입이 생긴 것이다. 출력된 계정 ID 중 한쪽의 번호를 정리한 뒤 다시 돌린다.
- 변환이 `암호문 확인 실패` 로 멈추면: 키 값이 잘못 들어간 것이다(앞뒤 공백·따옴표). 아무것도 쓰지 않고 멈췄으니 키를 고쳐 다시 돌린다.
- 0029 가 `변환하지 않은 번호가 남아 있다` 로 멈추면: 3·4단계를 다시 한다. 아무것도 바뀌지 않았다.
