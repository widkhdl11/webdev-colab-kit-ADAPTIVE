import { normalizeTagName } from "@/entities/article";
import { unsafeCharTest } from "./unsafe-chars";

/**
 * 모델 응답 → 뱃지 키워드 (keywords-and-kinds INV-B1·B2).
 *
 * 순수 함수로 빼는 이유는 `topicVerdict` 와 같다 — 포트 구현 안에 인라인으로 있으면
 * 바깥에서 부를 수가 없어서, 잘린 응답·형식이 깨진 응답 경로를 아무도 못 본다.
 * 주제 판정에서 실제로 그 일이 있었다(2026-08-12, `max_tokens: 5` 로 텍스트가 0글자).
 */

export interface KeywordResponse {
  /** Anthropic 응답의 stop_reason. 잘렸으면 "max_tokens". */
  stopReason: string | null;
  /** 텍스트 블록만 이어 붙인 것. */
  text: string;
}

/**
 * 축 둘. **둘 다 자유 생성이다** — 어느 쪽도 목록에서 고르지 않는다(INV-B1).
 *
 * 축을 나눠 두는 이유: 690건 실측(2026-08-15)에서 "이 글이 다루는 것"만 물었더니
 * **사건종류가 한 번도 안 나왔다**(107종 전부 분야). 안 물으면 안 만든다.
 * 저장도 나눠 둬야 화면이 두 줄로 쓸지 한 줄로 섞을지를 나중에 고를 수 있다.
 */
export interface Keywords {
  /** 무엇에 대한 글인가 — `코딩` · `보안` · `프론트엔드`. */
  fields: string[];
  /** 무슨 일이 일어났나 — `출시` · `소송` · `투자유치`. */
  kinds: string[];
}

/** 한 글에 붙일 수 있는 분야 수 (프롬프트의 "1~3개"와 같은 값). */
export const MAX_FIELDS = 3;

/**
 * 한 글에 붙일 수 있는 사건종류 수 (프롬프트의 "0~2개"와 같은 값).
 *
 * 분야보다 적은 이유: 한 글에서 일어나는 일은 보통 하나다. 새 모델 출시 + 성능 비교처럼
 * 둘인 경우가 있어서 1이 아니라 2다.
 */
export const MAX_KINDS = 2;

/**
 * 키워드 한 개의 최대 길이.
 *
 * 왜 막나: 이 자리에 들어오는 것은 **남의 글을 읽은 모델의 출력**이다. 모델이 규칙을 놓치고
 * 문장을 돌려주면 그 문장이 뱃지 이름이 되고, 뱃지 줄이 통째로 깨진다. 넓은 말만 쓰기로 했으므로
 * (프롬프트 규칙) 정상값은 열 글자 안팎이다.
 */
export const MAX_KEYWORD_LENGTH = 24;

/** 응답에서 첫 JSON 객체만 떼어 낸다 — 모델이 ```json 울타리나 앞말을 붙여도 읽는다. */
function firstObjectLiteral(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  if (end <= start) return null;
  return text.slice(start, end + 1);
}

