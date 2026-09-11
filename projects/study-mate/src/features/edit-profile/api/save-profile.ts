// 프로필 수정의 본체. 근거 스펙: docs/specs/profile-editing.md (INV-E1 ~ INV-E6)
//
// **"use server" 파일과 나눠 둔 이유**는 `features/create-post` 와 같다 — 액션 파일의
// 내보내기는 전부 클라이언트가 부를 수 있는 자리라, 클라이언트를 인자로 여는 조립을 거기
// 두면 그 인자가 요청으로 들어올 수 있는 값이 된다.

import { randomUUID } from "node:crypto";
import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { defaultPathDeps, type PathDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { formText } from "@/shared/lib/form-text";
import { hasBidiFormatting, hasControlChars, hasVisibleContent } from "@/shared/lib/text";
import {
  AVATAR_EXTENSION,
  AVATAR_MAX_LABEL,
  USERNAME_MAX,
  isAvatarType,
} from "../model/limits";

const BUCKET = "avatars";

/**
 * 프로필 한 벌을 고친다.
 *
 * **어느 행을 고칠지는 세션이 정한다** (INV-E1·E2). 폼이 실어 보낸 어떤 id 도 안 쓰고,
 * 접근 정책이 `id = auth.uid()` 를 양쪽으로 요구하므로 여기서 틀려도 데이터베이스가 거부한다.
 *
 * **지역·관심분야를 목록에 있는 값인지 여기서 다시 확인하지 않는다** (INV-E5). 외래 키가
 * 그 판정의 주인이고, 조건을 옮겨 적으면 두 벌이 되어 한쪽만 고쳐지는 날 어긋난다.
 * 빈 문자열은 「안 정했다」이므로 null 로 바꾼다 — 빈 문자열은 외래 키에 걸려 거부된다.
 *
 * **사진은 저장할 때마다 새 경로로 올리고, 행 갱신이 성공한 뒤에 옛 파일을 지운다.**
 * 고정 경로로 덮어쓰면 세 가지가 난다 — ① 행 갱신이 실패해도 화면의 사진은 이미 바뀌어
 * 있고(사용자는 "저장하지 못했습니다"를 읽는다) ② 주소가 글자까지 같아서 브라우저·CDN 이
 * 최대 한 시간 옛 사진을 준다 ③ 형식을 바꿔 올리면 옛 파일이 공개된 채 영원히 남는다.
 * 새 경로 + 성공 후 삭제는 셋을 한 번에 닫는다.
 */
export async function saveProfile(
  user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<null>> {
  const username = formText(form, "username");
  const bio = formText(form, "bio");
  const region = formText(form, "region");
  const interest = formText(form, "interest");

  // **판정 순서는 세 자리(이름·제목·메시지)가 같다** — 보이는 내용 → 길이 → 제어문자 →
  // 서식 문자. 같은 값에 화면마다 다른 설명이 나가면 한쪽은 막다른 길이 된다
  // (2026-09-11 code-reviewer). 강제 위치는 전부 데이터베이스이고 여기는 문구를 위한 자리다.
  //
  // `!username` 은 보이지 않는 이름을 못 잡는다 — `formText` 의 `trim()` 은 전각 공백도
  // 폭 없는 공백도 안 자른다. 그런 이름은 멤버 목록에서 폭 0px 로 그려진다(실측).
  if (!username || !hasVisibleContent(username)) {
    return { ok: false, message: "이름을 적어 주세요" };
  }
  if ([...username].length > USERNAME_MAX) {
    return { ok: false, message: `이름은 ${USERNAME_MAX}자까지 쓸 수 있습니다` };
  }
  // 제어문자(0015)와 양방향 서식 문자(INV-T2). **문구가 다음에 할 일을 준다** — 이 값들은
  // 화면에서 안 보이므로 「글자가 있습니다」만 말하면 지울 대상을 못 찾는다.
  if (hasControlChars(username) || hasBidiFormatting(username)) {
    return { ok: false, message: "화면에 안 보이는 글자가 섞여 있습니다. 붙여 넣지 말고 직접 입력해 주세요" };
  }
  // **`bio` 는 일부러 안 본다.** 여러 줄 입력창이라 줄바꿈이 정상 입력이고, 이 스펙이 고른
  // 네 열에도 안 들어간다(자기 `<p>` 안에 혼자 그려져서 제품 글자와 문단을 안 나눈다).
  // 여기에 `hasControlChars(bio)` 를 붙이면 줄바꿈 있는 소개가 통째로 막힌다.
  // 길이 상한이 없다는 것은 따로 백로그에 있다.

  const picked = form.get("avatar");
  const file = picked instanceof File && picked.name !== "" ? picked : null;
  // 「안 골랐다」와 「고른 파일이 비어 있다」는 다르다. 하나로 접으면 파일을 골랐는데
  // 사진이 안 바뀌고 이유도 안 나온다.
  if (file && file.size === 0) return { ok: false, message: "고른 파일이 비어 있습니다" };
  if (file && !isAvatarType(file.type)) {
    return { ok: false, message: `사진은 PNG · JPG · WEBP 만, ${AVATAR_MAX_LABEL}까지 올릴 수 있습니다` };
  }

  const supabase = await createSupabase();

  // 옛 경로를 먼저 알아 둔다 — 성공한 뒤에 지울 대상이다. 사진을 안 고른 요청은 안 읽는다.
  let oldPath: string | null = null;
  if (file) {
    const { data } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
    oldPath = (data as { avatar_url: string | null } | null)?.avatar_url ?? null;
  }

  let newPath: string | null = null;
  if (file) {
    // 경로의 첫 칸이 곧 인가다 (INV-E3). 파일 이름을 사용자에게서 받지 않는 이유는,
    // 받으면 `../` 같은 것으로 폴더를 벗어나려는 시도가 이 자리에 도착하기 때문이다.
    const path = `${user.id}/${randomUUID()}.${AVATAR_EXTENSION[file.type as keyof typeof AVATAR_EXTENSION]}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type });
    if (error) {
      return { ok: false, message: `사진을 올리지 못했습니다. ${AVATAR_MAX_LABEL} 이하인지 확인해 주세요` };
    }
    newPath = path;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      bio: bio || null,
      region: region || null,
      interest_category: interest || null,
      // 사진을 안 고른 요청은 기존 사진을 그대로 둔다 — 안 보낸 것과 지운 것은 다르다
      ...(newPath ? { avatar_url: newPath } : {}),
    })
    .eq("id", user.id);

  if (error) {
    // 방금 올린 파일을 되돌린다. 안 지우면 공개 버킷에 주인 없는 파일이 남는다.
    // 이 삭제가 실패해도 사용자에게는 원래 실패를 말한다 — 그게 사용자가 고칠 수 있는 것이다.
    if (newPath) await supabase.storage.from(BUCKET).remove([newPath]);
    return { ok: false, message: dbErrorMessage("프로필을 저장", error) };
  }

  // 성공한 뒤에 옛 파일을 지운다. 실패해도 사용자에게는 성공이다 — 프로필은 이미 바뀌었고,
  // 남은 파일은 사용자가 어떻게 할 수 있는 것이 아니다.
  if (newPath && oldPath && oldPath !== newPath) {
    const { error: leftover } = await supabase.storage.from(BUCKET).remove([oldPath]);
    if (leftover) console.error(`[storage] 옛 아바타 삭제 실패 path=${oldPath} message=${leftover.message}`);
  }

  return { ok: true, value: null };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 프로필 화면들을 다시 받게 한다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 둔다.** 액션 파일에 두면 그 두 줄을 지워도
 * 전 스위트가 초록불이다 — 프로필은 저장됐는데 화면은 옛 이름을 보여 주는 상태가
 * 아무 신호 없이 만들어진다 (2026-09-06 code-reviewer).
 */
export function makeSaveProfile(
  readUser: typeof currentUser = currentUser,
  deps: PathDeps = defaultPathDeps,
) {
  const guarded = requireSession(readUser, (user, form: FormData) =>
    saveProfile(user, form, deps.createSupabase),
  );
  return async (form: FormData) => {
    const result = await guarded(form);
    // 같은 자리에 머물지 않고 프로필 화면으로 돌아가는데, 그 화면이 방금 고친 값을
    // 보여 줘야 한다. 다른 화면들(모집글 상세의 작성자 이름 등)도 같은 값을 그린다.
    if (result.ok) deps.revalidatePaths("/profile", "/profile/edit");
    return result;
  };
}
