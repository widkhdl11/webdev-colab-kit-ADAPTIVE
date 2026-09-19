import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { KeywordBadge } from "@/entities/article";
import { KeywordBadges } from "./keyword-badges";

/**
 * 뱃지 줄이 화면에 내보내는 것 — design-rules 2026-08-27 블록 · badge-keywords INV-B5·N5.
 *
 * 여기서 붙드는 것은 둘이다:
 *   ① **색으로만 전해지는 정보가 글로도 나가는가** — 축(분야/사건종류)과 0건(취소선)은
 *      둘 다 시각 신호라, 마크업에 말이 없으면 화면을 못 보는 사람에게는 안 전해진다.
 *   ② **축이 실제로 서로 다른 표시를 받는가**(INV-B5) — 이건 클래스를 DOM 으로 봐야 한다.
 *
 * **문자열 포함(`toContain`)으로 구조를 보지 않는다** (rules/tdd.md). 2026-08-31 감사에서
 * 이 파일이 정확히 그 상태였다 — 축 클래스를 뒤바꿔도, 취소선을 지워도, 다시 눌러도 안 꺼지게
 * 만들어도 전부 green 이었다. 그 넷을 각각 무는 단언으로 바꿨다.
 */

// React 19 는 act 사용 시 이 플래그를 요구한다.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const badge = (over: Partial<KeywordBadge> = {}): KeywordBadge => ({
  name: "보안",
  axis: "field",
  total: 5,
  unread: 3,
  ...over,
});

const render = (badges: KeywordBadge[], selected: string | null = null) =>
  renderToStaticMarkup(
    <KeywordBadges badges={badges} selected={selected} onSelect={() => {}} />,
  );

/** 뱃지 줄의 버튼들(마크업 순서 그대로). `더 보기` 는 줄 밖이라 안 잡힌다. */
function badgeButtons(html: string): Element[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector('[aria-label="키워드 뱃지"]');
  return row === null ? [] : [...row.querySelectorAll("button")];
}

/** 실제로 마운트해서 클릭까지 본다 — 정적 렌더로는 토글·펼침 경로를 한 번도 안 지난다. */
async function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    click: async (el: Element) => {
      await act(async () => {
        (el as HTMLElement).click();
      });
    },
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("KeywordBadges — 축은 색으로만 갈리므로 글로도 적는다", () => {
  it("분야·사건종류 접두사가 각각 붙는다", () => {
    const html = render([badge(), badge({ name: "출시", axis: "kind" })]);
    expect(html).toContain("분야 ");
    expect(html).toContain("사건종류 ");
  });

  it("한 축만 있으면 다른 축의 접두사는 안 나온다 — 접두사가 고정 문자열이 아닌지 본다", () => {
    expect(render([badge({ axis: "kind" })])).not.toContain("분야 ");
  });
});

/**
 * INV-B5 — 두 축이 색으로 구분된다 (2026-08-31 에 planned 에서 옮겨 온 조항).
 *
 * 구체적인 색값은 design-rules 소관이고 여기서 붙드는 것은 **두 축이 서로 다르다**는 것 하나다.
 * 그래서 클래스 이름을 값으로 단언하지 않고 **둘이 갈리는지**와 **어느 쪽이 어느 축인지**를 본다.
 */
describe("KeywordBadges — 두 축이 서로 다른 표시를 받는다 (INV-B5)", () => {
  it("BK17: 분야와 사건종류가 서로 다른 클래스를 받는다", () => {
    const [fieldBtn, kindBtn] = badgeButtons(
      render([badge({ name: "보안" }), badge({ name: "출시", axis: "kind" })]),
    );
    expect(fieldBtn.className).not.toBe(kindBtn.className);
  });

  it("BK17: 축과 클래스의 대응이 뒤바뀌지 않는다", () => {
    // `axis === "kind" ? kwField : kwKind` 로 뒤집으면 위 "서로 다르다"만으로는 통과한다.
    // 접두사(글)와 클래스(색)가 **같은 축을 가리키는지**를 같이 본다.
    const [fieldBtn, kindBtn] = badgeButtons(
      render([badge({ name: "보안" }), badge({ name: "출시", axis: "kind" })]),
    );
    expect(fieldBtn.textContent).toContain("분야 ");
    expect(fieldBtn.className).toMatch(/kwField/);
    expect(fieldBtn.className).not.toMatch(/kwKind/);

    expect(kindBtn.textContent).toContain("사건종류 ");
    expect(kindBtn.className).toMatch(/kwKind/);
    expect(kindBtn.className).not.toMatch(/kwField/);
  });

  it("INV-B5 실패경로: 축 표시를 아예 안 붙이면 두 뱃지가 같아진다", () => {
    // 같은 축 둘은 같은 클래스여야 한다 — 이게 없으면 위 단언들이 "매번 다른 클래스"로도 통과한다.
    const [a, b] = badgeButtons(
      render([badge({ name: "보안" }), badge({ name: "코딩" })]),
    );
    expect(a.className).toBe(b.className);
  });
});

