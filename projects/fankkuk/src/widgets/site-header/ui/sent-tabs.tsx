import Link from "next/link";
import { CREATOR_SENT_HREFS } from "../model/app-menu";

// 크리에이터 사이드바 「보낸 내역」 한 칸이 맡는 두 화면을 잇는 탭(design-rules 11절). 화면은 둘 그대로 두고 오가는 길만 놓는다.
// 모양은 공통 탭(base.css .tabs a[aria-current]). 화면을 바꾸는 링크라 role=tab 을 쓰지 않는다 — 각 화면 안의 상태 탭과 겹치지 않게.

export function SentTabs({ current }: { current: keyof typeof CREATOR_SENT_HREFS }) {
  const tabs = [
    { id: "fans", href: CREATOR_SENT_HREFS.fans, label: "팬에게 보낸 선물" },
    { id: "creators", href: CREATOR_SENT_HREFS.creators, label: "크리에이터에게 보낸 선물" },
  ] as const;
  return (
    <nav className="tabs" aria-label="보낸 내역">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
