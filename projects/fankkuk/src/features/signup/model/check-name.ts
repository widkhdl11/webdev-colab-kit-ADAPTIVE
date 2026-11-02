import { z } from "zod";
import { isHandleShape, normalizeHandle } from "@/entities/creator/model/creator-handle";
import { isReservedLoginId, SIGNUP_LOGIN_ID_PATTERN } from "@/entities/session/model/login-id";
import { nicknameSchema } from "@/entities/session/model/nickname-rule";

// 아이디·닉네임·팬꾹 링크 미리 확인의 앱 서버 판정(signup INV-U14 — 팬꾹 링크는 채널 확인 단계의 링크 만들기 칸).
// - 본문에서 종류(loginId·nickname·linkHandle)와 값만 꺼낸다. 형식이 틀린 값은 DB 를 부르지 않고 invalid.
// - 형식이 맞으면 DB 함수 signup_name_check 에 접속 주소 해시와 함께 넘긴다 — 횟수 한도(1분 30번)와 존재 여부는 DB 가 한 처리에서 본다.
// - 팬꾹 링크는 소문자로 바꾼 뒤 꼴(creator-link INV-E2)을 보고, 예약어면 DB 가 reserved 를 준다(계정 표를 찾지 않음).
//   로그인 아이디와 같은지는 화면이 서버에 묻지 않고 본다 — 이 처리는 다른 칸의 값을 받지 않는다.
// - 답은 글자 하나(result)뿐이다. 누구의 계정인지·언제 가입했는지 같은 것은 DB 도 돌려주지 않고 여기서도 싣지 않는다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type CheckNameDeps = { admin: { rpc: Rpc } };

export type NameCheckResult = "available" | "taken" | "invalid" | "reserved" | "rate_limited";

export type CheckNameReply = { status: 200 | 429; body: { result: NameCheckResult } } | { status: 400; body: { message: string } };

const bodySchema = z.object({
  kind: z.enum(["loginId", "nickname", "linkHandle"]),
  value: z.string().max(200),
});

const resultSchema = z.enum(["available", "taken", "invalid", "reserved", "rate_limited"]);

const DB_KIND = { loginId: "login_id", nickname: "nickname", linkHandle: "link_handle" } as const;

export async function checkSignupName(deps: CheckNameDeps, body: unknown, ipHash: string): Promise<CheckNameReply> {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { message: "유효하지 않은 요청입니다." } };
  const { kind } = parsed.data;
  const value = kind === "linkHandle" ? normalizeHandle(parsed.data.value) : parsed.data.value.trim();

  const shapeOk =
    kind === "loginId" ? SIGNUP_LOGIN_ID_PATTERN.test(value) : kind === "linkHandle" ? isHandleShape(value) : nicknameSchema.safeParse(value).success;
  if (!shapeOk) return { status: 200, body: { result: "invalid" } };
  // INV-U6: 탈퇴 처리가 쓰는 아이디 — 가입 처리도 같은 답(이미 쓰는 아이디)을 준다
  if (kind === "loginId" && isReservedLoginId(value)) return { status: 200, body: { result: "taken" } };

  const { data, error } = await deps.admin.rpc("signup_name_check", { p_ip_hash: ipHash, p_kind: DB_KIND[kind], p_value: value });
  if (error) throw new Error(`미리 확인을 하지 못했다: ${error.code ?? "코드 없음"}`);
  const result = resultSchema.safeParse(data);
  if (!result.success) throw new Error("미리 확인 응답의 형식이 틀렸다");
  return { status: result.data === "rate_limited" ? 429 : 200, body: { result: result.data } };
}
