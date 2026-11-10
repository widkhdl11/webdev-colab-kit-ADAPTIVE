import type { SupabaseClient } from "@supabase/supabase-js";
import { readMyBox, readMyBoxes, readPriceTable, type MyBox, type MyBoxRow, type PriceTable } from "@/entities/revgift-box/api/box-reads";
import type { ManageEntry } from "../ui/box-list-page";

// 팬에게 보내기 목록 화면에 필요한 것 — 내 선물함 줄 · 신청 받는 중인 선물함의 신청 관리 내용(모달용) · 요금표(설명의 택배비).
// 신청 링크는 서버가 만든다 — 비공개면 초대 토큰을 붙인다(토큰은 주인에게만 보인다, revgift-box INV-GB4).
// 요금표는 표시용이라 읽지 못해도 화면은 그린다(표만 빠진다).

type Rpc = Pick<SupabaseClient, "rpc">;

export function applyUrlOf(box: Pick<MyBox, "id" | "inviteToken">, origin: string): string {
  const url = new URL(`/gift-boxes/${box.id}`, origin);
  if (box.inviteToken) url.searchParams.set("invite", box.inviteToken);
  return url.toString();
}

export async function loadBoxList(client: Rpc, origin: string): Promise<{ rows: MyBoxRow[]; manage: ManageEntry[]; price: PriceTable | null }> {
  const [rows, price] = await Promise.all([readMyBoxes(client), readPriceTable(client).catch(() => null)]);
  const open = rows.filter((r) => r.status === "open");
  const boxes = await Promise.all(open.map((r) => readMyBox(client, r.id)));
  const manage = boxes.filter((b): b is MyBox => b !== null && b.status === "open").map((box) => ({ box, applyUrl: applyUrlOf(box, origin) }));
  return { rows, manage, price };
}
