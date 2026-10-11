import { hardItemsNotice, type HardItems } from "../model/hard-items";

// 받기 어려운 품목 공개 문구 한 줄 (hard-items INV-H6). 크리에이터 페이지가 쓴다 — 나중에 링크 페이지(F-1)로 합칠 때 이 조각만 옮긴다.
// 문구는 정해진 틀로만 만든다(hardItemsNotice). 설정이 없으면(끝났으면 서버가 빼서 보낸다) 아무것도 그리지 않는다.
export function HardItemsLine({ hardItems, className }: { hardItems: HardItems | null | undefined; className?: string }) {
  const text = hardItemsNotice(hardItems);
  if (!text) return null;
  return <p className={className}>{text}</p>;
}
