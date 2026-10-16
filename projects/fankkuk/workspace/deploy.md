---
project: fankkuk
status: deployed
basis: 22333f37e07d
---

# 배포 기록 — fankkuk

## 2026-10-16 밤 (시험 사이트)

- 운영 DB(enpghaykwlklnogcscpw): 적용 전 셈 — 찾지 못한 보류 상자 0 · 미확인 입고 0 · 계정 0. `supabase db push` 로 마이그레이션 21개(20261014000001 ~ 20261016000013, 개인정보 구역 접촉 0).
- 사람이 적용: manual 0017(크리에이터 주소 이름표)·0018(가입 닉네임) — 확인 쿼리로 `pii.creator_addresses.label` 있음, `create_account` 에 `p_nickname` 인자 있음. 0016 은 이전에 적용돼 있었다.
- Vercel 환경 변수 `FANKKUK_IP_HASH_SECRET` (사용자).
- 앱: main 7bd1d387 push → Vercel 세 프로젝트 빌드 success. 시험 주소 https://webdev-colab-kit-adaptive-xqne.vercel.app 에서 `/`·`/creators`·`/signup`·`/login` 모두 200, 「시험 사이트」 띠 보임, 크리에이터 찾기는 본인 확인된 크리에이터가 없어 「전체 0명」(새 읽기 함수 오류 없음).
