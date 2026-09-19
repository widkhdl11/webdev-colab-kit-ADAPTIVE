/**
 * 원문 주소에서 발행처 이름을 뽑는다 — content-selection INV-O1.
 *
 * HN 을 거쳐 들어온 글도 원문 주소는 실제 발행처(예: techcrunch.com)를 가리킨다.
 * 수집 소스 이름(예: "Hacker News")을 그대로 쓰면 "이게 공식 발표인가"를 화면에서
 * 판단할 수 없다.
 */
export function publisherFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const labels = host.split(".").filter(Boolean);
  // "localhost" 처럼 라벨이 하나뿐이면 등록 가능한 도메인이 아니다 — 발행처를 못 뽑는다.
  if (labels.length < 2) return null;

  // TLD 바로 앞 라벨을 이름으로 쓴다. "blog.openai.com" → "openai",
  // "huggingface.co" → "huggingface". 여러 단어짜리 TLD(co.uk 등)는 다루지 않는다 —
  // 못 뽑으면 호출부가 수집 소스 이름으로 되돌아간다(INV-O1 실패경로).
  const name = labels[labels.length - 2];
  if (name === "") return null;

  return name
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
