import { z } from "zod";

// 신고·문의(/report) — 로그인 없이 쓰는 메일 양식. 서버에 저장하지 않고, 적은 내용을 고객센터 이메일로 보내는 메일 창(mailto:)을 연다.
// 첨부는 받지 않는다(요청서). 받는 주소는 site-info 의 고객센터 이메일이고, 비어 있으면 양식을 보내지 못한다.

export const REPORT_KINDS = ["impersonation", "image_rights", "general"] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABELS: Readonly<Record<ReportKind, string>> = {
  impersonation: "사칭 페이지 신고",
  image_rights: "사진 권리 침해 신고",
  general: "일반 문의",
};

/** 메일 앱마다 주소 길이 한도가 달라 내용은 1,000자까지만 받는다. */
export const REPORT_BODY_MAX = 1000;

export type ReportDraft = { kind: string; replyTo: string; pageUrl: string; body: string };

export type ReportField = "kind" | "replyTo" | "pageUrl" | "body";

const schema = z.object({
  kind: z.enum(REPORT_KINDS, { error: "분류를 골라 주세요." }),
  replyTo: z.email({ error: "답변받을 이메일을 확인해 주세요." }),
  pageUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "페이지 주소는 http 나 https 로 시작해야 해요." })]),
  body: z
    .string()
    .trim()
    .min(1, { error: "내용을 적어 주세요." })
    .max(REPORT_BODY_MAX, { error: `내용은 ${REPORT_BODY_MAX.toLocaleString("ko-KR")}자까지 적을 수 있어요.` }),
});

export type ReportMail = { ok: true; href: string } | { ok: false; field: ReportField | null; message: string };

/** 적은 내용으로 mailto 주소를 만든다. 받는 이메일이 없거나 칸이 틀리면 만들지 않는다. */
export function buildReportMail(draft: ReportDraft, to: string): ReportMail {
  const parsed = schema.safeParse({ ...draft, replyTo: draft.replyTo.trim(), pageUrl: draft.pageUrl.trim() });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = (issue?.path[0] as ReportField | undefined) ?? null;
    return { ok: false, field, message: issue?.message ?? "입력한 내용을 확인해 주세요." };
  }
  // 받는 주소는 설정값이다 — 칸 검사를 먼저 하고 마지막에 본다. 이메일 형식이 아니면(빈 값 포함) 만들지 않는다.
  // 형식을 통과한 주소는 ?·& 가 없어 그대로 붙인다.
  if (!z.email().safeParse(to.trim()).success) return { ok: false, field: null, message: "고객센터 이메일이 아직 없어요. 로그인했다면 고객센터의 1:1 문의를 써 주세요." };
  const d = parsed.data;
  const subject = `[팬꾹 ${REPORT_KIND_LABELS[d.kind]}]`;
  const lines = [`분류: ${REPORT_KIND_LABELS[d.kind]}`, `답변받을 이메일: ${d.replyTo}`];
  if (d.pageUrl !== "") lines.push(`페이지 주소: ${d.pageUrl}`);
  lines.push("", d.body);
  const href = `mailto:${to.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  return { ok: true, href };
}
