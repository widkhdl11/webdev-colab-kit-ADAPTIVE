import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FaqDoc } from "../model/faq-doc";
import type { LegalDoc } from "../model/legal-doc";
import { DocPage } from "./doc-page";
import { FaqPage } from "./faq-page";
import { LegalPage } from "./legal-page";

// 문서형 공통 부품 화면 동작(docs/ux/document-pages.md · 차이 목록 _diff-document-pages.md D1 ② · C1~C10 · C12).

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const base: LegalDoc = {
  title: "시험 약관",
  lead: "설명",
  summary: ["요약 하나", "요약 둘", "요약 셋"],
  facts: [["운영", "팬꾹"]],
  sections: [
    { id: "intro", title: "제1조 목적", blocks: [{ kind: "text", text: "목적을 정합니다." }] },
    { id: "refund", title: "제2조 환불", blocks: [{ kind: "rows", rows: [{ title: "입고 전", fields: [["돌려받는 금액", "반송택배비를 뺀 금액", "none"]] }] }] },
    { id: "words", title: "제3조 정의", blocks: [{ kind: "defs", items: [["보관소", "상자를 맡겨 두는 곳을 말합니다."]] }] },
    { id: "fee", title: "제4조 요금", blocks: [{ kind: "prices", columns: ["선물"], rows: [{ name: "소형", rule: "세변합계 80cm", amounts: ["6,111원"] }] }] },
  ],
};

