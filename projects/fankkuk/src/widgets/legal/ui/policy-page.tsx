"use client";

import Link from "next/link";
import type { LegalDoc } from "../model/legal-doc";
import type { VersionedKind, VersionLink } from "../model/legal-versions";
import { DocPage } from "./doc-page";
import d from "./doc-page.module.css";
import s from "./policy-page.module.css";

// 버전이 있는 세 글(이용약관·개인정보처리방침·취소·환불 규정) 화면. 시안: docs/design/mockups/site/v26-terms/index.html
// 공통 틀(doc-page)에 세 글 탭 · 사실 한 줄(버전·시행일·운영) · 지난 버전 알림 · 버전 기록 · 고객센터 판을 끼운다.
// 왼쪽 따라오는 목차는 없앴다 — 모든 폭에서 위에 붙는 목차 줄(차이 목록 D1 ②).
// 클라이언트 부품이다 — 서버에서 만든 여러 자식 JSX 를 클라이언트 틀(DocPage)에 넘기면 정적 자식이 key 없는 배열로 바뀌어 경고가 난다(2026-10-23 화면 확인). 받는 값은 모두 데이터다.

const TABS: readonly (readonly [VersionedKind, string, string])[] = [
  ["terms", "/terms", "이용약관"],
  ["privacy", "/privacy", "개인정보처리방침"],
  ["refund", "/refund", "취소·환불 규정"],
];

type Props = { kind: VersionedKind; doc: LegalDoc; history: readonly VersionLink[]; pastVersion: boolean };

export function PolicyPage({ kind, doc, history, pastVersion }: Props) {
  const current = history.find((h) => h.current);

  return (
    <DocPage
      doc={doc}
      variant="policy"
      ask
      tabs={{ label: "약관과 정책", current: kind, items: TABS.map(([key, href, name]) => ({ key, href, name })) }}
      meta={
        <p className={s.facts}>
          {doc.facts.map(([k, v]) => (
            <span key={k}>
              {k} <strong>{v}</strong>
            </span>
          ))}
          <a href="#versions">버전 기록 보기</a>
        </p>
      }
      notice={
        pastVersion ? (
          <p className={s.past} role="note">
            이전 버전입니다. 현재 시행 중인 내용은 <Link href={current?.href ?? "/"}>최신 버전</Link>에서 확인해 주세요.
          </p>
        ) : null
      }
      after={
        <section id="versions" className={d.art} aria-labelledby="versions-h">
          <h2 className={d.artT} id="versions-h">
            버전 기록
          </h2>
          <ul className={s.versions}>
            {history.map((v) => (
              <li key={v.version} className={s.version}>
                <span>
                  <Link href={v.href} aria-current={v.current && !pastVersion ? "page" : undefined}>
                    버전 {v.version}
                  </Link>{" "}
                  <span className={d.sub}>· 시행일 {v.effective}</span>
                </span>
                {v.current ? <span className={s.nowTag}>지금 시행 중</span> : null}
              </li>
            ))}
          </ul>
          {history.length === 1 ? <p className={s.note}>이전 버전이 없습니다.</p> : null}
        </section>
      }
    />
  );
}
