// 주제 판정 기준(TOPIC_SCOPE)이 실제로 원하는 대로 갈라 주는지 **실제 모델에 물어** 확인한다.
//
// 왜 필요한가: 판정 기준은 사람이 취향으로 고치는 문장이라 유닛 테스트가 옳고 그름을 못 잡는다.
// 문장에 "해프닝은 거른다"를 적어도 모델이 그렇게 판단하는지는 불러 봐야 안다. 반대로 수집을
// 통째로 돌려 눈으로 보는 방법은 느리고, 요약·번역 요금까지 같이 나가고, 그날 새 글이 뭐가
// 왔느냐에 따라 확인할 수 있는 경우가 달라진다.
//
// 여기 적힌 기대값은 **사용자가 실제 피드를 보고 직접 내린 판정**이다(2026-08-13). 추측이 아니다.
// 기준을 고칠 때마다 이걸 돌려 CASES 가 전부 그대로 갈리는지 본다.
// 오판이 나오면 그 제목을 CASES 에 더한다 — 목록이 늘수록 다음 수정이 안전해진다.
//
// 실행: npm run check:topic
// 요금: 제목 하나에 800~900 입력 토큰짜리 호출 한 번(쓸모 축이 붙어 427 → 826 이 됐다).
//       지금 목록이면 1센트 남짓이다.
//
// 지시문은 src/features/ingestion/lib/build-topic-prompt.ts 에서 그대로 가져온다 —
// 여기서 베끼면 고치는 순간 확인 대상과 실물이 갈린다.

import Anthropic from "@anthropic-ai/sdk";
// 이름 가져오기로 쓴다 — tsx 가 CJS 로 옮기면 기본 가져오기가 undefined 가 된다.
import { loadEnvConfig } from "@next/env";
import { fenceData } from "../src/features/ingestion/lib/data-fence";
import { buildTopicPrompt } from "../src/features/ingestion/lib/build-topic-prompt";
import { topicVerdict } from "../src/features/ingestion/lib/topic-verdict";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

// api/ports.ts 와 같은 값이어야 한다. 다르면 여기서 본 결과가 실제와 어긋난다.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 200;
const TIMEOUT_MS = 15_000;

interface Case {
  title: string;
  /** 통과해야 하는가. 사용자 판정이 근거다. */
  expect: boolean;
  /** 왜 그렇게 판정했는지 — 나중에 기준을 손볼 때 이 줄이 근거가 된다. */
  why: string;
}

const CASES: Case[] = [
  // ── 걸러야 하는 것 ─────────────────────────────────────────────
  {
    title: '"알트먼이 사망했다?"...구글 검색 오류 해프닝, 원인은 \'위키피디아 훼손\'',
    expect: false,
    why: "일어났다 끝난 해프닝. AI 소재이지만 읽고 나서 쓸 것이 없다",
  },
  {
    title: "인공지능이 기후에 맞게 '고단백 미세조류 스피루리나' 키운다!",
    expect: false,
    why: "AI 가 남의 분야(농업·식품)에 한 번 쓰였다는 단발 사례",
  },
  {
    title: "삼성SDS, 중앙부처 9곳에 AI 협업 솔루션 '브리티웍스' 공급",
    expect: false,
    why: "'어디에 팔렸다'가 본문 전부. 기술 내용도 성능 숫자도 없다",
  },
  {
    title: "세계 전력 10% 태양광 시대…배터리가 저녁 전력시장 넓힌다",
    expect: false,
    why: "쓸모는 있으나 AI·IT 소재가 아니다. 나중에 'IT 그외' 갈래를 열면 그때 통과시킨다",
  },
  {
    title: "Tuxedo No. 2 - Cocktail recipes",
    expect: false,
    why: "소재부터 무관 (2026-08-09 HN 프론트페이지에서 실제로 들어왔던 글)",
  },

  // ── 통과해야 하는 것 ───────────────────────────────────────────
  {
    title: "Show GN: 흩어진 AI 소식을 실시간 한국어 요약으로 모아 보기",
    expect: true,
    why: "쓸 수 있는 도구·서비스가 하나 생겼다는 정보",
  },
  {
    title: "인간 중심에서 에이전틱 코드 리뷰로 - 더 빠른 결정이 더 나은 리뷰를 뜻하지는 않는다",
    expect: true,
    why: "일하는 방식에 대한 관점",
  },
  {
    title: "그록 4.6, '세계 3위' 등극…프론티어 모델 경쟁 본격 합류",
    expect: true,
    why: "모델 성능·순위 — 사용자가 명시적으로 원한다고 한 축",
  },
  {
    title: "그래파이, AI 데이터 인프라로 170억 시리즈 A 투자 유치",
    expect: true,
    why: "투자·시장 소식. 사용자가 남기기로 판정",
  },
  {
    title: "오픈AI·엔비디아, 국내 첫 공동 밋업 개최...'AI 에이전트' 생태계 확장 모색",
    expect: true,
    why: "행사 소식이지만 사용자가 남기기로 판정 (참석할 수 있는 정보)",
  },
  {
    // 2026-08-13 실제 수집에서 **잘못 걸러진** 글. 쓸모 축을 넣자마자 나온 오판이다 —
    // 제목이 짧아 "그냥 출시 소식"으로 읽힌 것으로 보인다. 사용자가 Show GN 을 좋다고 한
    // 이유("이런 게 있다는 정보를 얻을 수 있으니까")와 같은 계열이라 통과해야 한다.
    title: "ChatGPT Desktop (Codex Desktop) for Linux",
    expect: true,
    why: "새 도구를 쓸 수 있게 됐다는 소식. 제목이 짧다고 쓸모가 없는 게 아니다",
  },
];

