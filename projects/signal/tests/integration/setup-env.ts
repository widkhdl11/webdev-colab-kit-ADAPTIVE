// 통합 테스트가 앱과 **같은 방법으로** .env 를 읽게 한다.
//
// 직접 파싱하지 않는 이유: 우선순위·따옴표 처리 규칙이 실제 실행과 갈리면
// "테스트에선 보이는데 앱에선 안 보인다"가 된다. Next 가 쓰는 로더를 그대로 쓴다.
//
// 값은 process.env 에만 들어가고 출력되지 않는다 — 아래 테스트들도 값을 찍지 않는다.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });
