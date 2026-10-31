import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMustDeliver } from "@/entities/notification/model/delivery-policy";
import { PHONE_CODE_VARIABLE } from "@/shared/api/phone-verifier/verifier";
import { ALIMTALK_KINDS, buildAlimtalkVariables, buildLoginLinkAlimtalkVariables, LOGIN_LINK_TEMPLATE_KEY } from "./alimtalk-body";
import { newLoginLinkToken } from "@/entities/session/model/login-link";
import type { NotificationBodyInput } from "./notification-body";

// 알림톡 템플릿 문서(docs/copy/alimtalk-templates.md)를 읽어 변수를 채운 본문이 우리가 기대하는 본문과 같은지 본다(notifications INV-N7).
// 문서의 본문·변수 이름과 코드가 어긋나면 여기서 깨진다 — 알림톡은 본문이 한 글자라도 다르면 대행사가 거부한다.

const DOC = readFileSync(join(process.cwd(), "docs/copy/alimtalk-templates.md"), "utf8").replace(/\r\n/g, "\n");

type Section = { body: string; button: string | null; pending: boolean };

/** `## N. 이름 (`키`)` 절마다 첫 코드 블록 본문과 버튼 주소. `- 상태: 코드 반영 전` 줄이 있으면 확정됐지만 발송 코드가 아직 그 본문을 못 채우는 절 */
function sections(): Map<string, Section> {
  const out = new Map<string, Section>();
  const parts = DOC.split(/^## /m).slice(1);
  for (const part of parts) {
    const key = /^[^\n]*\(`([^`]+)`\)/.exec(part)?.[1];
    const body = /```\n([\s\S]*?)\n```/.exec(part)?.[1];
    if (!key || body === undefined) continue;
    const button = /- 버튼: \[[^\]]+\] → `([^`]+)`/.exec(part)?.[1] ?? null;
    out.set(key, { body, button, pending: /^- 상태: 코드 반영 전/m.test(part) });
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/#\{[^}]+\}/g)].map((m) => m[0]);

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/#\{[^}]+\}/g, (m) => {
    if (!(m in vars)) throw new Error(`변수 없음: ${m}`);
    return vars[m]!;
  });
}

function inputFor(kind: NotificationBodyInput["kind"], over: Partial<NotificationBodyInput> = {}): NotificationBodyInput {
  return {
    kind,
    round: 1,
    nickname: "하루",
    orderNo: "FC-7K3M9",
    waitingCount: kind === "approval_request" || kind === "approval_reminder" ? 3 : null,
    daysLeft: kind === "approval_reminder" ? 2 : null,
    itemCount: kind === "status_digest" ? 4 : null,
    recipientIsCreator: false,
    undeliveredReason: null,
    senderName: null,
    disposeDueAt: null,
    mustDeliver: isMustDeliver(kind),
    appOrigin: "https://fankkuk.com",
    ...over,
  };
}

/** 우리가 기대하는 본문 — 문서와 따로 적는다(둘 중 하나만 바뀌면 깨지게) */
const FOLLOW = "\n\n알림 수신 여부는 ‘계정 설정 > 알림’에서 변경할 수 있습니다.";
const GIFT = "https://fankkuk.com/gifts/FC-7K3M9";
const MUST = "\n\n이 알림은 서비스 이용에 필요한 필수 알림으로, 알림 수신 설정과 관계없이 발송됩니다.";
const ACTIONS = "https://fankkuk.com/creator/actions";
const EXPECTED: Record<(typeof ALIMTALK_KINDS)[number], { body: string; button: string }> = {
  // 묶음 알림(notification-batching INV-NB1·NB2·NB5) — 주문번호 없이 건수, 링크는 목록(INV-NB3·NB4)
  approval_request: { body: `새 선물 승인 요청이 왔어요.\n승인 대기 3건${MUST}`, button: ACTIONS },
  approval_reminder: { body: `승인 대기 3건, 2일 뒤 자동 반려${MUST}`, button: ACTIONS },
  status_digest: { body: `하루님,\n새 선물 소식 4건이 있습니다.\n\n선물 진행 상황은 로그인 후 확인해 주세요.${FOLLOW}`, button: "https://fankkuk.com/gifts" },
  box_arrived: { body: `하루님,\n보내신 상자 1개가 팬꾹에 도착했습니다.\n\n주문번호: FC-7K3M9\n\n상자 도착 현황은 로그인 후 확인해 주세요.${FOLLOW}`, button: GIFT },
  shipped: {
    body: `하루님,\n보내신 선물이 팬꾹에서 출고 처리되었습니다.\n택배사에 인계되면 배송이 시작됩니다.\n\n주문번호: FC-7K3M9\n\n선물 진행 상황은 로그인 후 확인해 주세요.${FOLLOW}`,
    button: GIFT,
  },
  in_transit: { body: `하루님,\n보내신 선물이 배송 중입니다.\n\n주문번호: FC-7K3M9\n\n선물 진행 상황은 로그인 후 확인해 주세요.${FOLLOW}`, button: GIFT },
  delivered: { body: `하루님,\n보내신 선물의 배송이 완료되었습니다.\n\n주문번호: FC-7K3M9\n\n선물 상세 정보는 로그인 후 확인해 주세요.${FOLLOW}`, button: GIFT },
  gift_reply: { body: `하루님,\n보내신 선물에 답장이 도착했습니다.\n\n주문번호: FC-7K3M9\n\n로그인 후 답장을 확인해 주세요.${FOLLOW}`, button: GIFT },
};

describe("INV-N7: 알림톡 변수를 채운 템플릿 문서의 본문 == 기대 본문", () => {
  const docs = sections();

  it("INV-N7: 문서에 본문이 있고 코드 반영 전이 아닌 종류와 코드의 종류 목록이 같다", () => {
    const kinds = [...docs].filter(([k, s]) => k !== "SOLAPI_PHONE_CODE_TEMPLATE_ID" && k !== LOGIN_LINK_TEMPLATE_KEY && !s.pending).map(([k]) => k);
    expect(kinds.sort()).toEqual([...ALIMTALK_KINDS].sort());
  });

  it("INV-N7 · INV-NB1 · INV-NB2 · INV-NB5: 문서에 「코드 반영 전」 절이 없다 — 승인 요청·승인 재알림·하루 묶음도 코드가 채운다", () => {
    expect([...docs].filter(([, s]) => s.pending).map(([k]) => k)).toEqual([]);
    for (const kind of ["approval_request", "approval_reminder", "status_digest"]) expect(ALIMTALK_KINDS as readonly string[]).toContain(kind);
  });

  it("INV-NB5 (S5): 크리에이터가 받는 하루 묶음은 처리할 일로", () => {
    const vars = buildAlimtalkVariables(inputFor("status_digest", { recipientIsCreator: true }))!;
    expect(fill(docs.get("status_digest")!.button!, vars)).toBe(ACTIONS);
  });

  it("INV-NB1 · INV-NB2 · INV-NB5 (실패경로): 건수·남은 일수가 비면 변수를 만들지 않는다 — 빈 칸으로 보내지 않는다", () => {
    expect(buildAlimtalkVariables(inputFor("approval_request", { waitingCount: null }))).toBeNull();
    expect(buildAlimtalkVariables(inputFor("approval_request", { waitingCount: 0 }))).toBeNull();
    expect(buildAlimtalkVariables(inputFor("approval_reminder", { daysLeft: null }))).toBeNull();
    expect(buildAlimtalkVariables(inputFor("status_digest", { itemCount: null }))).toBeNull();
  });

  for (const kind of ALIMTALK_KINDS) {
    it(`INV-N7: ${kind} — 변수를 채우면 기대 본문·버튼 주소와 글자까지 같고, 문서에 없는 변수는 넘기지 않는다`, () => {
      const doc = docs.get(kind)!;
      const vars = buildAlimtalkVariables(inputFor(kind))!;
      expect(vars).not.toBeNull();
      expect(fill(doc.body, vars)).toBe(EXPECTED[kind].body);
      expect(fill(doc.button!, vars)).toBe(EXPECTED[kind].button);
      const used = new Set([...placeholders(doc.body), ...placeholders(doc.button!)]);
      expect(Object.keys(vars).sort()).toEqual([...used].sort());
    });
  }

  it("INV-K1 · INV-N7: 로그인 링크 템플릿 — 본문은 승인 요청과 글자까지 같고 버튼은 토큰 링크, 변수는 건수·토큰 둘", () => {
    const doc = docs.get(LOGIN_LINK_TEMPLATE_KEY)!;
    expect(doc).toBeDefined();
    const { token } = newLoginLinkToken();
    const vars = buildLoginLinkAlimtalkVariables(inputFor("approval_request"), token)!;
    expect(fill(doc.body, vars)).toBe(EXPECTED.approval_request.body);
    expect(doc.body).toBe(docs.get("approval_request")!.body);
    expect(fill(doc.button!, vars)).toBe(`https://fankkuk.com/login/link#t=${token}`);
    expect(fill(doc.button!, vars).length).toBeLessThanOrEqual(300);
    // INV-K1 · S3: 토큰은 # 뒤 — 서버로 가는 주소(경로·쿼리)에 없다
    const url = new URL(fill(doc.button!, vars));
    expect(url.pathname + url.search).toBe("/login/link");
    expect(url.hash).toBe(`#t=${token}`);
    const used = new Set([...placeholders(doc.body), ...placeholders(doc.button!)]);
    expect(Object.keys(vars).sort()).toEqual([...used].sort());
  });

  it("INV-K1 (실패경로): 로그인 링크 변수는 승인 요청·토큰 꼴일 때만 — 다른 종류·빈 토큰·건수 없음은 null", () => {
    const { token } = newLoginLinkToken();
    expect(buildLoginLinkAlimtalkVariables(inputFor("approval_reminder"), token)).toBeNull();
    expect(buildLoginLinkAlimtalkVariables(inputFor("status_digest"), token)).toBeNull();
    expect(buildLoginLinkAlimtalkVariables(inputFor("approval_request"), "")).toBeNull();
    expect(buildLoginLinkAlimtalkVariables(inputFor("approval_request"), "x".repeat(10))).toBeNull();
    expect(buildLoginLinkAlimtalkVariables(inputFor("approval_request", { waitingCount: null }), token)).toBeNull();
  });

  it("INV-C8: 역조공 상자 도착은 보낸 역조공 화면으로", () => {
    const vars = buildAlimtalkVariables(inputFor("box_arrived", { orderNo: "RG-7K3M9" }))!;
    expect(fill(docs.get("box_arrived")!.button!, vars)).toBe("https://fankkuk.com/creator/revgifts");
  });

  it("INV-U15: 인증번호 템플릿의 변수 이름이 코드와 같다", () => {
    const doc = docs.get("SOLAPI_PHONE_CODE_TEMPLATE_ID")!;
    expect(placeholders(doc.body)).toEqual([PHONE_CODE_VARIABLE]);
    expect(fill(doc.body, { [PHONE_CODE_VARIABLE]: "123456" })).toBe("[팬꾹] 인증번호 안내\n\n인증번호: 123456\n\n3분 안에 입력해 주세요.");
  });

  it("INV-N7 (실패경로): 템플릿 문서에 없는 종류는 null — 검수받지 않은 본문으로 보내지 않는다", () => {
    expect(buildAlimtalkVariables(inputFor("hold"))).toBeNull();
    expect(buildAlimtalkVariables(inputFor("revgift_offer", { senderName: "모모" }))).toBeNull();
  });
});