describe("KeywordBadges — 숫자는 안 읽은 수다", () => {
  it("안 읽은 수를 적고, 무엇을 센 숫자인지 말로도 남긴다", () => {
    const html = render([badge({ unread: 3 })]);
    expect(html).toContain("3");
    expect(html).toContain("건 안 읽음");
  });

  it("0건이면 **전체 건수를 말로 남긴다** — 취소선은 화면을 못 보면 안 전해진다", () => {
    const html = render([badge({ total: 7, unread: 0 })]);
    expect(html).toContain("안 읽은 글 없음 — 전체 7건");
    // 0 은 그대로 쓴다. 자리를 지키는 것이 규칙이다(다음 날 숫자가 되살아난다).
    expect(html).toContain(">0<");
    // "건 안 읽음" 을 같이 붙이면 "0건 안 읽음, 안 읽은 글 없음" 이 되어 두 번 말한다.
    expect(html).not.toContain("건 안 읽음");
  });
});

describe("KeywordBadges — 켜짐과 접힘", () => {
  it("켜진 뱃지만 aria-pressed=true 다", () => {
    const html = render([badge({ name: "보안" }), badge({ name: "코딩" })], "보안");
    // 첫 뱃지가 켜지고 둘째는 꺼진 상태여야 한다.
    expect(html.indexOf('aria-pressed="true"')).toBeLessThan(
      html.indexOf('aria-pressed="false"'),
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("아무것도 안 켜져 있으면 켜진 뱃지가 없다", () => {
    expect(render([badge()])).not.toContain('aria-pressed="true"');
  });

  it("접힘으로 시작하고, `더 보기` 가 줄을 가리킨다", () => {
    const html = render([badge()]);
    expect(html).toContain("더 보기");
    expect(html).toContain('aria-expanded="false"');
    // 버튼이 무엇을 펴는지 가리키지 않으면 화면을 못 보는 사람은 무엇이 바뀌는지 모른다.
    expect(html).toMatch(/aria-controls="[^"]+"/);
  });
});

describe("KeywordBadges — 뱃지가 없으면", () => {
  it("줄 자체를 안 그린다 — 빈 상자와 `더 보기` 만 남으면 화면이 고장 난 것처럼 보인다", () => {
    expect(render([])).toBe("");
  });
});

describe("KeywordBadges — 0건 표시는 클래스로도 붙는다 (INV-N5)", () => {
  it("0건 뱃지에만 취소선 클래스가 붙는다", () => {
    // 말(`안 읽은 글 없음`)만 보면 취소선을 통째로 지워도 통과한다 — 2026-08-31 감사 지적.
    const [zero, some] = badgeButtons(
      render([badge({ name: "보안", unread: 0 }), badge({ name: "코딩", unread: 3 })]),
    );
    expect(zero.className).toMatch(/kwZero/);
    expect(some.className).not.toMatch(/kwZero/);
  });

  it("INV-N5 뒤쪽 절반: 뱃지에는 안 읽은 수가 붙는다", () => {
    // 앞쪽 절반("목록에는 안 붙인다")은 feed-controls.test.tsx 가 본다.
    // 한쪽만 보면 숫자를 통째로 없애도 그쪽이 통과한다.
    const [only] = badgeButtons(render([badge({ unread: 7 })]));
    expect(only.textContent).toContain("7");
  });
});

describe("KeywordBadges — 실제로 눌러 본다", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("꺼진 뱃지를 누르면 그 이름이 올라간다", async () => {
    const picked: (string | null)[] = [];
    const m = await mount(
      <KeywordBadges badges={[badge({ name: "보안" })]} selected={null} onSelect={(t) => picked.push(t)} />,
    );
    await m.click(m.container.querySelectorAll("button")[0]);
    expect(picked).toEqual(["보안"]);
    m.cleanup();
  });

  it("켜진 뱃지를 다시 누르면 **꺼진다**(null 이 올라간다)", async () => {
    // `onSelect(badge.name)` 로 바꾸면(항상 켜기) 위 테스트만으로는 통과한다.
    const picked: (string | null)[] = [];
    const m = await mount(
      <KeywordBadges
        badges={[badge({ name: "보안" })]}
        selected="보안"
        onSelect={(t) => picked.push(t)}
      />,
    );
    await m.click(m.container.querySelectorAll("button")[0]);
    expect(picked).toEqual([null]);
    m.cleanup();
  });

  it("`더 보기` 를 누르면 펴지고 라벨이 `접기` 가 된다", async () => {
    // 정적 렌더로는 펼친 상태를 한 번도 안 그린다 — `setExpanded(true)` 로 굳혀도 통과했다.
    const m = await mount(
      <KeywordBadges badges={[badge()]} selected={null} onSelect={() => {}} />,
    );
    const more = [...m.container.querySelectorAll("button")].at(-1)!;
    expect(more.textContent).toBe("더 보기");
    expect(more.getAttribute("aria-expanded")).toBe("false");

    await m.click(more);
    expect(more.textContent).toBe("접기");
    expect(more.getAttribute("aria-expanded")).toBe("true");

    // 다시 누르면 되돌아온다 — 한 방향만 보면 토글이 아니라 한 번 켜기여도 통과한다.
    await m.click(more);
    expect(more.textContent).toBe("더 보기");
    m.cleanup();
  });
});

/**
 * 켠 뱃지를 맨 앞으로 · 접힘 밖은 키보드로 안 닿게 (design-rules 2026-08-31).
 *
 * 넘침 자체는 레이아웃이 있어야 재지므로 jsdom 에서는 **안 잰 상태**가 된다.
 * 그 상태의 계약을 여기서 붙든다 — 안 쟀으면 아무것도 inert 로 만들지 않고,
 * `더 보기` 도 죽이지 않는다(모를 때 안전한 쪽). 실제 넘침 동작은 브라우저 실측으로 확인했다.
 */
describe("KeywordBadges — 켠 뱃지가 맨 앞으로 온다", () => {
  const three = [
    badge({ name: "보안", total: 9 }),
    badge({ name: "코딩", total: 5 }),
    badge({ name: "정책", total: 2 }),
  ];

  it("켜면 그 뱃지가 첫 자리로 온다 — 접힌 줄 아래에 숨지 않게", () => {
    const names = badgeButtons(render(three, "정책")).map(
      (b) => b.querySelectorAll("span")[1].textContent,
    );
    expect(names[0]).toBe("정책");
  });

  it("나머지 순서는 그대로다 — 집계 순서를 흔들지 않는다", () => {
    const names = badgeButtons(render(three, "정책")).map(
      (b) => b.querySelectorAll("span")[1].textContent,
    );
    expect(names).toEqual(["정책", "보안", "코딩"]);
  });

  it("아무것도 안 켜져 있으면 받은 순서 그대로다", () => {
    const names = badgeButtons(render(three, null)).map(
      (b) => b.querySelectorAll("span")[1].textContent,
    );
    expect(names).toEqual(["보안", "코딩", "정책"]);
  });
});

describe("KeywordBadges — 넘침을 재기 전에는 아무것도 안 가린다", () => {
  it("안 잰 상태에서는 inert 가 하나도 안 붙는다", () => {
    // 0 을 기본값으로 두면 멀쩡한 뱃지가 전부 키보드에서 사라진다.
    const buttons = badgeButtons(render(three_()));
    expect(buttons.filter((b) => b.hasAttribute("inert"))).toHaveLength(0);
  });

  it("안 잰 상태에서 `더 보기` 를 죽이지 않는다", () => {
    // `count` 를 기본값으로 두면 390px 에서 21개가 가려져 있는데도 "모두 보임"이 된다.
    const doc = new DOMParser().parseFromString(render(three_()), "text/html");
    const more = [...doc.querySelectorAll("button")].at(-1)!;
    expect(more.textContent).toBe("더 보기");
    expect(more.getAttribute("aria-disabled")).toBe("false");
  });
});

function three_() {
  return [badge({ name: "보안" }), badge({ name: "코딩" }), badge({ name: "정책" })];
}
