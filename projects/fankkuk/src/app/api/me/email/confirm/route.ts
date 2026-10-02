import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { confirmEmail } from "@/features/email-confirm/model/confirm-email";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 확인 메일 링크 확인. 링크(GET)를 여는 것만으로는 바뀌지 않고, 화면의 버튼이 이 POST 를 보내야 바뀐다 —
// 메일 검사기가 링크를 미리 열어도 확인되지 않게, 그리고 고치기는 같은 사이트 JSON 만 받게(my-account INV-A6).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await confirmEmail({ client: supabase, viewer: await readViewer(supabase) }, body);
    if (result.ok) return { status: 200, body: { email: result.email } };
    return { status: result.status, body: { message: result.message } };
  });
}
