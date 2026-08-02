---
feature: 원문 렌더 보안 (content rendering safety)
status: approved     # 설계 승인 2026-08-02. INV 테스트(TDD) 후 구현. spec-coverage 게이트가 INV 커버리지 추적.
                     # 2026-08-02 리뷰 반영: D5 를 alt 처리로 한정(레이아웃 붕괴 방지는 rules/ui-layers 로 이관).
---
# 원문 렌더 보안 스펙

상세 화면은 외부에서 수집한 원문 본문(HTML)을 사이트 안에서 그대로 보여준다(DECISIONS: 링크아웃 아님).
수집한 HTML은 우리가 통제하지 않은 제3자 콘텐츠이므로 **신뢰 경계 밖**이고, 검증 없이 렌더하면
저장된 콘텐츠에서 스크립트가 실행되는 XSS(stored XSS)가 된다. 킷 게이트는 이미 dangerouslySetInnerHTML을
원천 차단하므로(DECISIONS 참조), 렌더는 sanitize + 파서 방식으로 설계한다.

## 불변식 — 각각 참/거짓 판정 가능. 위반 시 무슨 일이 일어나는지 / 어디서 강제되는지 명시

- INV-D1: 저장된 원문 HTML은 신뢰 경계 밖이다. 화면에 렌더하기 전 반드시 sanitize(허용 태그·속성
  화이트리스트)를 거친다. 원본 HTML을 그대로 렌더하는 경로는 존재하지 않는다. (강제 위치: 서버/렌더 경로 — sanitize-html)
  위반 시: 저장된 콘텐츠에서 스크립트 실행(stored XSS) → 세션·데이터 탈취.

- INV-D2: sanitize는 화이트리스트 방식이다 — 허용 태그(p·a·h1~h6·ul·ol·li·code·pre·blockquote·img·
  strong·em·br 등)와 허용 속성만 통과시키고, script·style 태그, on* 이벤트 핸들러 속성, `javascript:`
  스킴 URL은 제거한다. 블랙리스트가 아니라 화이트리스트다. (강제 위치: sanitize 설정)
  위반 시: 블랙리스트 누락 벡터로 우회당함.

- INV-D3: 렌더는 dangerouslySetInnerHTML을 사용하지 않는다. sanitize된 HTML을 파서(html-react-parser
  등)로 React 엘리먼트 트리로 변환해 렌더한다. (강제 위치: 게이트 — dangerouslySetInnerHTML 사용 차단)
  위반 시: 게이트 위반 + XSS 표면 재도입.

- INV-D4: 본문 내 외부 링크와 출처 링크(a[target=_blank])는 rel="noopener noreferrer"를 갖는다.
  (강제 위치: 렌더 시 속성 강제 + rules/ui-layers)
  위반 시: 탭내빙(opener를 통한 피싱 리다이렉트).

- INV-D5: 본문 내 이미지는 alt 속성을 보존한다. alt가 없으면 빈 alt=""로 채워 장식 이미지로 처리한다
  (스크린리더가 건너뜀). (강제 위치: sanitize)
  위반 시: 스크린리더 사용자에게 의미 없는 이미지 노이즈.
  (이미지 로드 실패·과대 이미지의 레이아웃 붕괴 방지는 이 보안 스펙 범위 밖 — rules/ui-layers 로 이관. 비범위 참조.)

## 시나리오 — 각각 어느 불변식을 검증하는지 ID 참조 (불변식마다 실패 경로 1개 이상)

- S1 (INV-D1/D2, 실패경로): Given 본문에 `<script>alert(1)</script>`가 포함된 원문 /
  When 상세 렌더 / Then script는 제거되고 실행되지 않는다.
- S2 (INV-D2, 실패경로): Given `<img src=x onerror=alert(1)>` / When sanitize /
  Then onerror 속성이 제거되고 img는 src만 남거나 걸러진다.
- S3 (INV-D2, 실패경로): Given `<a href="javascript:alert(1)">x</a>` / When sanitize /
  Then href의 javascript: 스킴이 제거된다(링크 무력화).
- S4 (INV-D3, 실패경로): Given 렌더 컴포넌트 / When 소스에서 dangerouslySetInnerHTML 검색 /
  Then 사용처가 없다(게이트 통과).
- S5 (INV-D2): Given 정상 본문(p·h2·code·ul) / When 렌더 / Then 서식이 유지된 채 안전하게 표시된다.
- S6 (INV-D4, 실패경로): Given 본문에 target=_blank 외부 링크 / When 렌더 /
  Then rel="noopener noreferrer"가 부여돼 있다.
- S7 (INV-D5): Given alt 없는 본문 이미지 / When 렌더 / Then alt=""(장식)로 처리돼 스크린리더가 건너뛴다.

## 신뢰 경계

- 믿는 값: sanitize 함수를 통과한 뒤의 HTML(화이트리스트 결과), 우리 렌더 컴포넌트가 부여하는 속성(rel 등).
- 믿지 않는 값: 저장된 원문 HTML 원본 전체(태그·속성·URL·이미지 src), 소스가 준 본문의 모든 마크업.

## 비범위

- 수집·중복제거·요약·랭킹 → 별도 스펙(ingestion-ranking.md).
- 원문 본문 추출 자체의 품질(파편·광고 잔여물 제거) → 수집 구현 시 다룸, 보안 불변식 아님.
- 이미지 로드 실패·과대 이미지의 레이아웃 붕괴 방지 → UI/접근성 사안이라 rules/ui-layers(일반 UI 규칙)로 이관.
  상세 페이지 구현 시 CSS(max-width:100%·height:auto·내재 치수 보존)로 강제. (2026-08-02 리뷰 지적으로 D5에서 분리)
- iframe 격리 렌더(대안으로 검토했으나 sanitize+파서 채택) → 비범위.
- CSP 헤더 등 배포 레벨 방어(Vercel) → 후속 강화(권장이나 이 스펙의 불변식은 렌더 경로에 한정).
