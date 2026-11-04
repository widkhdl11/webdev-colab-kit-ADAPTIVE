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
    // 승인 요청·재알림은 맨 앞 팬 닉네임과 서로 다른 팬 수, 답장 도착은 답장한 크리에이터 이름(2026-11-04 — DB 가 꺼낸 줄에 넣는 값)
    senderName: kind === "approval_request" || kind === "approval_reminder" ? "별빛" : kind === "gift_reply" ? "모모" : null,
    senderCount: kind === "approval_request" || kind === "approval_reminder" ? 3 : null,
    disposeDueAt: null,
    mustDeliver: isMustDeliver(kind),
    appOrigin: "https://fankkuk.com",
    ...over,
  };
}

/** 우리가 기대하는 본문 — 문서와 따로 적는다(둘 중 하나만 바뀌면 깨지게) */
const FOLLOW = "\n\n알림 수신 여부는 ‘계정 설정 > 알림’에서 변경할 수 있습니다.";
const GIFT = "https://fankkuk.com/gifts/FC-7K3M9";
const ACTIONS = "https://fankkuk.com/creator/actions";
const EXPECTED: Record<(typeof ALIMTALK_KINDS)[number], { body: string; button: string }> = {
  // 묶음 알림(notification-batching INV-NB1·NB2·NB5) — 주문번호 없이 건수, 링크는 목록(INV-NB3·NB4). 승인 요청·재알림은 받는 크리에이터와 보낸 팬 이름(2026-11-04)
  approval_request: {
    body:
      "[팬꾹] 선물 승인 요청\n\n하루님, 별빛님 외 2명이 선물을 보내려고 승인을 요청했습니다.\n\n승인 대기: 총 3건\n\n" +
      "승인 화면에서 선물 내용을 확인하고 승인 또는 거절해 주세요. 7일 안에 승인하지 않은 요청은 자동으로 반려됩니다.\n\n" +
      "이 알림은 팬이 크리에이터에게 선물 승인을 요청했을 때 발송되는 필수 알림으로, 알림 수신 설정과 관계없이 발송됩니다.",
    button: ACTIONS,
  },
  approval_reminder: {
    body:
      "[팬꾹] 선물 승인 대기 안내\n\n하루님, 별빛님 외 2명이 요청한 선물 승인이 아직 대기 중입니다.\n\n승인 대기: 총 3건\n2일 뒤에는 승인하지 않은 요청이 자동으로 반려됩니다.\n\n" +
      "이 알림은 팬이 요청한 선물 승인이 대기 중일 때 발송되는 필수 알림으로, 알림 수신 설정과 관계없이 발송됩니다.",
    button: ACTIONS,
  },
  status_digest: { body: `하루님,\n팬꾹에서 진행 중인 선물에 새 소식 4건이 있습니다.\n\n선물 진행 상황은 로그인 후 확인해 주세요.${FOLLOW}`, button: "https://fankkuk.com/gifts" },
  box_arrived: { body: `하루님,\n팬꾹에서 선물 보내기를 신청하신 상자 1개가 팬꾹에 도착했습니다.\n\n주문번호: FC-7K3M9\n\n상자 도착 현황은 로그인 후 확인해 주세요.${FOLLOW}`, button: GIFT },
  shipped: {
    body: `하루님,\n팬꾹에서 선물 보내기를 신청하신 선물이 출고 처리되었습니다.\n택배사에 인계되면 배송이 시작됩니다.\n\n주문번호: FC-7K3M9\n\n선물 진행 상황은 로그인 후 확인해 주세요.${FOLLOW}`,
    button: GIFT,
  },
  in_transit: { body: `하루님,\n팬꾹에서 선물 보내기를 신청하신 선물이 배송 중입니다.\n\n주문번호: FC-7K3M9\n\n선물 진행 상황은 로그인 후 확인해 주세요.${FOLLOW}`, button: GIFT },
  delivered: { body: `하루님,\n팬꾹에서 선물 보내기를 신청하신 선물의 배송이 완료되었습니다.\n\n주문번호: FC-7K3M9\n\n선물 상세 정보는 로그인 후 확인해 주세요.${FOLLOW}`, button: GIFT },
  // 답장 도착 — 답장한 크리에이터(제3자) 이름이 들어간다(2026-11-04)
  gift_reply: { body: `하루님,\n모모님이 하루님이 보낸 선물에 답장을 보냈습니다.\n\n주문번호: FC-7K3M9\n\n로그인 후 답장을 확인해 주세요.${FOLLOW}`, button: GIFT },
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

  it("INV-N1 · INV-NB3: 승인 요청·재알림의 보낸 팬 표기 — 한 명이면 「별빛님」, 받는 사람은 그 크리에이터 닉네임", () => {
    for (const kind of ["approval_request", "approval_reminder"] as const) {
      const vars = buildAlimtalkVariables(inputFor(kind, { senderCount: 1 }))!;
      expect([kind, vars["#{보내는사람}"], vars["#{수신자명}"]]).toEqual([kind, "별빛님", "하루"]);
    }
  });

  it("INV-N1 · INV-NB3 (실패경로): 받는 사람·보낸 팬 이름이 비면 승인 요청·재알림 알림톡을 만들지 않는다 — 이름 빈 칸으로 보내지 않는다", () => {
    for (const kind of ["approval_request", "approval_reminder"] as const) {
      expect([kind, buildAlimtalkVariables(inputFor(kind, { senderName: null }))]).toEqual([kind, null]);
      expect([kind, buildAlimtalkVariables(inputFor(kind, { senderName: "  " }))]).toEqual([kind, null]);
      expect([kind, buildAlimtalkVariables(inputFor(kind, { senderCount: null }))]).toEqual([kind, null]);
      expect([kind, buildAlimtalkVariables(inputFor(kind, { senderCount: 0 }))]).toEqual([kind, null]);
      expect([kind, buildAlimtalkVariables(inputFor(kind, { nickname: " " }))]).toEqual([kind, null]);
    }
  });

  it("INV-N1 (실패경로): 답장한 크리에이터 이름이 비면 답장 도착 알림톡을 만들지 않는다", () => {
    expect(buildAlimtalkVariables(inputFor("gift_reply", { senderName: null }))).toBeNull();
    expect(buildAlimtalkVariables(inputFor("gift_reply", { senderName: " " }))).toBeNull();
  });

  it("INV-N1 (실패경로): 상태 알림·하루 묶음에는 보낸 사람 이름을 넘겨도 변수에 섞이지 않는다", () => {
    for (const kind of ["box_arrived", "shipped", "in_transit", "delivered", "status_digest"] as const) {
      const vars = buildAlimtalkVariables(inputFor(kind, { senderName: "모모", senderCount: 2 }))!;
      expect([kind, Object.values(vars).some((x) => x.includes("모모"))]).toEqual([kind, false]);
    }
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

  it("INV-K1 · INV-N7: 로그인 링크 템플릿 — 본문은 승인 요청과 글자까지 같고 버튼은 토큰 링크, 변수는 승인 요청의 변수 + 토큰", () => {
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
