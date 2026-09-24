---
project: signal
status: deployed
basis: 1fb51f47ce56
---
# deploy — signal

**운영 공개 주소**: https://www.simoori.com/ (2026-09-24 사용자가 도메인 연결 · `simoori.com` 은 www 로 308). 예전 https://webdev-colab-kit-adaptive-xi.vercel.app/ 도 열린다. 배포별 주소(`…-<해시>-widkhdl11s-projects.vercel.app`)는 로그인이 필요하다 — 배포 뒤 확인은 이 주소로 한다.

> 이 마커가 deploy 노드를 clean으로 만든다. `status: deployed` 가 되어야 clean이고, basis는
> 구현(src/**) 해시 — 구현이 바뀌면 불일치로 배포 기록이 낡는다(재배포 강제).
> `status:` 값은 짧은 한 줄로 둔다. 뒤에 긴 주석을 달면 포매터가 값을 다음 줄로 접어
> 게이트 정규식(`^\s*status:\s*...`)이 못 읽는다.

## 2026-09-24 (4) — 판정 검토 탭 · 매주 표본 뽑기 (ef792b6)

- **순서**: 사용자가 0012(판정 검토 테이블 셋·함수·트리거) 적용 → 통합 테스트 52 통과 → 9/21 주 표본 20건 옮김 → push.
- **운영 확인**: Vercel 상태 success · `curl` 로 `/` 200(`<title>simoori</title>`) · `/dev/ingest/review`·`/dev/ingest` 404(운영에서는 안 열림) · `/api/ingest` 비밀키 없이 401.
- **남은 확인**: 첫 주간 뽑기는 09-28(월) 07시 수집 실행 — 그때 9/28 주 표본이 생기고 9/21 주가 닫힌다. 실행 기록 `verdict_review_run` 에서 확인한다.

## 2026-09-24 (3) — 뱃지 줄은 펼친 날만 센다 (7a067dc)

- 운영 확인(`curl`, `전체` 자리): 뱃지 수 처음 11개 · `days=2` 35개 · `days=3` 49개, 더 보기 문구 「어제 83건」→「9월 22일 (화) 128건」→「9월 21일 (월) 138건」.

## 2026-09-24 (2) — 사이트 이름 simoori (d893839)

- push 뒤 약 1분에 운영 반영. `curl https://www.simoori.com/` 로 확인: `<title>simoori</title>` · 로고 `simoori.` · 푸터 `simoori — 개인용 소식 리더`.

## 2026-09-24 — 요약 Opus 5.5 · 피드 `전체` 자리 · 이어달리기 경계 (38a6fb3)

- **순서**: 마이그레이션 없음. push 한 번.
- **운영 확인**: push 60초 뒤 www.simoori.com 첫 화면에 새 자리 줄(`전체·핫이슈·소식·스킬·툴`)과 뱃지 줄 `전체` 칩 ·
  `?tab=all` 200 · `/api/ingest` 를 비밀키 없이 부르면 401.
- **남은 확인**: opus 로 요약하는 첫 예약 실행은 09-25 07시. 버셀 환경변수 `INGEST_BASE_URL` 은 사용자가 09-24 에 `https://www.simoori.com`
  으로 바꿨다고 알려 옴 — **www 없이 적으면 이제 이어달리기가 바로 끊긴다**(리다이렉트를 안 따라가게 바꿨다).
  실제로 이어졌는지는 09-25 07시 실행 기록에서 확인한다.

## 2026-09-23 — 상세 화면 재구성 + 요약 불합격 한도 (277d475)

- **순서**: 0011(한 줄 요약·표·판정 근거·`summary_failures` 칸) 사용자가 먼저 적용 → push. 반대 순서면 상세 전부 500.
- **실행 근거**: GitHub 배포 상태 `Production success` (2026-09-23T12:04:51Z, Vercel). 리뷰 사인오프 basis 와 같다.
- **운영 확인** (같은 날 저녁, 사용자가 공개 주소를 알려 준 뒤): 첫 화면 200 · 상세 200(옛 형식 펼치기 줄 있음) ·
  `/api/ingest` 를 비밀키 없이 부르면 401. 새 형식 요약이 실제로 쌓이는 것은 09-24 07시 예약 실행에서 처음 본다.

## 2026-08-13 — 첫 배포 (진행 중)

### 배포 전 확인 — 끝남

로컬 `projects/signal` 에서 실행한 결과:

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | 오류 0 |
| `npm run build` | 라우트 4개 성공 (`/` · `/_not-found` · `/api/ingest` · `/articles/[id]`) |
| `npm test` | 37파일 **485개 통과** |

`main` 에 fast-forward 병합 후 push 완료: `b623bcd..229c776`.

빌드 경고 1건 — Next가 workspace root를 `C:\Users\PC` 로 추론한다. 원인은 사용자 홈의
`C:\Users\PC\package-lock.json` 이고 **레포 루트에는 lockfile이 없다.** Vercel에는 그 파일이
없으므로 배포에는 영향이 없다(로컬 전용 경고).

### Vercel 프로젝트 설정 — 사용자가 직접

1. **Import**: GitHub 레포 `widkhdl11/webdev-colab-kit-GRAPH` 를 Vercel에 연결
2. **Root Directory**: `projects/signal` — 레포 루트에는 `package.json` 이 없으므로 이 설정이 없으면 빌드가 시작조차 못 한다
3. **Framework Preset**: Next.js (자동 감지)
4. **Production Branch**: `main`

### 환경변수 5개

Vercel 프로젝트 Settings → Environment Variables. 이름은 코드가 읽는 것과 **글자 그대로** 같아야 한다.

| 이름 | 읽는 곳 | 빠지면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `shared/api/public-env.ts:15` | 피드가 못 뜬다 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `shared/api/public-env.ts:16` | 피드가 못 뜬다 |
| `SUPABASE_SECRET_KEY` | `shared/api/server-env.ts:30` | 수집 라우트 500 |
| `ANTHROPIC_API_KEY` | `shared/api/server-env.ts:38` | 요약만 실패하고 적재는 끝까지 간다(INV-S2) |
| `CRON_SECRET` | `app/api/ingest/route.ts:27` | `/api/ingest` 가 503으로 **막힌다**(열리지 않는다) |

`CRON_SECRET` 은 값을 우리가 정한다(무작위 16자 이상). Vercel이 Cron을 부를 때 그 값을
`Authorization: Bearer <값>` 헤더로 자동으로 붙여 주고, 라우트가 정확히 그 형태를 비교한다.

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 는 4세션에 **다른 프로젝트 키를 넣어 401** 이 났던 자리다.
이름·형식·길이가 다 정상이어도 붙지 않는다. `npm run check:env` 가 실제로 붙여 보고 확인한다(값은 안 찍는다).

### Cron 동작 — 공식 문서로 확인한 것

`vercel.json` 의 `{"path": "/api/ingest", "schedule": "0 22 * * *"}` 에 대해:

- **부르는 방식은 GET**이다. 라우트를 POST에서 GET으로 바꾼 이유가 이것이고, 맞다.
- **시간대는 항상 UTC.** `0 22 * * *` = **KST 07:00**.
- **Hobby는 시각이 정확하지 않다** — 지정한 "시" 안의 아무 때나 부른다. 즉 실제로는
  **KST 07:00~07:59 사이**에 돈다. 하루 1회 제한도 있는데 이 표현식은 하루 1회라 통과한다.
- **실패해도 재시도하지 않는다.** 증상이 "수집이 조용히 0"으로만 나타나므로 Cron Jobs 화면의
  View Logs로 확인해야 한다.
- **중복 호출이 있을 수 있다**(delivery는 best effort). 우리 수집은 정규화 원문 URL의 unique +
  upsert(INV-C1)라 두 번 돌아도 안전하다.
- `maxDuration = 300` 은 **Hobby의 최대치**와 같다. 시간 예산 240초가 그 안에서 먼저 멈춘다.

### 배포 후 확인할 것

1. 피드 화면이 실제 데이터로 뜨는가 (더미가 아닌 Supabase 값)
2. 상세 화면 진입 → 읽음 표시가 남는가
3. `/api/ingest` 를 `Authorization: Bearer <CRON_SECRET>` 없이 부르면 **401**
4. 헤더를 붙여 한 번 수동 호출 → 응답 JSON의 수집·요약·실패 숫자
5. Cron Jobs 설정 화면에 `/api/ingest` 가 등록됐는지

전부 확인되면 이 파일의 `status` 를 `deployed` 로 바꾸고 배포 URL과 위 4번의 실행 숫자를 아래에 적는다.

### 실행 근거

(배포 후 채운다 — 돌린 명령과 결과 숫자. 안 돌렸으면 안 돌렸다고 적는다.)
