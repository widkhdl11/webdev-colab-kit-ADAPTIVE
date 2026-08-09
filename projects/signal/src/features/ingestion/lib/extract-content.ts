import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

/**
 * 원문 페이지 HTML → 본문 HTML — ingestion-ranking INV-S5.
 *
 * 왜 필요한가: HN 은 링크 모음이라 본문을 가진 적이 없다(2026-08-09 실측). 원문 사이트는
 * 열리므로 거기서 뽑아야 한다. 안 뽑으면 요약 근거가 없어 요약도 못 만든다(INV-S3).
 *
 * **결과는 신뢰 경계 밖이다.** 남의 사이트에서 가져온 HTML 이므로 화면에 그릴 때
 * content-safety 의 sanitize 를 거친다(INV-D1~D3). 여기서는 정제하지 않는다 —
 * 두 곳에서 거르면 어느 쪽이 걸렀는지 알 수 없어진다.
 */

/** 이보다 짧으면 본문이 아니다(쿠키 안내·오류 페이지 등). */
const MIN_TEXT_LENGTH = 200;

/**
 * 본문 HTML 을 돌려준다. 못 뽑으면 빈 문자열 — 부르는 쪽(파이프라인)이 실패로 센다.
 *
 * 던지지 않는 이유: 추출 실패는 정상 경로다. 사이트마다 구조가 다르고, 어떤 곳은
 * 자바스크립트로만 본문을 그린다. 한 건이 안 된다고 예외로 올릴 일이 아니다.
 */
export function extractArticleHtml(html: string, url: string): string {
  try {
    // url 을 주는 이유: 상대 경로 링크·이미지가 절대 주소로 바뀐다.
    // 안 주면 본문 안 링크가 우리 사이트를 가리키게 된다.
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article) return "";

    const text = (article.textContent ?? "").trim();
    if (text.length < MIN_TEXT_LENGTH) return "";

    return (article.content ?? "").trim();
  } catch {
    return "";
  }
}
