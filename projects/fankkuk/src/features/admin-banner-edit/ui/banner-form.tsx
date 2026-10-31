"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BANNER_DESCRIPTION_MAX, BANNER_TITLE_MAX, bannerTone, type BannerView } from "@/entities/banner/model/banner";
import { BannerSlide } from "@/entities/banner/ui/banner-slide";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { sendBanner } from "../api/banner-client";
import { BANNER_IMAGE_ACCEPT, bannerImagePickProblem, BANNER_IMAGE_MESSAGE } from "../model/banner-image";
import { bannerInputProblem } from "../model/banner-input";
import { RemoveBannerButton } from "./remove-banner-button";

// 배너 올리기·고치기 양식 (docs/specs/banners.md INV-Y3·Y4·Y6·Y7, 시안 v27-home-airy/admin-banners-pc 의 오른쪽 카드).
// 그림(PNG·JPG, 5MB) · 제목 1~30자 · 설명 0~40자 · 누르면 가는 곳 · 「크리에이터 광고」 표시 · 시작/끝(비우면 계속) · 미리보기 · 올리기.
// 글자 수는 DB 와 같은 기준(charCount — 코드 포인트)으로 센다. 입력칸 maxLength 는 다른 기준(UTF-16)이라 두지 않는다.
// 미리보기는 공개 화면과 같은 배너 부품(BannerSlide)의 작은 모양 — 「광고」 꼬리표도 같은 부품이 그린다(INV-Y7).
// 고칠 때는 그림을 고르지 않으면 지금 그림 그대로다. 부르는 쪽은 editing 이 바뀔 때 key 를 바꿔 칸을 새로 채운다.

export type BannerDraft = {
  id: string;
  title: string;
  description: string;
  link: string;
  isAd: boolean;
  startsOn: string;
  endsOn: string | null;
  imageUrl: string | null;
};

type Props = {
  editing: BannerDraft | null;
  onStopEditing: () => void;
  onSubmitStart: () => void;
  onSaved: (text: string) => void;
  /** 미리보기 바탕 — 이 배너가 목록에서 몇 번째인지로 정한다 */
  previewIndex?: number;
};

