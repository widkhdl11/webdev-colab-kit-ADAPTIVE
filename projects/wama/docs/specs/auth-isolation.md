---
feature: 인증·학원 격리 (auth & academy isolation)
status: approved     # 설계 승인 2026-07-21. 2026-07-25 Supabase 프로비저닝 + INV-A1~A8 통합 테스트
                     # (projects/wama/tests/inv/auth-isolation.integration.test.ts) green → approved 전환.
                     # 보안 강화 이력: 0003(gen_random_bytes 스키마 버그), 0004(search_path pg_temp 섀도잉).
surfaces: [auth, authz]   # 로그인·세션(INV-A1~A2)과 학원 격리·RLS(INV-A3~A8)를 이 스펙이 커버한다.
                          # 게이트(risk-surface)가 이 줄을 읽는다 — 2026-08-13 필드 신설로 소급 기재.
---
# 인증·학원 격리 스펙

멀티테넌트: 하나의 서비스에 여러 학원(academy)이 있고, 각 teacher는 정확히 한 학원에 속한다.
같은 학원 선생님끼리는 학생·시간표·평가를 공유하지만, 타 학원 데이터는 존재조차 보이면 안 된다.
핵심 위험은 **미성년 학생 개인정보의 학원 간 유출**과 **위조된 소속으로의 잠입**이다.

## 불변식 — 각각 참/거짓 판정 가능. 위반 시 무슨 일이 일어나는지 / 어디서 강제되는지 명시

- INV-A1: 인증 세션(auth.uid())이 없는 요청은 academy·teacher·student·schedule·evaluation
  어느 테이블도 읽거나 쓸 수 없다. (강제 위치: 서버 — Supabase RLS, 모든 테이블 authenticated 전용 정책)
  위반 시: 비로그인 상태로 전체 학생 데이터 노출.

- INV-A2: 모든 조회·수정·삭제는 요청자 teacher의 academy_id와 일치하는 행으로만 제한된다.
  타 학원 행은 결과에 나타나지 않는다(존재 불가시). (강제 위치: 서버 — RLS USING(academy_id = 요청자 소속))
  위반 시: 타 학원 학생·평가·시간표 열람/변경 → 개인정보 유출.

- INV-A3: insert/update 시 행의 academy_id는 클라이언트가 보낸 값이 아니라 서버가 요청자 세션의
  소속으로 강제한다. 다른 academy_id를 넣은 write는 거부된다. (강제 위치: 서버 — RLS WITH CHECK(academy_id = 요청자 소속))
  위반 시: 위조된 academy_id로 타 학원에 데이터 주입.

- INV-A4: 모든 teacher는 정확히 하나의 academy에 속한다(academy_id NOT NULL). 회원가입은
  학원 생성 또는 참여와 원자적으로 끝나 — 소속 없는 teacher 상태가 지속되지 않는다.
  (강제 위치: 서버 — 스키마 NOT NULL + 가입 RPC의 원자성)
  위반 시: 소속 미정 계정이 데이터에 접근하거나, 절반 만들어진 상태 잔존.

- INV-A5: teacher는 자신의 academy_id를 임의 값으로 직접 설정·변경할 수 없다. 학원 참여는
  서버 RPC(참여 코드 검증 → 소속 지정)로만 이뤄진다. (강제 위치: 서버 — 참여 RPC + teacher.academy_id
  클라이언트 update 차단 RLS)
  위반 시: 코드 없이 원하는 학원에 잠입.

- INV-A6: 학원 참여 코드는 추측 불가한 높은 엔트로피 값이고, 검증은 서버에서만 수행된다.
  코드 문자열 자체는 신뢰 경계 밖. 재발급 시 이전 코드는 무효화된다. (강제 위치: 서버 — RPC 검증 + 무작위 코드 생성)
  위반 시: 코드 무차별 대입 또는 유출된 옛 코드로 잠입.

- INV-A7: service_role 등 서버 전용 시크릿은 클라이언트 번들·코드에 존재하지 않는다. 브라우저엔
  anon 키만. (강제 위치: 게이트 NO_HARDCODED_SECRET + 배치 규칙 rules/supabase.md)
  위반 시: 클라이언트에서 RLS 우회(모든 학원 데이터 접근).

- INV-A8: evaluation은 작성자(author_teacher_id)를 최초 작성 시점 요청자로 기록하며, 이후 수정에서
  author_teacher_id는 바뀌지 않는다. 내용·삭제는 같은 학원 누구나 가능(공유 편집)하되 작성자 표기는 불변.
  (강제 위치: 서버 — insert 시 author = auth 기반, update가 author 컬럼을 변경하지 못하게)
  위반 시: 남의 평가를 타인 명의로 위조하거나 작성 책임 소재 조작.

## 시나리오 — 각각 어느 불변식을 검증하는지 ID 참조 (불변식마다 실패 경로 1개 이상)

- S1 (INV-A1): Given 로그아웃 상태 / When student 목록을 조회 / Then 어떤 행도 반환되지 않는다(거부 또는 0행).
- S2 (INV-A2): Given 학원 A teacher 로그인 / When 학원 B student를 id로 직접 조회 / Then 결과 없음.
- S2b (INV-A2, 실패경로): Given 학원 A teacher / When 클라이언트가 .eq('academy_id') 필터를 빼고 select /
  Then 그래도 A 학원 행만 반환 — RLS가 필터 없이도 격리를 강제한다.
- S3 (INV-A3, 실패경로): Given 학원 A teacher / When academy_id를 B로 위조해 student insert / Then 거부(WITH CHECK 위반).
- S4 (INV-A5, 실패경로): Given teacher / When 참여 코드 없이 teacher.academy_id를 다른 학원으로 update 시도 / Then 거부.
- S5 (INV-A6, 실패경로): Given 무효·추측 코드 / When 참여 RPC 호출 / Then 거부되고 소속은 변하지 않는다.
- S6 (INV-A4): Given 신규 가입(학원 생성 경로) / When 가입 완료 / Then teacher.academy_id가 새 academy로 설정돼 정확히 1개 소속.
- S7 (INV-A7, 실패경로): Given 빌드된 클라이언트 번들 / When service_role/시크릿 문자열을 검색 / Then 발견 없음(게이트 통과).
- S8 (INV-A8, 실패경로): Given 학원 A teacher가 타인이 쓴 평가를 수정 / When update로 author_teacher_id를 자신으로 변경 시도 /
  Then author_teacher_id는 최초 작성자로 유지되고, 내용만 수정된다.

## 신뢰 경계
- 믿는 값: Supabase Auth가 검증한 auth.uid()(JWT), 서버 DB의 teacher→academy_id 매핑, RLS 정책.
- 믿지 않는 값: 클라이언트가 보내는 모든 값 — academy_id, student_id, author_teacher_id, 참여 코드 문자열,
  클라이언트의 .eq 필터, URL 파라미터. (표시·UX용일 뿐 인가 근거가 아니다)

## 비범위
- 역할 차등(원장 vs 강사 권한) — MVP는 학원 내 평등. 후속.
- 학생·학부모 로그인.
- 일회성/만료 초대 링크 — 재사용 참여 코드 채택.
- 2FA, 비밀번호 정책 세부(Supabase Auth 기본에 위임), 감사 로그.
- 평가 이미지/PDF 내보내기 자체의 보안(별도 고려).
