import { Fragment, type ReactNode } from "react";
import { splitSentences } from "@/shared/lib/format/split-sentences";

/** 문장 안의 덩어리(keep)를 .nw 로 묶는다(design-rules 29절 줄바꿈 1). 덩어리가 없으면 글 그대로. */
function keepTogether(text: string, keep: readonly string[]): ReactNode {
  const words = keep.filter((w) => w !== "");
  if (words.length === 0) return text;
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  for (;;) {
    // 가장 앞에 나오는 덩어리부터
    let at = -1;
    let word = "";
    for (const w of words) {
      const i = rest.indexOf(w);
      if (i !== -1 && (at === -1 || i < at)) {
        at = i;
        word = w;
      }
    }
    if (at === -1) break;
    if (at > 0) out.push(rest.slice(0, at));
    out.push(
      <span className="nw" key={n++}>
        {word}
      </span>,
    );
    rest = rest.slice(at + word.length);
  }
  if (rest !== "") out.push(rest);
  return out.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

/**
 * 짧은 여러 문장 안내를 문장마다 한 줄로(design-rules 29절 줄바꿈 3). 첫 문장은 그대로, 다음 문장부터 .brk(블록 한 줄)로 감싼다 —
 * 감싸는 요소(p·.hint·.err)는 부르는 쪽이 둔다. keep 에 준 말(「비밀번호 찾기」 같은 화면 이름)은 줄이 바뀌어도 쪼개지지 않는다.
 */
export function Sentences({ text, keep = [] }: { text: string; keep?: readonly string[] }) {
  const parts = splitSentences(text);
  return (
    <>
      {parts.map((part, i) =>
        i === 0 ? (
          <Fragment key={i}>{keepTogether(part, keep)}</Fragment>
        ) : (
          // 앞 띄어쓰기는 줄 첫머리라 화면에서 사라지고, 글자로 읽을 때(복사·낭독)는 문장 사이를 띄운다
          <span className="brk" key={i}>
            {" "}
            {keepTogether(part, keep)}
          </span>
        ),
      )}
    </>
  );
}