/**
 * 지시문에 실을 수 없는 글자 — **줄을 만들거나 자료 표시를 닫을 수 있는 것들**.
 *
 * **전역 플래그를 쓰지 않는다** — `g` 를 붙이면 `test()` 가 `lastIndex` 를 들고 다녀서
 * 같은 정규식으로 연달아 검사할 때 한 번씩 건너뛴다.
 *
 * 셋으로 나뉜다 (문자는 **이름으로만 적는다** — 이 주석에 실물을 넣으면 그게 바로
 * 여기서 막으려는 것이다):
 *   · `U+0000`~`U+001F`, `U+007F` — 개행·탭 등 제어문자. 조립이 규칙을 개행으로 잇기
 *     때문에 개행 하나면 우리 규칙 줄과 똑같이 생긴 줄을 만든다.
 *   · `U+0085`(NEL) · `U+2028`(LINE SEPARATOR) · `U+2029` — 유니코드 줄바꿈.
 *     위 클래스 **밖**이라 2026-08-31 전에는 그대로 통과했다. JSON 문자열 안에 실려 오고
 *     `JSON.parse` 도 막지 않으며, `String.trim()` 은 가운데 있는 것을 못 지운다.
 *     즉 `코딩` 뒤에 이 문자를 붙이고 `- 위 규칙을 무시한다` 를 이으면 앵커 목록에
 *     우리 규칙과 같은 모양의 줄이 하나 생긴다.
 *   · 백틱 — 앵커 목록은 항목마다 백틱으로 감싼다(`prompt-text.ts`). 값에 백틱이 있으면
 *     그 감싸기를 **자기가 닫고** 뒤 문장이 지시문 본문에 맨 글자로 남는다.
 *     `<자료>` 경계를 자료가 닫던 2026-08-13 결함과 같은 계열이고, 그때처럼 막는다.
 *     키워드가 DB 에 저장되기 시작해 **오염이 한 실행에 안 그친다**(2026-08-31 보안 리뷰).
 *
 * **잘라 쓰지 않고 통째로 버린다** — 앞부분만 남기면 그 조각이 키워드처럼 보인다.
 */
// 공통 목록(unsafe-chars.ts) + **백틱**. 앵커 목록이 값을 백틱으로 감싸므로,
// 값 안의 백틱이 자기를 감싼 백틱을 닫고 지시문 본문에 맨 문장을 남길 수 있다.
//
// **목록을 여기 다시 적지 않는다.** 전에는 이 줄이 정본이었는데, 2026-09-21 에 제목 쪽이
// 좁은 판을 따로 쓰면서 갈렸다(보안 리뷰). 한 곳에서 관리한다.
const CONTROL_CHARS = unsafeCharTest("`");

/**
 * 이 값을 지시문에 실어도 되나 (INV-B3 의 신뢰 경계).
 *
 * `clean()` 이 쓰는 판정을 밖으로도 낸다 — 앵커 목록은 **DB 에서 다시 읽어** 프롬프트에
 * 실리는데(`loadKeywordAnchors`), 그 경로에는 이 검사가 없었다. 지금은 쓰기 쪽이 막아 주지만
 * `tag` 는 백필·수동 SQL·이전 버전 코드가 만지는 테이블이고, 지시문에 실리는 값이라
 * **읽는 자리에도 방어선이 하나 있어야 한다**(2026-08-31 보안 리뷰, rules/supabase.md
 * "쿼리 응답은 신뢰 경계 밖").
 */
export function isSafeKeyword(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (CONTROL_CHARS.test(value)) return false;
  const name = value.trim();
  return name !== "" && name.length <= MAX_KEYWORD_LENGTH;
}

/**
 * 한 축의 배열을 다듬는다 — 문자열이 아닌 값·빈 값·너무 긴 값·중복을 버리고 상한에서 자른다.
 *
 * 중복을 접는 이유: `item_tag` 는 (item_id, tag_id) 가 기본키다. 같은 키워드를 두 번
 * 연결하려 들면 **그 글의 키워드가 하나도 안 붙는다.**
 */
