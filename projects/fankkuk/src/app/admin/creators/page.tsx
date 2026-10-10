import type { Metadata } from "next";
import { readAdminVerifications } from "@/entities/creator/api/creator-verification-reads";
import { readAdminCreators, readNameChanges, readVerificationEvents } from "@/entities/creator/api/read-admin-creators";
import { readAdminTagOptions, readBannedWords, readCustomTags } from "@/entities/creator/api/creator-tag-reads";
import { CreatorsPanel } from "@/widgets/admin-creators/ui/creators-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "크리에이터 확인 · 팬꾹 관리자" };
}

// 크리에이터 본인 확인 (creator-verification INV-V6·V11, admin-console INV-K10·K8) · 태그 선택지와 직접 입력한 태그(creator-tags INV-T1·T5). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const [creators, verifications, events, nameChanges, tagOptions, customTags, bannedWords] = await Promise.all([
    readAdminCreators(supabase),
    readAdminVerifications(supabase),
    readVerificationEvents(supabase),
    readNameChanges(supabase),
    readAdminTagOptions(supabase),
    readCustomTags(supabase),
    readBannedWords(supabase),
  ]);
  return <CreatorsPanel creators={creators} verifications={verifications} events={events} nameChanges={nameChanges} tagOptions={tagOptions} customTags={customTags} bannedWords={bannedWords} />;
}
