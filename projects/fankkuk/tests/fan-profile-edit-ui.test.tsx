import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { FanProfileEditPage } from "@/widgets/fan-profile-edit/ui/fan-profile-edit-page";

// 프로필 수정(팬) /me/profile — 정돈(design-rules 27절 「4파트 나머지 다섯 화면」, 카드 d115, 시안 pilot-2026-10-22/me-profile.html).
// 카드 없이 묶음 둘: 사진 → 소개 → 저장 줄. 사진은 즉시 저장이라 저장 줄은 소개 바로 뒤에 있어야 한다. 동작은 그대로, 배치만 바뀌었다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(over: { photoPath?: string | null; bgPath?: string | null } = {}) {
  act(() => {
    root.render(
      <FanProfileEditPage nickname="별빛" intro="" photoPath={over.photoPath ?? null} bgPath={over.bgPath ?? null} photoBase="https://storage.example" />,
    );
  });
}

const groups = () => [...host.querySelectorAll("section")];
const groupTitles = () => groups().map((sec) => sec.querySelector("h2")?.textContent?.trim());
const saveForm = () => host.querySelector("form") as HTMLFormElement;

describe("프로필 수정(팬) — 묶음 순서", () => {
  it("묶음은 사진 → 소개 둘이고, 제목 h2 는 그 둘뿐이다", () => {
    render();
    expect(groupTitles()).toEqual(["사진", "소개"]);
    expect([...host.querySelectorAll("h2")].map((h) => h.textContent?.trim())).toEqual(["사진", "소개"]);
    expect(host.querySelectorAll("h1")).toHaveLength(1);
  });

  it("사진 묶음 안에 프로필 사진 줄 → 배경 사진 줄, 파일 칸 둘이 있다", () => {
    render();
    const [photo] = groups();
    const files = [...photo.querySelectorAll('input[type="file"]')];
    expect(files).toHaveLength(2);
    const names = files.map((f) =>
      (f.getAttribute("aria-labelledby") ?? "")
        .split(" ")
        .map((ref) => host.ownerDocument.getElementById(ref)?.textContent?.trim())
        .join(" "),
    );
    expect(names).toEqual(["프로필 사진 사진 올리기", "배경 사진 사진 올리기"]);
  });

  it("배경 사진 버튼은 그림 위 이름 줄에 있다(그림 아래 따로 떨어진 줄이 아니다)", () => {
    // 경로 꼴이 맞지 않으면 그림 대신 빈 띠(「배경 사진이 없어요」)가 그려진다 — 사진이 있는 것으로 쳐서 「지우기」도 보인다
    render({ bgPath: "not-a-stored-path" });
    const [photo] = groups();
    const bgFile = [...photo.querySelectorAll('input[type="file"]')][1] as HTMLInputElement;
    const img = [...photo.querySelectorAll("span")].find((el) => el.textContent?.trim() === "배경 사진이 없어요") as HTMLElement;
    expect(img).not.toBeNull();
    // 파일 칸이 그림보다 문서에서 앞에 온다
    expect(bgFile.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const remove = [...photo.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "지우기");
    expect(remove).toHaveLength(1);
    expect(bgFile.compareDocumentPosition(remove[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(remove[0].compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("소개 묶음에 닉네임·자기소개 칸이 있고, 둘 다 저장 줄 폼에 붙어 있다", () => {
    render();
    const [, intro] = groups();
    const nick = intro.querySelector('input[type="text"]') as HTMLInputElement;
    const bio = intro.querySelector("textarea") as HTMLTextAreaElement;
    expect(nick.value).toBe("별빛");
    expect(nick.form).toBe(saveForm());
    expect(bio.form).toBe(saveForm());
    expect(intro.querySelector('input[type="file"]')).toBeNull();
  });

  it("저장 줄은 소개 묶음 바로 뒤에 있고, 사진 묶음 안에는 저장하기가 없다", () => {
    render();
    const form = saveForm();
    const before = form.previousElementSibling as HTMLElement;
    expect(before.tagName).toBe("SECTION");
    expect(before.querySelector("h2")?.textContent?.trim()).toBe("소개");
    expect(form.nextElementSibling).toBeNull();
    for (const sec of groups()) expect(sec.textContent).not.toContain("저장하기");
  });

  it("저장 줄 버튼은 [취소][저장하기] 순서이고, 결과 칸은 버튼 위에 있다", () => {
    render();
    const form = saveForm();
    const controls = [...form.querySelectorAll("a, button")].map((el) => el.textContent?.trim());
    expect(controls).toEqual(["취소", "저장하기"]);
    const status = form.querySelector('[role="status"]') as HTMLElement;
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(status.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("바꾼 것 없이 저장하기를 누르면 「바뀐 내용이 없어요.」 — 저장 동작은 그대로", () => {
    render();
    act(() => {
      saveForm().requestSubmit();
    });
    expect(saveForm().querySelector('[role="status"]')?.textContent).toBe("바뀐 내용이 없어요.");
  });
});
