import type { LegalDoc } from "../model/legal-doc";
import { DocPage } from "./doc-page";
import s from "./legal.module.css";

// 안내 글 화면(이용 안내 팬·크리에이터 · 검수 기준 · 보안 안내 · 분쟁 처리 안내 · 요금 안내). design-rules 28절.
// 공통 틀(doc-page)에 안내 글 다섯 탭과 보안 안내의 흐름 그림을 끼운다. 버전 기록은 없고, 최종 수정일은 글 데이터(updated)가 있으면 머리 아래 한 줄.
// 요금 안내(/pricing)는 같은 틀을 쓰지만 안내 글 다섯이 아니라 탭 줄을 그리지 않는다(tab 을 넘기지 않는다).

export type GuideTab = "guide-fan" | "guide-creator" | "inspection" | "security" | "dispute";

const GUIDE_TABS: readonly { key: GuideTab; href: string; name: string }[] = [
  { key: "guide-fan", href: "/guide/fan", name: "팬 이용 안내" },
  { key: "guide-creator", href: "/guide/creator", name: "크리에이터 이용 안내" },
  { key: "inspection", href: "/inspection", name: "검수 기준" },
  { key: "security", href: "/security", name: "보안 안내" },
  { key: "dispute", href: "/dispute", name: "분쟁 처리 안내" },
];

// icon 은 v11 머리 그림 자리였다 — 지금 머리에는 그림이 없어 쓰지 않는다(부르는 쪽 모양은 그대로 둔다)
// flow: 보안 안내의 그림(차례대로 이어지는 칸) — 요약 아래에 한 줄로, 좁은 폭에서는 위아래로 쌓인다.
type FlowStep = { title: string; text: string };
type Props = {
  doc: LegalDoc;
  icon: string;
  /** 안내 글 다섯 탭 가운데 지금 글. 없으면 탭 줄을 그리지 않는다(요금 안내) */
  tab?: GuideTab;
  flow?: readonly FlowStep[];
  flowLabel?: string;
};

export function LegalPage({ doc, tab, flow, flowLabel }: Props) {
  return (
    <DocPage
      doc={doc}
      variant="guide"
      tabs={tab ? { label: "이용 안내", current: tab, items: GUIDE_TABS } : undefined}
      figure={
        flow ? (
          <figure className={s.figure}>
            <ol className={s.flow}>
              {flow.map((step, i) => (
                <li key={step.title} className="card">
                  <span className={s.flowNo} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="t-strong">{step.title}</h3>
                  <p className={s.flowText}>{step.text}</p>
                </li>
              ))}
            </ol>
            {flowLabel ? <figcaption className="t-meta">{flowLabel}</figcaption> : null}
          </figure>
        ) : null
      }
    />
  );
}
