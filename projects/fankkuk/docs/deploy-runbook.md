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
npx supabase db push --remote --dry-run   # 적용할 파일 목록만 본다
npx supabase db push --remote
```

지금 CLI 는 `--remote` 가 없으면 원격이 아니라 로컬 DB(127.0.0.1:55322)를 겨눈다(2026-11-05 확인). 에이전트가 실행할 때는 확인 질문을 못 받아 멈추므로, 사람이 적용을 지시했을 때만 `--yes` 를 붙인다.

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

## 배포 전 요금 검사 (admin-console INV-K16 (c), 2026-11-07)

배포 전에 대상 DB 에서 요금 검사를 돌려 실패 목록이 비었는지 본다. 한 줄이라도 나오면 /admin/pricing 에서 대표가 받는 값·택배비를 고친 뒤 다시 본다:

```
npx supabase db query --linked -o csv "select * from public.admin_pricing_check()"
```

기대값: 머리줄만(실패 0줄). `fan_gift` = 팬 선물 받는 값 < 기본 경로 원가 + 검수비, `fan_send` = 팬에게 보내기 택배비 < 기본 경로 원가(100원 반올림), `route_incomplete` = 기본 경로에 빈칸.
요금표의 택배 원가 칸은 이 마이그레이션(20261107000002)이 덮지 않는다 — 기본 경로 값과 다르면 대표가 경로표를 한 번 저장할 때 맞춰진다.

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

## 운영 전환 체크리스트 — 문자·알림톡·승인 서명 (2026-10-29)

시험 사이트에서 운영으로 넘어갈 때 하나씩 확인한다. 하나라도 못 하면 운영 가입·승인은 열지 않는다.

- [ ] 솔라피: 발신번호 등록 완료, 카카오 채널 연동 완료, 인증번호 템플릿·상태 알림 템플릿 검수 승인. Vercel 운영에 `SOLAPI_API_KEY`·`SOLAPI_API_SECRET`·`SMS_SENDER_NUMBER`·`KAKAO_PF_ID`·`SOLAPI_PHONE_CODE_TEMPLATE_ID`
- [ ] 상태 알림 템플릿 ID 를 운영 DB 의 `notification_kakao_templates` 에 종류별로 넣음(넣은 종류만 알림톡으로 간다)
- [ ] 드림시큐리티: 운영용 키 파일(`eziok_keyInfo.dat`)과 운영 등록 사이트 주소를 받음, 카카오 운영 전환(운영용 settle_id) 완료 통보를 받음
- [ ] 게이트웨이 서버 환경 변수 파일을 운영 값으로: `DREAM_ENV=production`, `DREAM_KEY_FILE`·`DREAM_KEY_PASSWORD` 는 운영 키, `OUTBOUND_ALLOWED_HOSTS` 에 `cert-dir.ez-iok.com`
- [ ] **테스트 키 삭제 확인** (드림시큐리티 계약 제13조) — 게이트웨이 서버·내 PC·메일 첨부·저장소 어디에도 개발용 `eziok_keyInfo.dat` 가 남지 않았는지 확인하고 지운다. 서버에서 `sudo find / -name 'eziok_keyInfo*' 2>/dev/null` 결과가 운영 키 파일 하나뿐이어야 한다
- [ ] 운영 DB 에 `supabase/manual/0026`·`0027`·`0028` 적용(앱 배포와 같이 — `0028` 은 마이그레이션 `20261029000010` 뒤)
- [ ] 운영 DB 에 `supabase/manual/0030` 적용(제주·도서 할증 — 앱 배포와 같이, 마이그레이션 `20261108000001` 뒤. 옛 앱의 주소 저장은 이 파일 뒤에 실패한다)
- [ ] 운영 DB 에 `supabase/manual/0031` 적용(선물함 신청의 주소 사본 — 마이그레이션 `20261108000004` 뒤, 선물함 화면을 여는 배포와 같이. 적용 전에는 신청·마감·취소가 실패한다)
- [ ] 운영 DB 에 `supabase/manual/0032` 적용(팬 주소 등록 없애기 — `0031` 다음, 앱 배포와 같이. **팬이 설정에 등록한 받을 주소 표 `pii.fan_addresses` 가 통째로 지워진다**(되돌릴 수 없음). 적용 전 새 앱은 선물 등록이 결제창 전에 실패하고, 적용 뒤 옛 앱은 역조공 받기·반송 주소 확인이 실패한다)
- [ ] 운영 DB 에 `supabase/manual/0033` 적용(선물함 3부 — 명세서가 신청 사본의 할증 구분을 읽는 함수, 사본 삭제 까닭에 「도착 안 함」. 마이그레이션 `20261109000001` 과 `0032` 다음, 선물함 3부 배포와 같이. 지우는 표·데이터 없음. 적용 전에는 입고·실측은 되고 명세서가 만들어지지 않고 기다리며, 첫 입고 + 168시간의 도착 안 함 처리가 실패해 남는다 — 적용 뒤 5분 안에 예약 작업이 기다리던 것을 처리한다)
- [ ] 운영 DB 에 `supabase/manual/0034` 적용(선물함 4부 — 송장 출력 때 신청 사본을 내주는 함수, 사본 삭제 까닭에 「미결제 반송」·「출고 + 72시간」. 마이그레이션 `20261109000002` 와 `0033` 다음, 선물함 4부 배포와 같이. 지우는 표·데이터 없음. 적용 전에는 결제·출고 확정은 되고 송장 출력이 실패하며, 명세서 + 168시간 미결제 반송과 출고 + 72시간 사본 삭제가 실패해 남는다 — 168시간 뒤에는 결제 시작이 거부되므로 돈은 나가지 않고, 적용 뒤 5분 안에 예약 작업이 처리한다)
- [ ] 배송 조회 서비스(택배API) 연결 — 마이그레이션 `20261109000010` 은 앱 배포와 같이(적용해도 설정값이 estimate 라 동작은 그대로다). 운영 DB 에 `supabase/manual/0035` 적용(역조공 몫의 팬 주소 사본을 지우는 때를 설정값에 묶는다 — `0032` 다음. 지우는 표·데이터 없음. **설정값을 webhook 으로 바꾸기 전에** 적용한다 — 안 하면 역조공 몫 사본만 배달 전에 출고 + 72시간으로 지워진다)
- [ ] 택배API 환경 변수(Vercel, Sensitive): `DELIVERY_API_KEY`·`DELIVERY_API_SECRET`(구독·수동 조회), `DELIVERY_API_WEBHOOK_SECRET`(웹훅 서명 키), `DELIVERY_API_ENDPOINT_ID`(웹훅 주소 번호). 넷 중 키·시크릿이 없으면 구독하지 않고(대기 줄만 남는다), 서명 키가 없으면 웹훅을 모두 401 로 거부한다 — 기동은 막지 않는다
- [ ] 웹훅 주소 등록(배포된 HTTPS 주소에서만 — 로컬로는 받을 수 없다): 대표가 택배API 콘솔이나 `POST https://api.deliveryapi.co.kr/v1/webhooks/endpoints`(본문 `{"url":"https://<운영 도메인>/api/delivery/webhook","name":"팬꾹"}`, 인증 머리 `Authorization: Bearer {키}:{시크릿}`)로 등록 → 받은 `endpointId` 를 `DELIVERY_API_ENDPOINT_ID`, 한 번만 보여 주는 `webhookSecret` 을 `DELIVERY_API_WEBHOOK_SECRET` 에 넣고 다시 배포
- [ ] 전환: 운영자 「자동 처리 현황」의 배송 조회 칸에서 구독·수신이 도는 것을 며칠 본 뒤, 운영 DB SQL 편집기에서 `update public.delivery_settings set source = 'webhook';` — 화면 단계·헤더 아이콘·선물함 delivered·팬 주소 사본 삭제(배달 완료 + 24시간)·탈퇴 기준(배달 완료)이 함께 바뀐다. 되돌리기는 `'estimate'`
- [ ] 선물함 4부 배포 때 서명 게이트웨이의 송장 출력 묶음을 다시 만들어 올린다(`node sign-gateway/scripts/build-decryptor.mjs`) — 선물함 신청 번호(GB…)로 출력하는 길이 그 묶음 안에 있다. 옛 묶음은 GB 번호를 팬 선물·역조공 상자로 보고 「실패」로 답한다
- [ ] 앱 서버 환경 변수 `SIGN_GATEWAY_URL`·`SIGN_GATEWAY_TOKEN` 둘 다 넣음 — 하나라도 없으면 운영에서 승인·승인 서명 연결 요청이 거부된다
- [ ] 첫 운영 서명 1건으로 원문 감싼 틀·폐기 확인(OCSP) 주소가 허용 목록 안에서 통과하는지 게이트웨이 로그로 확인
