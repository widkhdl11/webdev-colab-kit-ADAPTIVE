import { describe, expect, it } from "vitest";
import { buildReportMail, REPORT_BODY_MAX, type ReportDraft } from "./report-mail";

const ok: ReportDraft = { kind: "impersonation", replyTo: "fan@example.com", pageUrl: "https://example.com/fake", body: "팬꾹을 사칭하는 페이지예요." };

const decode = (href: string) => {
  const url = new URL(href);
  return { to: decodeURIComponent(url.pathname), subject: url.searchParams.get("subject"), body: url.searchParams.get("body") };
};

describe("신고·문의 메일", () => {
  it("적은 내용이 고객센터 이메일로 가는 메일 창 주소가 된다(분류·답변받을 이메일·페이지 주소·내용)", () => {
    const r = buildReportMail(ok, "help@example.com");
    expect(r.ok).toBe(true);
    const m = decode(r.ok ? r.href : "");
    expect(m.to).toBe("help@example.com");
    expect(m.subject).toBe("[팬꾹 사칭 페이지 신고]");
    expect(m.body).toBe("분류: 사칭 페이지 신고\n답변받을 이메일: fan@example.com\n페이지 주소: https://example.com/fake\n\n팬꾹을 사칭하는 페이지예요.");
  });

  it("페이지 주소는 비워도 되고, 비우면 메일에 그 줄이 없다", () => {
    const r = buildReportMail({ ...ok, kind: "general", pageUrl: "" }, "help@example.com");
    expect(r.ok && decode(r.href).body).not.toContain("페이지 주소");
  });

  it("고객센터 이메일이 비어 있으면 메일을 만들지 않는다", () => {
    expect(buildReportMail(ok, " ")).toMatchObject({ ok: false, field: null });
  });

  it("칸마다 틀린 값을 그 칸으로 돌려보낸다", () => {
    expect(buildReportMail({ ...ok, kind: "" }, "h@e.com")).toMatchObject({ ok: false, field: "kind" });
    expect(buildReportMail({ ...ok, replyTo: "not-mail" }, "h@e.com")).toMatchObject({ ok: false, field: "replyTo" });
    expect(buildReportMail({ ...ok, pageUrl: "javascript:alert(1)" }, "h@e.com")).toMatchObject({ ok: false, field: "pageUrl" });
    expect(buildReportMail({ ...ok, body: "   " }, "h@e.com")).toMatchObject({ ok: false, field: "body" });
    expect(buildReportMail({ ...ok, body: "가".repeat(REPORT_BODY_MAX + 1) }, "h@e.com")).toMatchObject({ ok: false, field: "body" });
    expect(buildReportMail({ ...ok, body: "가".repeat(REPORT_BODY_MAX) }, "h@e.com").ok).toBe(true);
  });

  it("받는 주소 설정값이 이메일 형식이 아니면 만들지 않는다(다른 주소를 끼워 넣지 못한다)", () => {
    expect(buildReportMail(ok, "help@example.com?cc=x@y.z")).toMatchObject({ ok: false, field: null });
    expect(buildReportMail(ok, "help@example.com")).toMatchObject({ ok: true, href: expect.stringMatching(/^mailto:help@example\.com\?subject=/) });
  });
});