export function BannerForm({ editing, onStopEditing, onSubmitStart, onSaved, previewIndex = 0 }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [link, setLink] = useState(editing?.link ?? "");
  const [isAd, setIsAd] = useState(editing?.isAd ?? false);
  const [startsOn, setStartsOn] = useState(editing?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(editing?.endsOn ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; field: string | null } | null>(null);
  // 쓰던 내용 임시 저장(session-login INV-L20) — 새 배너와 고치는 배너마다 따로. 그림은 저장하지 않는다
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(formRef, `admin-banner-form:${editing?.id ?? "new"}`, { baseline: editing ? JSON.stringify(editing) : undefined });

  // 고른 그림의 미리보기 주소 — 바꾸거나 양식이 사라지면 놓아준다
  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const titleCount = charCount(title.trim());
  const descriptionCount = charCount(description.trim());
  const preview: BannerView = {
    id: editing?.id ?? "new",
    title: title.trim(),
    description: description.trim(),
    link: link.trim(),
    isAd,
    imageUrl: fileUrl ?? editing?.imageUrl ?? null,
  };

  function pick(next: File | null) {
    setMessage(null);
    if (!next) return;
    const problem = bannerImagePickProblem(next);
    if (problem) {
      setMessage({ text: problem, field: "image" });
      return;
    }
    setFile(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmitStart();
    const input = { id: editing?.id ?? null, title, description, link, isAd, startsOn, endsOn: endsOn === "" ? null : endsOn };
    const problem = bannerInputProblem({ title: title.trim(), description: description.trim(), link: link.trim(), startsOn, endsOn: input.endsOn });
    if (problem) {
      setMessage({ text: problem.message, field: problem.field });
      return;
    }
    if (!editing && !file) {
      setMessage({ text: BANNER_IMAGE_MESSAGE.empty, field: "image" });
      return;
    }
    setBusy(true);
    setMessage(null);
    const outcome = await sendBanner(input, file);
    setBusy(false);
    if (outcome.kind === "failed") {
      setMessage({ text: outcome.message, field: outcome.field });
      if (isStaleFailure(outcome)) router.refresh();
      return;
    }
    clear();
    setTitle("");
    setDescription("");
    setLink("");
    setIsAd(false);
    setStartsOn("");
    setEndsOn("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    onSaved(editing ? "고친 배너를 올렸어요." : "배너를 올렸어요.");
    router.refresh(); // 목록을 다시 읽는다
    if (editing) onStopEditing();
  }

  const bad = (field: string) => message?.field === field;
  const describe = (id: string, field: string) => (bad(field) ? `${id} banner-form-error` : id);

  return (
    <form ref={formRef} className={a.stack} style={{ gap: 12 }} onSubmit={submit} noValidate>
      <div className={a.field}>
        <span className={a.fieldLabel} id="banner-image-label">
          그림
        </span>
        <div className={a.btnRow} style={{ gap: 12 }}>
          <button
            type="button"
            className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
            onClick={() => fileRef.current?.click()}
            aria-describedby={describe("banner-image-hint", "image")}
            aria-invalid={bad("image")}
          >
            그림 고르기
          </button>
          <span className={a.faint} id="banner-image-hint">
            PNG·JPG, 5MB 이하 · 정사각형 권장
          </span>
        </div>
        <input
          ref={fileRef}
          id="banner-image"
          type="file"
          accept={BANNER_IMAGE_ACCEPT}
          hidden
          aria-labelledby="banner-image-label"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className={a.field}>
        <label htmlFor="banner-title">제목 (1~{BANNER_TITLE_MAX}자)</label>
        <input
          id="banner-title"
          className={a.input}
          autoComplete="off"
          aria-describedby={describe("banner-title-count", "title")}
          aria-invalid={bad("title") || titleCount > BANNER_TITLE_MAX}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.count} id="banner-title-count">
          {titleCount} / {BANNER_TITLE_MAX}
        </span>
      </div>
      <div className={a.field}>
        <label htmlFor="banner-description">설명 (0~{BANNER_DESCRIPTION_MAX}자)</label>
        <input
          id="banner-description"
          className={a.input}
          autoComplete="off"
          aria-describedby={describe("banner-description-count", "description")}
          aria-invalid={bad("description") || descriptionCount > BANNER_DESCRIPTION_MAX}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.count} id="banner-description-count">
          {descriptionCount} / {BANNER_DESCRIPTION_MAX}
        </span>
      </div>
      <div className={a.field}>
        <label htmlFor="banner-link">누르면 가는 곳</label>
        <input
          id="banner-link"
          className={a.input}
          autoComplete="off"
          inputMode="url"
          aria-describedby={describe("banner-link-hint", "link")}
          aria-invalid={bad("link")}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.faint} id="banner-link-hint">
          팬꾹 주소(/로 시작) 또는 https 주소. 바깥 주소는 새 탭으로 열려요.
        </span>
      </div>
      <label className={a.check}>
        <input id="banner-ad" type="checkbox" checked={isAd} onChange={(e) => setIsAd(e.target.checked)} /> 크리에이터 광고 — 제목 앞에 「광고」 표시
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className={a.field}>
          <label htmlFor="banner-starts">시작</label>
          <input
            id="banner-starts"
            type="date"
            className={a.input}
            aria-invalid={bad("startsOn")}
            aria-describedby={bad("startsOn") ? "banner-form-error" : undefined}
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
              setMessage(null);
            }}
          />
        </div>
        <div className={a.field}>
          <label htmlFor="banner-ends">끝 (비우면 계속)</label>
          <input
            id="banner-ends"
            type="date"
            className={a.input}
            aria-invalid={bad("endsOn")}
            aria-describedby={bad("endsOn") ? "banner-form-error" : undefined}
            value={endsOn}
            onChange={(e) => {
              setEndsOn(e.target.value);
              setMessage(null);
            }}
          />
        </div>
      </div>
      <div className={a.field}>
        <span className={a.fieldLabel}>미리보기</span>
        <div data-banner-preview="">
          <BannerSlide banner={preview} tone={bannerTone(previewIndex)} compact />
        </div>
      </div>
      <div role="status">
        {message && (
          <p className={a.errorLine} id="banner-form-error">
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {message.text}
          </p>
        )}
      </div>
      <div className={a.btnRow}>
        <button type="submit" className={a.btn} aria-disabled={busy}>
          {busy ? "올리는 중…" : "올리기"}
        </button>
        {editing && (
          <>
            <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={() => {
              clear(); // [취소]로 버림(INV-L20)
              onStopEditing();
            }} aria-disabled={busy}>
              고치기 그만두기
            </button>
            <RemoveBannerButton bannerId={editing.id} bannerTitle={editing.title} onDone={(text) => {
              onSaved(text);
              onStopEditing();
            }} />
          </>
        )}
      </div>
    </form>
  );
}
