"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BANNER_STATE_LABEL, type AdminBanner, type BannerState } from "@/entities/banner/model/banner";
import { postBannerOrder } from "@/features/admin-banner-edit/api/banner-client";
import { BannerForm, type BannerDraft } from "@/features/admin-banner-edit/ui/banner-form";
import a from "@/shared/ui/admin.module.css";
import p from "./banners-panel.module.css";

// 운영자 「광고 배너」 화면 (docs/specs/banners.md INV-Y1·Y2·Y7·Y8, 시안 v27-home-airy/admin-banners-pc). 운영자(대표·직원) 누구나.
// 왼쪽 표: 순서(↑↓) · 그림 · 제목(「광고」 표시) · 누르면 가는 곳 · 기간 · 상태(DB 가 계산한 보이는 중·예정·끝남) · 고치기.
// 오른쪽: 올리기·고치기 양식(미리보기 포함). 내리기는 고칠 때 양식 아래 — 페이지 안 확인 창.
// 표는 칸 폭 안에 맞춘다(시안의 가로 스크롤은 없앤다) — 제목은 줄을 바꾸고, 주소는 말줄임.
// 순서를 바꾸면 지금 표 순서 전체를 보낸다(DB 가 1, 2, 3 … 으로 다시 매긴다).

const STATE_CLASS: Record<BannerState, string> = { live: `${a.tag} ${a.tagBrand}`, scheduled: a.tag, ended: a.faint };

/** 2026-10-14 → 10-14 */
const monthDay = (date: string) => date.slice(5);

export function BannersPanel({ banners, imageUrls }: { banners: readonly AdminBanner[]; imageUrls: Readonly<Record<string, string>> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ draft: BannerDraft; index: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  function startEditing(b: AdminBanner, index: number) {
    setEditing({
      draft: { id: b.id, title: b.title, description: b.description, link: b.link, isAd: b.isAd, startsOn: b.startsOn, endsOn: b.endsOn, imageUrl: imageUrls[b.id] ?? null },
      index,
    });
    setNotice(null);
    requestAnimationFrame(() => document.getElementById("banner-title")?.focus());
  }

  async function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (moving || to < 0 || to >= banners.length) return;
    const ids = banners.map((b) => b.id);
    [ids[index], ids[to]] = [ids[to]!, ids[index]!];
    setMoving(true);
    setNotice(null);
    const outcome = await postBannerOrder(ids);
    setMoving(false);
    setNotice(outcome.kind === "ok" ? "순서를 바꿨어요." : outcome.message);
    router.refresh();
  }

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>광고 배너</h1>
          <p>로그인 전 첫 화면·팬 홈·크리에이터 홈·크리에이터 찾기에 순서대로 넘어가며 보여요. 기간이 끝나면 저절로 내려가요.</p>
        </div>
      </div>

      <div className={a.split}>
        <div className={`${a.tblWrap} ${p.fit}`}>
          <table className={`${a.tbl} ${p.tbl}`}>
            <caption className="sr-only">광고 배너 목록</caption>
            <colgroup>
              <col className={p.cOrder} />
              <col className={p.cImg} />
              <col />
              <col className={p.cLink} />
              <col className={p.cPeriod} />
              <col className={p.cState} />
              <col className={p.cAct} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">순서</th>
                <th scope="col">그림</th>
                <th scope="col">제목</th>
                <th scope="col">누르면 가는 곳</th>
                <th scope="col">기간</th>
                <th scope="col">상태</th>
                <th scope="col">
                  <span className="sr-only">관리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {banners.length === 0 ? (
                <tr>
                  <td colSpan={7} className={a.empty}>
                    아직 올린 배너가 없어요.
                  </td>
                </tr>
              ) : (
                banners.map((b, i) => (
                  <tr key={b.id}>
                    <td className={a.mono}>
                      {i + 1}
                      <span className={p.moves}>
                        <button type="button" className={p.move} aria-label={`「${b.title}」 위로 옮기기`} aria-disabled={i === 0 || moving} onClick={() => move(i, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className={p.move}
                          aria-label={`「${b.title}」 아래로 옮기기`}
                          aria-disabled={i === banners.length - 1 || moving}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                      </span>
                    </td>
                    <td>{imageUrls[b.id] ? <img className={p.thumb} src={imageUrls[b.id]} alt="" width={40} height={40} /> : null}</td>
                    <td className={p.title}>
                      <strong>
                        {b.isAd ? <span className={`${a.tag} ${p.adTag}`}>광고</span> : null}
                        {b.title}
                      </strong>
                    </td>
                    <td className={`${a.mono} ${p.link}`} title={b.link}>
                      {b.link}
                    </td>
                    <td className={`${a.mono} ${a.nowrap}`}>
                      {monthDay(b.startsOn)} ~ {b.endsOn ? monthDay(b.endsOn) : "계속"}
                    </td>
                    <td>
                      <span className={STATE_CLASS[b.state]}>{BANNER_STATE_LABEL[b.state]}</span>
                    </td>
                    <td className={a.act}>
                      <button
                        type="button"
                        className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                        onClick={() => startEditing(b, i)}
                        aria-label={`「${b.title}」 고치기`}
                        aria-pressed={editing?.draft.id === b.id}
                      >
                        고치기
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <section className={`${a.card} ${a.sideCard}`} aria-labelledby="h-banner-form">
          <div className={a.sectionH}>
            <h2 id="h-banner-form">{editing ? "배너 고치기" : "배너 올리기"}</h2>
          </div>
          <BannerForm
            key={editing?.draft.id ?? "new"}
            editing={editing?.draft ?? null}
            previewIndex={editing?.index ?? banners.length}
            onStopEditing={() => setEditing(null)}
            onSubmitStart={() => setNotice(null)}
            onSaved={setNotice}
          />
          <p role="status" className={a.doneLine} style={{ marginTop: 8 }}>
            {notice}
          </p>
        </section>
      </div>
    </>
  );
}