const tagged: LegalDoc = {
  ...base,
  sections: [
    { ...base.sections[0]!, tags: ["크리에이터"] },
    { ...base.sections[1]!, tags: ["팬", "환불"], frequent: true },
    { ...base.sections[2]!, tags: ["팬"] },
    base.sections[3]!,
  ],
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  window.history.replaceState(null, "", "/terms");
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function render(node: ReactNode) {
  act(() => root.render(node));
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string) => Array.from(host.querySelectorAll<T>(sel));
const byText = (sel: string, text: string) => qa<HTMLElement>(sel).find((el) => el.textContent?.trim() === text);
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const visibleArticles = () => qa("article").filter((a) => !a.hidden).map((a) => a.id);

describe("선택 칸이 없는 글은 지금처럼 그린다", () => {
  it("칩 줄 · 「주요」 · 최종 수정일 · 요약 링크 없이, 조와 요약 문장은 전부", () => {
    render(<DocPage doc={base} variant="policy" />);
    expect(q('[role="group"][aria-label="분류"]')).toBeNull();
    expect(host.textContent).not.toContain("주요");
    expect(host.textContent).not.toContain("최종 수정일");
    expect(qa("ol li").filter((li) => li.textContent?.startsWith("요약")).map((li) => [li.textContent, li.querySelector("a")])).toEqual([
      ["요약 하나", null],
      ["요약 둘", null],
      ["요약 셋", null],
    ]);
    expect(visibleArticles()).toEqual(["intro", "refund", "words", "fee"]);
    expect(q("h1")?.textContent).toBe("시험 약관");
  });
});

describe("검색(C4)", () => {
  it.each([
    ["rows", "반송택배비", "refund"],
    ["defs", "맡겨 두는", "words"],
    ["prices", "세변합계", "fee"],
  ])("%s 블록 글자로 그 조를 찾고 <mark> 로 표시한다", (_, word, id) => {
    render(<DocPage doc={base} variant="policy" />);
    type(q<HTMLInputElement>('input[type="search"]')!, word);
    expect(q('[aria-live="polite"]')?.textContent).toBe("1개 조에서 발견");
    expect(qa(`#${id} mark`).map((m) => m.textContent)).toEqual(word.split(" ").filter(Boolean));
    expect(qa("mark").every((m) => m.closest("article")?.id === id)).toBe(true);
  });

  it("없으면 그 사실 한 줄, 다음·이전 단추는 없다", () => {
    render(<DocPage doc={base} variant="policy" />);
    type(q<HTMLInputElement>('input[type="search"]')!, "없는낱말");
    expect(q('[aria-live="polite"]')?.textContent).toBe("찾는 낱말이 있는 조가 없어요.");
    expect(byText("button", "다음")).toBeUndefined();
  });

  it("다음 · 이전으로 찾은 조를 차례로 오가며 주소 끝이 그 조가 된다", () => {
    render(<DocPage doc={base} variant="policy" />);
    type(q<HTMLInputElement>('input[type="search"]')!, "조");
    expect(q('[aria-live="polite"]')?.textContent).toBe("4개 조에서 발견");
    click(byText("button", "다음"));
    expect(window.location.hash).toBe("#intro");
    click(byText("button", "다음"));
    expect(window.location.hash).toBe("#refund");
    click(byText("button", "이전"));
    expect(window.location.hash).toBe("#intro");
    click(byText("button", "이전"));
    expect(window.location.hash).toBe("#fee");
  });
});

describe("분류 칩(C5)", () => {
  it("tags 가 있으면 「전체」 + 등장 순 칩, 고르면 그 분류만 남고 목차에서 나머지는 흐리게", () => {
    render(<DocPage doc={tagged} variant="policy" />);
    const chips = qa<HTMLButtonElement>('[aria-label="분류"] button');
    expect(chips.map((c) => [c.textContent, c.getAttribute("aria-pressed")])).toEqual([
      ["전체", "true"],
      ["크리에이터", "false"],
      ["팬", "false"],
      ["환불", "false"],
    ]);
    click(byText('[aria-label="분류"] button', "팬"));
    expect(visibleArticles()).toEqual(["refund", "words"]);
    const dim = qa('nav[aria-label="목차"] a').filter((a) => a.className.includes("dim")).map((a) => a.getAttribute("href"));
    expect(dim).toEqual(["#intro", "#fee"]);
  });

  // 취소·환불 규정 2절처럼 줄마다 시점 꼬리표가 있는 조
  const rowsDoc: LegalDoc = {
    ...base,
    summaryLinks: ["table", "table", "table"],
    sections: [
      {
        id: "table",
        title: "2. 상태별 환불 금액",
        tags: ["입고 전", "입고 후"],
        blocks: [
          {
            kind: "rows",
            rows: [
              { title: "가 줄", fields: [["환불 금액", "전액", "full"]], tags: ["입고 전"] },
              { title: "나 줄", fields: [["환불 금액", "일부"]], tags: ["입고 전", "입고 후"] },
              { title: "다 줄", fields: [["환불 금액", "일부"]] },
            ],
          },
          { kind: "rows", rows: [{ title: "라 줄", fields: [["환불 금액", "없음", "none"]], tags: ["입고 전"] }] },
        ],
      },
    ],
  };
  const rowTitles = () => qa("#table h3").map((h) => h.textContent);
  const ALL_ROWS = ["가 줄", "나 줄", "다 줄", "라 줄"];

  it("줄에 꼬리표가 있는 상자는 칩이 줄을 거르고, 남는 줄이 없는 상자는 그리지 않는다 — 꼬리표 없는 줄은 늘 남는다", () => {
    render(<DocPage doc={rowsDoc} variant="policy" />);
    expect(rowTitles()).toEqual(ALL_ROWS);
    click(byText('[aria-label="분류"] button', "입고 후"));
    expect(rowTitles()).toEqual(["나 줄", "다 줄"]);
    // 줄이 다 빠진 둘째 상자는 빈 테두리로도 남지 않는다
    expect(new Set(qa("#table h3").map((h) => h.parentElement?.parentElement)).size).toBe(1);
    expect(qa("#table [class*=box]")).toHaveLength(1);
    click(byText('[aria-label="분류"] button', "전체"));
    expect(rowTitles()).toEqual(ALL_ROWS);
  });

  it("칩을 고른 채 찾은 낱말이 가린 줄에만 있으면, 다음으로 갈 때 「전체」로 돌아가 그 줄이 보인다", () => {
    render(<DocPage doc={rowsDoc} variant="policy" />);
    click(byText('[aria-label="분류"] button', "입고 후"));
    type(q<HTMLInputElement>('input[type="search"]')!, "전액");
    click(byText("button", "다음"));
    expect(byText('[aria-label="분류"] button', "전체")?.getAttribute("aria-pressed")).toBe("true");
    expect(rowTitles()).toEqual(ALL_ROWS);
    expect(qa("#table mark").map((m) => m.textContent)).toEqual(["전액"]);
  });

  it("칩을 고른 채 찾은 낱말이 남은 줄에 있으면 칩은 그대로다", () => {
    render(<DocPage doc={rowsDoc} variant="policy" />);
    click(byText('[aria-label="분류"] button', "입고 후"));
    type(q<HTMLInputElement>('input[type="search"]')!, "일부");
    click(byText("button", "다음"));
    expect(byText('[aria-label="분류"] button', "입고 후")?.getAttribute("aria-pressed")).toBe("true");
    expect(rowTitles()).toEqual(["나 줄", "다 줄"]);
  });

  it("요약 링크로 가면 칩에 맞는 조여도 「전체」로 돌아간다 — 요약 줄은 시점을 가리지 않는다", () => {
    render(<DocPage doc={rowsDoc} variant="policy" />);
    click(byText('[aria-label="분류"] button', "입고 후"));
    click(q('a[href="#table"]'));
    expect(byText('[aria-label="분류"] button', "전체")?.getAttribute("aria-pressed")).toBe("true");
    expect(rowTitles()).toEqual(ALL_ROWS);
  });

  it("tagOrder 가 있으면 그 차례", () => {
    render(<DocPage doc={{ ...tagged, tagOrder: ["환불", "팬"] }} variant="policy" />);
    expect(qa('[aria-label="분류"] button').map((c) => c.textContent)).toEqual(["전체", "환불", "팬", "크리에이터"]);
  });

  it("칩으로 가린 조에 주소(#조id)로 가면 「전체」로 돌아가 그 조가 보인다", () => {
    render(<DocPage doc={tagged} variant="policy" />);
    click(byText('[aria-label="분류"] button', "크리에이터"));
    expect(visibleArticles()).toEqual(["intro"]);
    act(() => {
      window.history.replaceState(null, "", "/terms#fee");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(visibleArticles()).toEqual(["intro", "refund", "words", "fee"]);
    expect(byText('[aria-label="분류"] button', "전체")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("목차에서 가린 조를 누르면 「전체」로 돌아가 그 조로 가고 초점이 조 제목에", () => {
    render(<DocPage doc={tagged} variant="policy" />);
    click(byText('[aria-label="분류"] button', "크리에이터"));
    click(q('button[aria-expanded]'));
    click(q('nav[aria-label="목차"] a[href="#words"]'));
    expect(q<HTMLElement>("#words")?.hidden).toBe(false);
    expect(document.activeElement?.id).toBe("words-h");
    expect(window.location.hash).toBe("#words");
  });
});

describe("요약 링크(C7)", () => {
  it("summaryLinks 가 summary 와 같은 길이면 줄마다 그 조로 가는 링크", () => {
    render(<DocPage doc={{ ...base, summaryLinks: ["fee", "intro", "words"] }} variant="policy" />);
    expect(qa("ol li a").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["요약 하나", "#fee"],
      ["요약 둘", "#intro"],
      ["요약 셋", "#words"],
    ]);
  });
  it("길이가 다르면 깨지지 않고 링크 없이 그린다", () => {
    render(<DocPage doc={{ ...base, summaryLinks: ["fee", "intro"] }} variant="policy" />);
    expect(qa("ol li").filter((li) => li.textContent?.startsWith("요약")).length).toBe(3);
    expect(qa("ol li a")).toEqual([]);
  });
});

describe("목차 줄(D1 ② · C2 · C3)", () => {
  it("지금 조 이름 + 「목차 열기」, 펼치면 전체 조 · 지금 조 강조 · 「주요」, Esc 로 닫히고 초점은 단추로", () => {
    // 화면 위쪽 1/3 안에 머리가 들어온 조는 둘째(환불)까지 — 그 마지막이 「지금 조」
    const tops: Record<string, number> = { intro: -400, refund: 100, words: 900, fee: 1800 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { top: tops[this.id] ?? 0 } as DOMRect;
    });
    render(<DocPage doc={{ ...tagged, tocGroups: [{ title: "앞 묶음", ids: ["intro", "refund"] }] }} variant="policy" />);
    const btn = q<HTMLButtonElement>("button[aria-expanded]")!;
    const panel = document.getElementById(btn.getAttribute("aria-controls")!)!;
    expect(btn.parentElement?.querySelector("p")?.textContent).toBe("제2조 환불");
    expect([btn.textContent, btn.getAttribute("aria-expanded"), panel.hidden]).toEqual(["목차 열기", "false", true]);
    click(btn);
    expect([btn.textContent, btn.getAttribute("aria-expanded"), panel.hidden]).toEqual(["목차 닫기", "true", false]);
    expect(qa('nav[aria-label="목차"] a').map((a) => a.getAttribute("href"))).toEqual(["#intro", "#refund", "#words", "#fee"]);
    expect(panel.querySelector("p")?.textContent).toBe("앞 묶음");
    expect(panel.querySelector("[aria-current]")?.getAttribute("href")).toBe("#refund");
    expect(qa('nav[aria-label="목차"] a').filter((a) => a.textContent?.includes("주요")).map((a) => a.getAttribute("href"))).toEqual(["#refund"]);
    panel.querySelector<HTMLElement>("a")!.focus();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect([btn.getAttribute("aria-expanded"), panel.hidden, document.activeElement]).toEqual(["false", true, btn]);
  });

  it("바깥을 누르면 닫힌다", () => {
    render(<DocPage doc={base} variant="policy" />);
    const btn = q<HTMLButtonElement>("button[aria-expanded]")!;
    click(btn);
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("「주요」(C6) · 주소 복사(C8)", () => {
  it("frequent 조 제목 옆에 배지", () => {
    render(<DocPage doc={tagged} variant="policy" />);
    expect(qa("article").filter((a) => a.querySelector("h2")?.parentElement?.textContent?.includes("주요")).map((a) => a.id)).toEqual(["refund"]);
  });

  it("복사 단추는 지금 주소(검색어 포함)#조id 를 복사하고 「복사됨」을 2초 보인다", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    window.history.replaceState(null, "", "/terms?v=1.0");
    render(<DocPage doc={base} variant="policy" />);
    const btn = q<HTMLButtonElement>('#refund button[aria-label="「제2조 환불」 주소 복사"]')!;
    await act(async () => {
      btn.click();
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/terms?v=1.0#refund`);
    const status = q("#refund [role=status]")!;
    expect(status.textContent).toBe("복사됨");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(status.textContent).toBe("");
    vi.useRealTimers();
  });
});

describe("안내 글 탭 · 최종 수정일(C9)", () => {
  it("안내 글은 다섯 탭(지금 글 aria-current), 요금 안내처럼 tab 이 없으면 탭 줄 없음", () => {
    render(<LegalPage doc={base} icon="" tab="security" />);
    const tabs = qa('nav[aria-label="이용 안내"] a');
    expect(tabs.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])).toEqual([
      ["팬 이용 안내", "/guide/fan", null],
      ["크리에이터 이용 안내", "/guide/creator", null],
      ["검수 기준", "/inspection", null],
      ["보안 안내", "/security", "page"],
      ["분쟁 처리 안내", "/dispute", null],
    ]);
    render(<LegalPage doc={base} icon="" />);
    expect(q('nav[aria-label="이용 안내"]')).toBeNull();
  });

  it("updated 가 있으면 머리 아래 「최종 수정일 YYYY.MM.DD」", () => {
    render(<LegalPage doc={{ ...base, updated: "2026-10-23" }} icon="" />);
    const line = byText("p", "최종 수정일 2026.10.23");
    expect(line?.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-23");
  });
});


describe("글 가운데서도 수단 둘(원칙 ①) — 목차 줄의 「찾기」 · 펼친 목차의 칩", () => {
  it("「찾기」(누를 칸이 있는 단추)는 검색칸으로 초점을 옮긴다", () => {
    render(<DocPage doc={base} variant="policy" />);
    const find = byText(".flow button, button", "찾기");
    expect(find?.closest("[class*=bar]")).not.toBeNull();
    click(find);
    expect(document.activeElement).toBe(q('input[type="search"]'));
  });

  it("칩이 있는 글은 펼친 목차 맨 위에 칩 줄 — 거기서 고르면 본문이 걸러진다", () => {
    render(<DocPage doc={tagged} variant="policy" />);
    click(q("button[aria-expanded]"));
    const panel = q('nav[aria-label="목차"]')!;
    expect(panel.firstElementChild?.getAttribute("aria-label")).toBe("목차 분류");
    click(byText('[aria-label="목차 분류"] button', "환불"));
    expect(visibleArticles()).toEqual(["refund"]);
    expect(byText('[aria-label="목차 분류"] button', "환불")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("칩이 없는 글은 펼친 목차에 칩 줄이 없다", () => {
    render(<DocPage doc={base} variant="policy" />);
    click(q("button[aria-expanded]"));
    expect(q('[aria-label="목차 분류"]')).toBeNull();
  });
});

describe("자주 묻는 질문(C4 · C5 · C8)", () => {
  const faq: FaqDoc = {
    summary: ["요약 하나", "요약 둘", "요약 셋"],
    items: [
      { id: "fee", q: "요금은 얼마인가요?", a: "상자마다 받아요.", tags: ["결제"] },
      { id: "decline", q: "거절되면요?", a: "돌려보내 드려요. 반송택배비를 빼요.", tags: ["배송"], frequent: true },
    ],
  };

  it("주소(#id)로 들어오면 그 질문이 펼쳐진다", () => {
    window.history.replaceState(null, "", "/faq#decline");
    render(<FaqPage {...faq} />);
    expect(q<HTMLDetailsElement>("#decline details")?.open).toBe(true);
    expect(q<HTMLDetailsElement>("#fee details")?.open).toBe(false);
  });

  it("답 안의 낱말도 찾고, 다음으로 가면 그 질문이 펼쳐진다", () => {
    window.history.replaceState(null, "", "/faq");
    render(<FaqPage {...faq} />);
    type(q<HTMLInputElement>('input[type="search"]')!, "반송택배비");
    expect(q('[aria-live="polite"]')?.textContent).toBe("1개 질문에서 발견");
    click(byText("button", "다음"));
    expect(q<HTMLDetailsElement>("#decline details")?.open).toBe(true);
    expect(qa("#decline mark").map((m) => m.textContent)).toEqual(["반송택배비"]);
  });


  it("위에 붙는 목차 줄(C1) — 지금 질문 · 펼치면 전체 질문 · 주요, 고르면 그 질문이 펼쳐진 채로 간다", () => {
    window.history.replaceState(null, "", "/faq");
    const tops: Record<string, number> = { fee: -100, decline: 900 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { top: tops[this.id] ?? 0 } as DOMRect;
    });
    render(<FaqPage {...faq} />);
    const btn = q<HTMLButtonElement>("button[aria-expanded]")!;
    expect(btn.parentElement?.querySelector("p")?.textContent).toBe("요금은 얼마인가요?");
    expect(byText("button", "찾기")).toBeDefined();
    click(btn);
    const links = qa('nav[aria-label="목차"] a');
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#fee", "#decline"]);
    expect(links.filter((a) => a.textContent?.includes("주요")).map((a) => a.getAttribute("href"))).toEqual(["#decline"]);
    expect(q('nav[aria-label="목차"] [aria-current]')?.getAttribute("href")).toBe("#fee");
    click(q('nav[aria-label="목차"] a[href="#decline"]'));
    expect(q<HTMLDetailsElement>("#decline details")?.open).toBe(true);
    expect(document.activeElement).toBe(q("#decline summary"));
    expect(window.location.hash).toBe("#decline");
  });

  it("칩으로 거르고, 질문마다 주소 복사 단추", () => {
    render(<FaqPage {...faq} />);
    click(byText('[aria-label="분류"] button', "배송"));
    expect(qa(".acc > div").filter((d) => !d.hidden).map((d) => d.id)).toEqual(["decline"]);
    expect(qa('button[aria-label$="주소 복사"]').length).toBe(2);
  });
});