/**
 * 외부에서 온 문자열은 아니지만(이 파일에 적힌 값이다) 출력 규칙은 ingest.mjs 와 맞춘다 —
 * 나중에 DB 에서 제목을 읽어 오도록 바꾸는 날 이 방어가 이미 있어야 한다.
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const plain = (s: string) => s.replace(CONTROL_CHARS, " ");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY 가 없다.");
  process.exit(1);
}

const anthropic = new Anthropic();
const system = buildTopicPrompt();

async function judge(title: string): Promise<{ verdict: string; input: number; output: number }> {
  const res = await anthropic.messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      // api/ports.ts 와 같은 경계를 쓴다 — 감싸는 방식이 다르면 확인한 것이 실물이 아니다.
      messages: [{ role: "user", content: fenceData("제목", title) }],
    },
    { timeout: TIMEOUT_MS },
  );

  const verdict = topicVerdict({
    stopReason: res.stop_reason,
    text: res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(""),
  });

  return { verdict, input: res.usage.input_tokens, output: res.usage.output_tokens };
}

async function main() {
  console.log(`모델 ${MODEL} · 지시문 ${system.length}자 · 사례 ${CASES.length}건\n`);

  let wrong = 0;
  let unjudged = 0;
  let inputTotal = 0;
  let outputTotal = 0;

  // 순서대로 부른다 — 열 건뿐이라 동시성이 필요 없고, 출력이 사례 순서와 같아야 읽기 쉽다.
  for (const c of CASES) {
    const { verdict, input, output } = await judge(c.title);
    inputTotal += input;
    outputTotal += output;

    // unjudged 는 통과도 탈락도 아니다 — 실제 파이프라인에서는 통과가 되지만(INV-F3),
    // 여기서 "통과 기대와 일치"로 세면 판정이 전부 실패하는 날 전원 정답으로 보인다.
    if (verdict === "unjudged") {
      unjudged += 1;
      console.log(`  ?  판정실패        ${plain(c.title).slice(0, 46)}`);
      continue;
    }

    const passed = verdict === "on";
    const ok = passed === c.expect;
    if (!ok) wrong += 1;
    const mark = ok ? "OK" : "XX";
    const got = passed ? "통과" : "걸러냄";
    const want = c.expect ? "통과" : "걸러냄";
    console.log(
      `  ${mark} ${got.padEnd(6)}(기대 ${want.padEnd(6)}) ${plain(c.title).slice(0, 46)}`,
    );
    if (!ok) console.log(`       └ ${c.why}`);
  }

  const n = CASES.length;
  console.log(
    `\n맞음 ${n - wrong - unjudged}/${n} · 틀림 ${wrong} · 판정실패 ${unjudged}` +
      `\n토큰  입력 ${inputTotal} · 출력 ${outputTotal} · 건당 입력 ${Math.round(inputTotal / n)}`,
  );

  // 판정실패도 실패로 친다 — 그 상태로는 필터가 조용히 꺼진 것과 같다.
  if (wrong > 0 || unjudged > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(plain(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
