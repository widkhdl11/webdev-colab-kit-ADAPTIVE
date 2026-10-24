# 배포 절차 — 새 Supabase DB 에 처음부터 깔기

> 2026-10-12 작성. 빈 로컬 Supabase 에 아래 순서 그대로 깔아 보고, 지금 쓰는 로컬 DB 와 구조가 같은 것을 확인했다
> (표 74 · 함수 345 · 정책 4 · 예약 작업 3 · 저장소 버킷 2. 다른 곳은 아래 「알려진 차이」 둘뿐).
> 마이그레이션이나 manual 파일이 늘면 이 숫자도 바뀐다 — 그때 빈 DB 로 다시 확인하고 고친다.

## 순서 요약

1. 마이그레이션 전부 — `supabase db push` (이름순, 시드는 넣지 않는다)
2. `supabase/manual/` 의 파일을 번호순으로 — **`0002_account_contacts.local-seed.sql` 은 빼고**(로컬 시험 계정 전용)
3. 구조 확인 쿼리
4. 대표 계정 지정
5. 예약 실행 비밀값(BACKLOG 「배포 때 할 일 — 예약 실행 켜기」)

마이그레이션 사이사이에 manual 파일을 끼워 넣지 않아도 된다. 마이그레이션이 manual 파일의 함수를 부르는 곳은 모두
실행할 때 부르는 것이라, 만들 때는 없어도 된다. 다만 **2번이 끝나기 전에는 사이트를 쓰지 않는다** —
예: 출고·반송 확정은 manual 0006 의 함수가 없으면 오류로 멈춘다.

## 1. 마이그레이션

`projects/fankkuk` 에서:

```
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push
```

끝에 `Finished supabase db push.` 가 나오고 `Applying migration` 줄이 마이그레이션 파일 수(2026-10-12 기준 103)만큼 나와야 한다.

## 2. manual 파일 (사람이 직접 적용)

개인정보 구역(pii)을 만들고 다루는 파일이라 사람이 직접 적용한다.

CLI 가 Supabase 계정에 로그인돼 있으면 DB 비밀번호 없이 들어간다(관리 기능으로 임시 접속 계정을 만든다 — 출력의 `Initialising login role...`). `projects/fankkuk` 에서:

```
for f in $(ls supabase/manual/*.sql | grep -v local-seed); do echo "== $f"; npx supabase db query --linked -f "$f" > /dev/null || break; done
```

실패하면 그 파일에서 멈춘다. 파일마다 한 트랜잭션이라 실패한 파일은 아무것도 남기지 않는다 — 원인을 고치고 그 파일부터 다시 돌린다.

## 3. 구조 확인

```
npx supabase db query --linked -o csv "select (select count(*) from pg_tables where schemaname in ('public','pii'))||' 표 · '||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','pii'))||' 함수 · '||(select count(*) from pg_policies where schemaname in ('public','pii','storage'))||' 정책 · '||(select count(*) from cron.job)||' 예약 · '||(select count(*) from storage.buckets)||' 버킷'"
```

2026-10-12 기준 기대값: `74 표 · 345 함수 · 4 정책 · 3 예약 · 2 버킷` (마이그레이션만 들어간 상태는 `66 표 · 318 함수`).

2026-10-12 첫 운영 DB(enpghaykwlklnogcscpw)에 이 순서로 깔았고 기대값이 그대로 나왔다. 공개 키로 개인정보 구역을 부르면
「노출된 구역은 public, graphql_public 뿐」(406)으로 거부되는 것도 확인했다.

## 4. 대표 계정

운영 DB 에는 시험 계정이 없다. 대표(요금 수정·환불을 하는 운영자)는 계정을 만든 뒤 SQL 로 지정한다:

```
update public.profiles set role = 'operator' where login_id = '<아이디>';
insert into public.owner_setting (owner_user_id) select id from public.profiles where login_id = '<아이디>';
```

가입한 계정의 로그인 이메일은 `<아이디>@login.fankkuk.invalid` 꼴이다(메일이 가지 않는 예약 도메인).

## 알려진 차이 (지금 로컬 DB 와)

- 상자 검수 기록의 검사 조건 이름: 로컬은 `office_inspections_kind_check`, 새 DB 는 `office_inspections_check`. 조건 내용은 같고 이름으로 찾는 코드가 없다.
- 크리에이터 한 줄 소개의 줄바꿈 금지 정규식: 로컬은 특수 줄바꿈 문자 두 개가 글자 그대로, 새 DB 는 `  ` 표기. 뜻이 같다.
- 예약 작업 두 개(`fankkuk-expiry`·`fankkuk-notify`)가 로컬에서는 꺼져 있다 — 로컬 시드가 끈다. 새 DB 에서는 켜진 채로 생긴다.

## 시험 사이트로 쓸 때 (2026-10-12, test-site 스펙)

시험 사이트에서는 가입(휴대폰 본인 확인)·크리에이터 승인 서명·채널 확인이 가짜로 열린다. 열리려면 두 군데가 다 켜져야 한다:

1. 앱 — Vercel 설정값 두 개: `FANKKUK_TEST_SITE=1`, `APP_ORIGIN=<시험 주소>`. 시험 주소는 코드의 시험 주소 목록에 있어야 한다
   (2026-10-12: `https://webdev-colab-kit-adaptive-xqne.vercel.app`). 넣은 뒤 다시 배포해야 반영된다.
2. DB — 가짜 서명을 받는 줄 하나:
   `npx supabase db query --linked "insert into public.local_dev_flags (flag) values ('allow_fake_signatures') on conflict do nothing"`

**실제 운영 DB 에는 2번 줄을 넣지 않는다. 실제 운영 앱에는 `FANKKUK_TEST_SITE` 를 넣지 않는다.**
**시험 사이트 DB 는 실제 운영 DB 로 돌려쓰지 않는다 — 실제 운영은 새 Supabase 프로젝트를 만들어 이 문서 1~4번부터 다시 깐다.**
가짜로 확인한 번호·채널은 DB 에 진짜와 같은 모양으로 남아, 2번 줄을 지워도 가려낼 수 없다.
화면 맨 위의 「시험 사이트」 띠는 2026-10-24 지웠다(카드 d127, 카드사 심사 캡처). 1번이 켜졌는지는 가입 화면에서 휴대폰 본인 확인이 넘어가는지로 확인한다.

시험 사이트에서도 송장 출력·메일·알림톡은 운영처럼 닫혀 있다.

## 지금 배포(시험용)에서 안 되는 것

Vercel 에 올린 사이트는 코드가 운영으로 판정한다. 그래서 일부러 막아 둔 것들이 있다:

- 가입 — 휴대폰 본인 확인이 카카오 연결 전이라 운영에서는 창구가 없다(시험 사이트로 켜면 가짜로 열린다 — 위 절)
- 크리에이터의 승인 서명 — 같은 이유
- 송장 출력 — 주소 열쇠 보관처(KMS) 연결 전
- 메일 — 메일 서비스를 정하기 전
