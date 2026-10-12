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
npx supabase link --project-ref <프로젝트 ref>      # DB 비밀번호를 묻는다
npx supabase db push
```

끝에 `Finished supabase db push.` 가 나오고 `Applying migration` 줄이 마이그레이션 파일 수(2026-10-12 기준 103)만큼 나와야 한다.

## 2. manual 파일 (사람이 직접 적용)

개인정보 구역(pii)을 만들고 다루는 파일이라 에이전트가 적용하지 않는다(.claude/rules/supabase-fankkuk.md).

DB 접속 주소는 Supabase 대시보드 → 상단 **Connect** → **Session pooler** 의 주소를 쓴다
(Direct connection 은 IPv6 전용이라 집 PC·Docker 에서 안 닿는 경우가 많다). `[YOUR-PASSWORD]` 자리에 DB 비밀번호를 넣는다.

psql 은 로컬 Supabase 컨테이너 안의 것을 빌려 쓴다(로컬 Supabase 가 켜져 있어야 한다). Git Bash 에서, `projects/fankkuk` 에서:

```
DB='<Session pooler 주소>'
for f in $(ls supabase/manual/*.sql | grep -v local-seed); do
  echo "== $f"
  docker exec -i supabase_db_fankkuk psql "$DB" -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

실패하면 그 파일에서 멈춘다. 파일마다 한 트랜잭션이라 실패한 파일은 아무것도 남기지 않는다 — 원인을 고치고 그 파일부터 다시 돌린다.

## 3. 구조 확인

```
docker exec -i supabase_db_fankkuk psql "$DB" -At -c "select (select count(*) from pg_tables where schemaname in ('public','pii'))||' 표 · '||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','pii'))||' 함수 · '||(select count(*) from pg_policies where schemaname in ('public','pii','storage'))||' 정책 · '||(select count(*) from cron.job)||' 예약 · '||(select count(*) from storage.buckets)||' 버킷';"
```

2026-10-12 기준 기대값: `74 표 · 345 함수 · 4 정책 · 3 예약 · 2 버킷`

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

## 지금 배포(시험용)에서 안 되는 것

Vercel 에 올린 사이트는 코드가 운영으로 판정한다. 그래서 일부러 막아 둔 것들이 있다:

- 가입 — 휴대폰 본인 확인이 카카오 연결 전이라 운영에서는 창구가 없다
- 크리에이터의 승인 서명 — 같은 이유
- 송장 출력 — 주소 열쇠 보관처(KMS) 연결 전
- 메일 — 메일 서비스를 정하기 전