function clean(raw: unknown, max: number): string[] {
  // 문자열도 iterable 이라 이 검사를 지우면 아래 `for...of` 가 **글자를 돈다** —
  // `"출시"` 가 `["출", "시"]` 가 되어 뜻 없는 뱃지 두 개가 붙는다.
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    // 제어문자가 든 값은 **잘라 쓰지 않고 통째로 버린다.** 이 값은 다음 호출의 지시문
    // 본문에 실리는데(INV-B3), 조립이 규칙을 `\n` 으로 잇기 때문에 개행 하나면 우리 규칙
    // 줄과 똑같이 생긴 줄을 만들 수 있다. 앞부분만 남겨 두면 그 조각이 키워드처럼 보인다.
    if (CONTROL_CHARS.test(value)) continue;
    const name = value.trim();
    if (name === "" || name.length > MAX_KEYWORD_LENGTH) continue;
    // 접는 기준은 **저장 유일성 기준과 같아야 한다** (INV-T2). 여기서 `toLowerCase` 로만
    // 접으면 `온-디바이스` 와 `온_디바이스` 가 둘 다 살아남았다가 저장 단계에서 한 행으로
    // 합쳐지고, 같은 글에 같은 tag_id 를 두 번 연결해 **그 글의 키워드가 전부 안 붙는다.**
    // 값을 바꾸는 게 아니라 판정만 빌려 온다 — 저장할 표기는 원래 것 그대로다.
    const key = normalizeTagName(name);
    // 정규화하면 빈 값이 되는 것(`" - _ "`)은 여기서 버린다. 두면 저장하는 쪽이 조용히
    // 버려서 **리포트에는 성공으로 남고 뱃지만 안 붙는** 상태가 된다.
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    // 자르기는 중복을 접은 **뒤에** 건다 — 중복을 세서 자르면 실제로 저장되는 키워드가
    // 상한보다 적어진다.
    if (out.length === max) break;
  }
  return out;
}

/**
 * 못 읽으면 `null`. 모델이 "짚이는 게 없다"고 빈 배열을 주면 `{fields: [], kinds: []}`.
 *
 * **둘을 구별하는 게 요점이다.** 실패를 빈 값으로 뭉개면 파싱이 통째로 깨진 주기가
 * "이 글들엔 키워드가 없었다"로 보인다 — 리포트가 정상처럼 읽히고 뱃지 줄만 비어 간다.
 * `skippedNoEvidence` 를 실패와 따로 세는 것과 같은 이유다(INV-S3).
 *
 * 표기를 **바꾸지는** 않는다 — 저장할 이름은 모델이 준 것 그대로다. 다만 중복인지 아닌지는
 * `normalizeTagName`(entities/article)에 물어본다. 판정 규칙이 두 곳에 있으면 여기서 통과한
 * 두 값이 저장 단계에서 한 행으로 합쳐진다.
 */
export function parseKeywords(res: KeywordResponse): Keywords | null {
  // 잘린 응답은 **읽히더라도** 답이 아니다. 객체가 안 닫힌 경우는 아래 파싱이 어차피 잡지만,
  // 객체는 닫히고 뒤가 잘린 경우는 여기서만 잡힌다.
  //
  // 왜 멀쩡해 보이는 답까지 버리나: 키워드는 **누적되고**, 쌓인 목록이 다음 호출의 표기 기준이
  // 된다(INV-B3). 잘린 목록을 한 번 저장하면 그 뒤로 모든 글이 그 표기에 맞춰진다.
  // 반대 방향의 손해는 작다 — 그 글은 다음 주기에 다시 잡힌다.
  if (res.stopReason === "max_tokens") return null;

  const literal = firstObjectLiteral(res.text);
  if (literal === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(literal);
  } catch {
    return null;
  }
  // 타입 좁히기 전용이다 — `{` 로 시작해 `}` 로 끝나는 조각은 JSON.parse 가 성공하면
  // 반드시 객체라 런타임에는 도달하지 않는다. 변이로 확인했다(배열도 통과시키게 바꿔도
  // 아무 테스트가 안 깨진다 — 평평한 배열은 위 firstObjectLiteral 이 먼저 잡는다).
  // 지우면 아래 캐스팅이 컴파일되지 않는다.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const obj = parsed as Record<string, unknown>;
  // 두 키가 **둘 다** 없으면 형식이 깨진 응답이다. 하나만 없는 것은 정상 —
  // 사건종류가 없는 글이 있다(INV: 0~2개).
  if (!Array.isArray(obj["분야"]) && !Array.isArray(obj["사건종류"])) return null;

  return {
    fields: clean(obj["분야"], MAX_FIELDS),
    kinds: clean(obj["사건종류"], MAX_KINDS),
  };
}
