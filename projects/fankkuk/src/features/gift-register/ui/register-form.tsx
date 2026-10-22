"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { matchesCreatorQuery, type CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import { RETURN_ON_REJECT_NOTICE } from "@/entities/order/ui/fan-stage-copy";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE, RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
import { PRICE_CHANGED_MESSAGE, PRICED_TIERS, type PricedTier, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { formatDuration } from "@/shared/lib/format/datetime";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { anniversaryInWeek, restingNotice, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import { hardItemOverlap, type HardItems } from "@/entities/gift-item/model/hard-items";
import { forcesMetalReport, isItemCategory, ITEM_CATEGORIES, ITEM_CATEGORY_LABEL, ITEM_OTHER_MAX, type ItemCategory } from "@/entities/gift-item/model/item-category";
import { charCount } from "@/shared/lib/validation/char-count";
import { MEMO_BODY_MAX, MEMO_TITLE_MAX } from "@/entities/order/model/gift-memo";
import { PAYMENT_CONSENT_MISSING, PaymentConsent } from "@/entities/payment/ui/payment-consent";
import { PHOTO_ACCEPT } from "@/shared/lib/image/photo-limits";
import { photoPickProblem } from "@/shared/lib/image/photo-pick";
import { receivingNotice } from "../model/receiving-notice";
import { summarizeBoxes } from "../model/box-summary";
import { movingNotice } from "../model/sender-rule";
import { MAX_BOX_COUNT, registerFormSchema, type RegisterFormOutput, type RegisterFormValues } from "../model/register-input";
import { PROMISE } from "@/shared/config/site-copy";
import f from "./register-form.module.css";

/** 고를 수 있는 크리에이터 한 명. 소개 칸(태그·채널 이름·로마자 이름)이 없으면 목록 한 줄에 플랫폼 이름만 보인다. */
export type CreatorOption = Pick<CreatorCard, "id" | "name" | "platform" | "approvalMinutes"> &
  Partial<Pick<CreatorCard, "tags" | "channelTitle" | "alias" | "faceTone" | "following" | "handle">> & {
    /** 채널 이사 중(creator-verification INV-V12) — 찾기에는 나오지만 지금은 선물을 받지 않는다 */
    moving?: boolean;
    /** 공개 받는 상태 — 쉬는 중 날짜·생일·기념일(creator-receiving). 한도 칸은 없다(INV-B6) */
    receiving?: CreatorReceiving;
    /** 로그인한 내가 이번 달 이 크리에이터의 한도에 닿았는가 — 내 등록 화면에만 쓴다(INV-B6) */
    limitReached?: boolean;
    /** 살아 있는 받기 어려운 품목(hard-items) — 고른 종류가 겹치면 결제 전에 안내한다(INV-H8) */
    hardItems?: HardItems;
  };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const COUNT_FIELD = { small: "smallCount", medium: "mediumCount", large: "largeCount" } as const;

/** 1단계 목록에서 처음에 보이는 사람 수. 나머지는 「N명 더 보기」(PICKS_STEP 명씩)나 검색으로
 * (2026-10-07 사용자 「12명이 나오니까 너무 길다」 · 「팔로우 중인 사람이 30명이면」 → 카드 d41). */
const VISIBLE_PICKS = 5;
const PICKS_STEP = 10;

type StepNo = 1 | 2 | 3 | 4;
const STEP_NOS: readonly StepNo[] = [1, 2, 3, 4];
const STEP_LABEL: Record<StepNo, string> = { 1: "크리에이터", 2: "선물", 3: "상자", 4: "결제" };
/** 「다음」을 누르면 그 단계 칸만 검증한다. 4단계(결제)는 제출 때 전체를 다시 검증한다. */
const STEP_FIELDS: Record<Exclude<StepNo, 4>, (keyof RegisterFormValues)[]> = {
  1: ["creatorId"],
  2: ["itemCategory", "itemOther", "electronicsOrMetal", "memoTitle", "memoBody"],
  3: ["smallCount", "mediumCount", "largeCount"],
};


/** 등록이 끝나 결제창으로 넘길 값. 금액은 서버가 계산한 것이다. */
export type RegisteredGift = { orderId: string; orderNo: string; amountKrw: number };

type RegisterResponse = Partial<RegisteredGift> & { message?: string; reason?: "hard_item" };

// 선물 보내기 4단계(크리에이터·선물·상자·결제 확인). 「결제하기」를 누르면 서버(/api/gifts)에 등록하고 결제창으로 넘긴다.
// 결제는 등록 때 받는다(결제 스펙). 화면의 금액은 결제와 같은 계산(chargeLines)에 화면을 열 때 읽은 공개 요금표(prices)를 넣은 안내다.
// 등록 요청에 이 화면이 보여 준 합계(quotedTotalKrw)를 같이 보내고, 서버는 등록 순간의 요금표로 다시 계산한 합계와 비교만 한다 —
// 결제 금액은 서버 계산값이다(INV-M1·K3). 다르면(화면을 연 뒤 요금이 바뀌었으면) 서버가 409 로 거부하고,
// 화면은 문구를 띄운 뒤 서버 page 를 다시 그려 새 요금표로 금액을 고쳐 보여 준다. 다시 누르면 새 합계로 보낸다.
// 보내는 사람은 서버가 로그인 세션으로 정한다(INV-L3) — 이 폼은 사용자 칸을 보내지 않는다.
export function RegisterForm({
  creators,
  prices,
  initialCreatorId = "",
  notice,
  onRegistered,
  onCreatorChange,
  today,
}: {
  creators: readonly CreatorOption[];
  /** 지금 공개 요금표(받는 값만) — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 크리에이터 화면에서 넘어오면 그 사람을 미리 골라 둔다 */
  initialCreatorId?: string;
  /** 결제창에서 돌아온 실패 안내 */
  notice?: string;
  /** 등록이 끝나면 — 고른 선물 사진(선택)도 같이 넘긴다. 사진은 받는 쪽이 등록된 주문에 올린다(together INV-F2) */
  onRegistered: (gift: RegisteredGift, photo: File | null) => void | Promise<void>;
  /** 1단계에서 크리에이터를 바꿔 고르면 — 고른 크리에이터 ID 를 알린다(선물 보내기 맨 위 한 줄이 미리 고른 사람일 때만 보이게) */
  onCreatorChange?: (creatorId: string) => void;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다(쉬는 중·기념일 7일·다음 달 1일 계산, creator-receiving) */
  today: CalendarDate;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepNo>(1);
  const [reached, setReached] = useState<StepNo>(1);
  const [query, setQuery] = useState("");
  const [pickLimit, setPickLimit] = useState(VISIBLE_PICKS);
  const [submitError, setSubmitError] = useState<{ message: string; needsLogin: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 다시 그려지기 전에 Enter·클릭이 연달아 와도 한 번만 보내게 — state 는 다음 그리기까지 옛 값이다
  const submittingRef = useRef(false);
  // 결제 전 동의(약관·처리방침·취소·환불 규정) — 체크하지 않으면 결제로 넘어가지 않는다
  const [consented, setConsented] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const [noticeShown, setNoticeShown] = useState(true);
  // creator-receiving INV-B9: 「{기념일} 선물」 표시를 고른 크리에이터 — 다른 크리에이터로 바꾸면 고른 것이 풀린다
  const [markedFor, setMarkedFor] = useState<string | null>(null);
  // together INV-F2: 선물 사진(선택, 팬 기록 전용) — 등록이 끝난 뒤 그 주문에 올린다. 보내기 전에 종류·크기만 미리 본다(서버가 다시 연다)
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  // metrics INV-Q5: 받기 어려운 품목 안내가 처음 뜬 품목 — 크리에이터마다 하나. 바꾸고 결제하면 「바꿨다」로 센다(DB 가 그때의 설정과 다시 맞춰 본다)
  const [noticed, setNoticed] = useState<{ creatorId: string; category: ItemCategory } | null>(null);

  const stepsWrap = useRef<HTMLElement>(null);
  const hardNote = useRef<HTMLElement | null>(null);
  const headings = useRef<Partial<Record<StepNo, HTMLHeadingElement | null>>>({});
  // 단계를 바꾼 뒤 어디로 포커스할지 — 보통은 새 단계 제목, 받기 어려운 품목으로 2단계에 돌아왔으면 그 안내 줄
  const pendingFocus = useRef<false | "heading" | "hard-note">(false);

  // 단계가 바뀌면 새 단계 제목으로 포커스 — 화면 낭독기가 바뀐 내용을 처음부터 읽게
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current;
    pendingFocus.current = false;
    (target === "hard-note" && hardNote.current ? hardNote.current : headings.current[step])?.focus({ preventScroll: true });
    stepsWrap.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    // 전자기기 신고는 기본값이 없다 — 팬이 직접 골라야 한다
    // 물품 종류도 기본값이 없다 — 팬이 목록에서 직접 고른다(hard-items INV-H1)
    defaultValues: { creatorId: initialCreatorId, itemOther: "", smallCount: "1", mediumCount: "0", largeCount: "0", memoTitle: "", memoBody: "" },
  });
  const creatorId = useWatch({ control, name: "creatorId" });
  const watchedCategory = useWatch({ control, name: "itemCategory" });
  const itemCategory = isItemCategory(watchedCategory) ? watchedCategory : null;
  const itemOther = useWatch({ control, name: "itemOther" }) ?? "";
  const memoTitle = useWatch({ control, name: "memoTitle" }) ?? "";
  const memoBody = useWatch({ control, name: "memoBody" }) ?? "";
  const metal = useWatch({ control, name: "electronicsOrMetal" });
  const summary = summarizeBoxes(prices, {
    small: useWatch({ control, name: "smallCount" }),
    medium: useWatch({ control, name: "mediumCount" }),
    large: useWatch({ control, name: "largeCount" }),
  });

  const go = (n: StepNo, focus: "heading" | "hard-note" = "heading") => {
    pendingFocus.current = focus;
    setStep(n);
    setReached((r) => (n > r ? n : r));
  };

  const next = async () => {
    if (step === 4) return;
    const ok = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    const blocked = step === 1 && ok ? creatorBlock() : null;
    if (blocked) {
      setError("creatorId", { message: blocked }, { shouldFocus: true });
      return;
    }
    // hard-items INV-H8: 고른 종류를 크리에이터가 「등록 막기」로 두었으면 2단계에서 넘어가지 않는다 — 포커스를 그 안내 줄로 옮긴다.
    // 「안내만」이면 그대로 넘어간다. 등록은 DB 가 다시 막는다(INV-H7)
    if (step === 2 && ok && hardOverlap?.blocks) {
      hardNote.current?.focus();
      return;
    }
    if (ok) go((step + 1) as StepNo);
  };

  /**
   * 고른 크리에이터에게 지금 보낼 수 없으면 그 안내(아니면 null). 1단계 「다음」과 결제 직전이 같이 쓴다.
   * INV-V12 채널 이사 중 → creator-receiving INV-B2·B6 쉬는 중·내 한도 순. 등록은 DB 가 다시 막는다.
   */
  const creatorBlock = (): string | null => {
    const c = creators.find((x) => x.id === getValues("creatorId"));
    return movingNotice(c) ?? receivingNotice(c, today);
  };

  // 지난 단계로 돌아가 칸을 비운 뒤 결제로 건너뛴 경우 — 오류가 있는 첫 단계로 보낸다
  const onInvalid = (errs: Partial<Record<keyof RegisterFormValues, unknown>>) => {
    const first = ([1, 2, 3] as const).find((n) => STEP_FIELDS[n].some((k) => errs[k] !== undefined));
    if (first) go(first);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    // 4단계 전에는 Enter 가 「다음」과 같다 — 결제 확인 화면을 건너뛰고 제출되지 않게
    if (step < 4) {
      e.preventDefault();
      void next();
      return;
    }
    // 4단계까지 간 뒤 1단계에서 크리에이터를 바꾸고 단계 버튼으로 결제에 바로 오면 「다음」의 판정을 건너뛴다 — 결제 직전에 다시 본다
    const blocked = creatorBlock();
    if (blocked) {
      e.preventDefault();
      setError("creatorId", { message: blocked });
      go(1);
      return;
    }
    if (hardOverlap?.blocks) {
      e.preventDefault();
      go(2, "hard-note");
      return;
    }
    if (!consented) {
      e.preventDefault();
      setConsentMissing(true);
      document.getElementById("pay-consent")?.focus();
      return;
    }
    void handleSubmit(() => submit(), onInvalid)(e);
  };

  // 검증을 통과한 폼 값(문자열 그대로)과 화면이 보여 준 합계를 보낸다 — 서버가 같은 입력 경계(parseRegisterInput)로 다시 검사하고,
  // 합계는 등록 순간 요금표로 계산한 값과 비교만 한다(INV-K3).
  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setNoticeShown(false);
    try {
      const { creatorId, itemCategory: category, itemOther: other, smallCount, mediumCount, largeCount, electronicsOrMetal, memoTitle: memoTitleValue, memoBody: memoBodyValue } = getValues();
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId,
          itemCategory: category,
          // 기타 글은 기타일 때만 보낸다 — 다른 종류면 DB 가 종류 이름을 물품 이름으로 적는다
          ...(category === "other" ? { itemOther: other } : {}),
          smallCount,
          mediumCount,
          largeCount,
          electronicsOrMetal,
          // together INV-F7: 나만 보는 메모 — 물품 이름(itemOther)과 다른 칸. 비면 서버가 저장하지 않는다
          memoTitle: memoTitleValue ?? "",
          memoBody: memoBodyValue ?? "",
          quotedTotalKrw: summary.totalKrw,
          // INV-B9: 고른 표시만 이름으로 보낸다. 7일 안인지는 DB 가 그날 다시 계산해 아니면 표시 없이 저장한다
          ...(anniversaryMark && markAnniversary ? { anniversaryName: anniversaryMark } : {}),
          // metrics INV-Q5: 이 크리에이터에게서 안내가 뜬 품목(없으면 보내지 않는다)
          ...(noticed && noticed.creatorId === creatorId ? { hardNoticeCategory: noticed.category } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as RegisterResponse;
      if (res.ok && body.orderId && body.orderNo && typeof body.amountKrw === "number") {
        await onRegistered({ orderId: body.orderId, orderNo: body.orderNo, amountKrw: body.amountKrw }, photo);
        return;
      }
      if (res.status === 401) setSubmitError({ message: "로그인하면 선물을 보낼 수 있어요.", needsLogin: true });
      else if (res.status === 403) setSubmitError({ message: body.message ?? "팬 계정으로 로그인해 주세요.", needsLogin: false });
      // 받을 수 없는 크리에이터 — 본인 확인 전이거나 이 사람을 차단했다. 둘을 가르지 않는 서버 문구를 그대로 보인다(decline-block INV-D7)
      else if (res.status === 404) setSubmitError({ message: body.message ?? "선물을 받을 수 없는 크리에이터예요.", needsLogin: false });
      else if (res.status === 409 && body.reason === "hard_item") {
        // hard-items INV-H7: 화면을 연 뒤 크리에이터가 이 품목을 「등록 막기」로 바꿨다 — 새 설정을 다시 읽고 2단계로 돌아가 안내한다
        setSubmitError({ message: body.message ?? "다른 선물을 골라 주세요.", needsLogin: false });
        router.refresh();
        go(2, "hard-note");
      }
      else if (res.status === 409) {
        // 화면을 연 뒤 요금이 바뀌었다(INV-K3) — 서버 page 를 다시 그려 새 요금표로 금액을 보여 준다. 고른 값은 그대로 남는다
        setSubmitError({ message: body.message ?? PRICE_CHANGED_MESSAGE, needsLogin: false });
        router.refresh();
      }
      else setSubmitError({ message: "입력한 내용을 다시 확인해 주세요.", needsLogin: false });
    } catch {
      setSubmitError({ message: "등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.", needsLogin: false });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // 끝에 닿은 버튼은 disabled 대신 aria-disabled 로 둔다 — disabled 가 되면 키보드 포커스가 사라진다
  const changeCount = (tier: PricedTier, delta: 1 | -1) => {
    if (delta > 0 ? !summary.canAdd : !summary.canRemove[tier]) return;
    const hasCountError = errors.smallCount !== undefined || errors.mediumCount !== undefined || errors.largeCount !== undefined;
    setValue(COUNT_FIELD[tier], String(summary.counts[tier] + delta));
    // 합계 오류(하나 이상·10개까지)는 smallCount 칸에 붙는다 — 어느 칸을 바꿨든 세 칸을 같이 다시 검증해야 지난 오류가 사라진다
    if (hasCountError) void trigger(["smallCount", "mediumCount", "largeCount"]);
  };

  // 크리에이터 찾기 화면과 같은 검색 규칙(이름·로마자 이름·태그·채널 이름·플랫폼)
  const matches = creators.filter((c) => matchesCreatorQuery(c, query));
  // 검색하지 않을 때는 앞의 pickLimit 명만(미리 고른 사람·최근에 선물한 사람이 앞에 온다). 고른 사람은 접어도 보이게 남긴다.
  const searching = query.trim() !== "";
  const visible = searching ? matches : matches.filter((c, i) => i < pickLimit || c.id === creatorId);
  const hiddenCount = Math.max(0, creators.length - pickLimit);
  const picked = creators.find((c) => c.id === creatorId);
  // INV-B9: 고른 크리에이터의 기념일이 7일 안(D-7 ~ D-day)이면 표시를 고를 수 있다 — 크리에이터 페이지 D-day 와 같은 계산
  const anniversaryMark = picked?.receiving ? anniversaryInWeek(today, picked.receiving.anniversaries) : null;
  const markAnniversary = markedFor !== null && markedFor === creatorId;
  // hard-items INV-H8: 고른 종류가 크리에이터의 받기 어려운 품목과 겹치면 결제 전에 안내 — 「등록 막기」면 넘어가지 않는다
  const hardOverlap = picked ? hardItemOverlap(picked.name, picked.hardItems, itemCategory) : null;
  // metrics INV-Q5: 안내가 처음 뜬 순간의 품목을 기억한다 — 다른 크리에이터로 바꾸면 그 크리에이터 기준으로 다시 잡는다.
  // 안내 줄은 2단계에만 보인다 — 다른 단계에서 크리에이터를 바꿔 겹침이 생겨도 화면에 뜬 적이 없으니 기억하지 않는다.
  // 그리는 중에 한 번만 바꾸는 이전 값 맞추기(조건이 맞으면 다음 그리기에서 더 바뀌지 않는다)
  if (step === 2 && hardOverlap && itemCategory && creatorId && noticed?.creatorId !== creatorId) setNoticed({ creatorId, category: itemCategory });
  const itemText = itemCategory === null ? "" : itemCategory === "other" ? itemOther.trim() || ITEM_CATEGORY_LABEL.other : ITEM_CATEGORY_LABEL[itemCategory];
  const metalForced = forcesMetalReport(itemCategory);
  const metalText = metal === "yes" ? "네, 있어요" : metal === "no" ? "아니요, 없어요" : "아직 안 골랐어요";
  const boxesText =
    PRICED_TIERS.filter((t) => summary.counts[t] > 0)
      .map((t) => `${PARCEL_TIER_GUIDE[t].name} ${summary.counts[t]}개`)
      .join(" · ") || "없음";
  const totalText = summary.totalKrw !== null ? won(summary.totalKrw) : summary.overLimit ? `${MAX_BOX_COUNT}개 초과` : "—";
  const boxError = errors.smallCount?.message ?? errors.mediumCount?.message ?? errors.largeCount?.message;

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    const problem = photoPickProblem(file);
    setPhotoError(problem);
    setPhoto(problem ? null : file);
    if (problem && photoRef.current) photoRef.current.value = "";
  };
  const clearPhoto = () => {
    setPhoto(null);
    setPhotoError(null);
    if (photoRef.current) photoRef.current.value = "";
  };

  const err = (id: string, message: string | undefined) =>
    message ? (
      <p className={f.error} id={id} role="alert">
        {message}
      </p>
    ) : null;

  // 맨 위 하늘 단계 판의 제목·설명 — 단계마다 하나씩 두고 지금 단계만 보인다(포커스·낭독은 제목 h-1~h-4 그대로)
  const stepText: Record<StepNo, readonly [string, string]> = {
    1: ["누구에게 보낼까요?", "팔로우한 크리에이터 중에서 골라요."],
    2: ["어떤 선물인가요?", "크리에이터가 승인할 때 이 내용을 봐요. 검수에서 추적 장치와 구분하는 데도 써요."],
    3: ["상자는 몇 개인가요?", `상자마다 배송비가 포함돼 있어요. 모두 합쳐 ${MAX_BOX_COUNT}개까지 한 번에 보낼 수 있어요.`],
    4: ["확인하고 결제해요", "맞는지 한 번 더 봐 주세요. 틀린 곳은 「고치기」로 돌아갈 수 있어요."],
  };

  const heading = (n: StepNo, text: string) => (
    <h2
      className={f.h}
      id={`h-${n}`}
      tabIndex={-1}
      ref={(el) => {
        headings.current[n] = el;
      }}
    >
      {text}
    </h2>
  );

  const fix = (n: StepNo, label: string) => (
    <button className={f.fix} type="button" aria-label={`${label} 고치기`} onClick={() => go(n)}>
      고치기
    </button>
  );

  // 이전·다음(결제하기) 버튼 묶음 — 흰 입력 판 맨 아래 오른쪽(시안 v39 gifts-new-b .actions2)
  const actions = (
    <div className={f.actions}>
      {step > 1 ? (
        <button className="btn btn--line" type="button" onClick={() => go((step - 1) as StepNo)}>
          이전
        </button>
      ) : null}
      {step < 4 ? (
        <button key="next" className="btn" type="button" onClick={() => void next()}>
          다음
        </button>
      ) : (
        <button key="pay" className="btn" type="submit" aria-disabled={submitting} aria-busy={submitting || undefined}>
          {summary.totalKrw !== null ? `${won(summary.totalKrw)} 결제하기` : "결제하기"}
        </button>
      )}
    </div>
  );

  const alerts = (
    <>
      {step === 4 && submitError ? (
        <p className={f.error} role="alert">
          {submitError.message}
          {submitError.needsLogin ? (
            <>
              {" "}
              <Link href="/login">로그인하기</Link>
            </>
          ) : null}
        </p>
      ) : null}
      {notice && noticeShown ? (
        <p className={f.error} role="alert">
          {notice}
        </p>
      ) : null}
    </>
  );

  return (
    <div className={f.root}>
      {/* 맨 위 하늘 단계 판 — 단계 숫자(48) / 4 단계 · 이번 단계 제목 · 네 칸 진행 막대 (design-rules 25절, 시안 v39 .fhero) */}
      <section className={f.hero} aria-labelledby={`h-${step}`} ref={stepsWrap}>
        <img className={f.peek} src="/images/home/icon-gift.webp" alt="" aria-hidden="true" width={96} height={96} />
        <div className={f["hero-row"]}>
          <p className={`num-big ${f.count}`}>
            {step}
            <small>/ 4 단계</small>
          </p>
          <div className={f["hero-text"]}>
            {STEP_NOS.map((n) => (
              <div key={n} hidden={step !== n}>
                {heading(n, stepText[n][0])}
                <p className={f.lead}>{stepText[n][1]}</p>
              </div>
            ))}
          </div>
        </div>
        <nav aria-label="선물 보내기 단계">
          <ol className={f.fsteps}>
            {STEP_NOS.map((n) => {
              const isDone = n !== step && n < reached; // 지나온 단계만 완료 — 아직 넘지 않은 마지막 단계는 숫자 그대로
              return (
                <li key={n} className={n === step ? f.on : isDone ? f.done : undefined}>
                  <button type="button" disabled={n > reached} aria-current={n === step ? "step" : undefined} onClick={() => go(n)}>
                    <span className={f.n} aria-hidden="true">
                      {isDone ? "✓" : n}
                    </span>
                    {STEP_LABEL[n]}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </section>

      <form className={f.panel} onSubmit={onSubmit} noValidate aria-label="선물 보내기 입력">
        {/* 1 크리에이터 */}
        <fieldset className={f.step} hidden={step !== 1} aria-describedby={errors.creatorId ? "creator-error" : undefined}>
          <legend className="sr-only">받는 크리에이터</legend>
          <label className="sr-only" htmlFor="pick-q">
            크리에이터 검색
          </label>
          <input
            className="field"
            id="pick-q"
            type="search"
            placeholder="이름이나 채널 이름으로 찾아요"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // 검색창의 Enter 는 목록만 거른다 — 「다음」으로 넘어가지 않게
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <div className={f["pick-head"]}>
            <strong>팔로우한 크리에이터</strong>
            <p role="status" aria-live="polite">
              {query.trim() ? `검색 결과 ${matches.length}명` : `전체 ${creators.length}명`}
            </p>
          </div>
          {/* 걸러진 줄은 지우지 않고 숨긴다 — 고른 값이 그대로 남게. 한 줄에 한 사람(시안 .plist.one) */}
          <ul className={f["pick-list"]}>
            {creators.map((c) => {
              const resting = restingNotice(c.receiving?.resumeOn ?? null, today);
              const meta = [c.channelTitle ?? c.platform, c.moving ? "채널 이사 중 · 지금은 선물을 받지 않아요" : (resting ?? approvalTimeText(c.approvalMinutes))]
                .filter(Boolean)
                .join(" · ");
              // 쉬는 중·이사 중 크리에이터 카드는 회색 바탕으로 낮춘다(design-rules 25절) — 고르는 것은 막지 않는다(「다음」이 안내한다)
              const stopped = c.moving === true || resting !== null;
              return (
                <li key={c.id} hidden={!visible.includes(c)}>
                  <label className={`${f.pick} ${stopped ? f.stop : ""}`}>
                    <input
                      className="sr-only"
                      type="radio"
                      value={c.id}
                      {...register("creatorId", { onChange: (e: { target: { value: string } }) => onCreatorChange?.(e.target.value) })}
                    />
                    <CreatorFace tone={c.faceTone ?? "var(--face-1)"} className={f["pick-face"]} />
                    <span className={f["pick-text"]}>
                      <strong title={c.name}>{c.name}</strong>
                      {/* 태그는 다른 화면과 같은 태그 부품(아이콘·플랫폼 색, design-rules 5절) */}
                      {(c.tags ?? []).length > 0 ? (
                        <span className={f["pick-tags"]}>
                          {(c.tags ?? []).map((t) => (
                            <CreatorTag key={t} name={t} />
                          ))}
                        </span>
                      ) : null}
                      <span className={f["pick-meta"]} title={meta}>
                        {meta}
                      </span>
                    </span>
                    {/* 고른 카드의 오른쪽 체크 — 모양만, 고른 상태는 라디오가 알린다 */}
                    <span className={f["pick-ok"]} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24">
                        <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {!searching && creators.length > VISIBLE_PICKS ? (
            <div className={f["more-row"]}>
              {hiddenCount > 0 ? (
                <button className="btn btn--line btn--sm" type="button" onClick={() => setPickLimit((n) => n + PICKS_STEP)}>
                  {Math.min(PICKS_STEP, hiddenCount)}명 더 보기 <span className={f["more-left"]}>(남은 {hiddenCount}명)</span>
                </button>
              ) : (
                <button className="btn btn--line btn--sm" type="button" onClick={() => setPickLimit(VISIBLE_PICKS)}>
                  접기
                </button>
              )}
            </div>
          ) : null}
          {matches.length === 0 ? (
            <p className={f["empty-mini"]} role="status">
              찾는 크리에이터가 없어요. 팔로우한 크리에이터만 고를 수 있어요.
            </p>
          ) : null}
          {err("creator-error", errors.creatorId?.message)}
        </fieldset>

        {/* 2 선물 */}
        <fieldset className={f.step} hidden={step !== 2}>
          <legend className="sr-only">선물 종류와 전자기기·금속 제품 신고</legend>
          {/* hard-items INV-H1: 물품 종류는 고정 목록에서 고른다. 냉장·냉동·음식·액체는 목록에 없다. 기타만 직접 적는다 */}
          <div
            role="radiogroup"
            aria-labelledby="category-q"
            aria-describedby={["category-hint", errors.itemCategory ? "category-error" : "", hardOverlap ? "hard-note" : ""].filter(Boolean).join(" ")}
          >
            <p className={f.lb} id="category-q">
              선물 종류
            </p>
            <div className={f.opts}>
              {ITEM_CATEGORIES.map((c) => {
                const field = register("itemCategory", {
                  // INV-H2: 전자기기를 고르면 신고를 「있어요」로 정한다(DB 등록 함수도 켠다)
                  onChange: (e: { target: { value: string } }) => {
                    if (forcesMetalReport(isItemCategory(e.target.value) ? e.target.value : null)) {
                      setValue("electronicsOrMetal", "yes", { shouldValidate: errors.electronicsOrMetal !== undefined });
                    }
                  },
                });
                return (
                  <label key={c} className={f.opt}>
                    <input type="radio" value={c} {...field} />
                    {ITEM_CATEGORY_LABEL[c]}
                  </label>
                );
              })}
            </div>
            <p className={f.hint} id="category-hint">
              음식·음료·냉장·냉동이 필요한 것과 액체는 받지 않아요.
            </p>
            {err("category-error", errors.itemCategory?.message)}
            {hardOverlap ? (
              hardOverlap.blocks ? (
                <p
                  className={f.error}
                  id="hard-note"
                  role="alert"
                  tabIndex={-1}
                  ref={(el) => {
                    hardNote.current = el;
                  }}
                >
                  {hardOverlap.message}
                </p>
              ) : (
                <div
                  className={f.hardnote}
                  id="hard-note"
                  role="status"
                  tabIndex={-1}
                  ref={(el) => {
                    hardNote.current = el;
                  }}
                >
                  <strong>{hardOverlap.message}</strong>
                  <p>그대로 보내도 돼요. 받을지는 크리에이터가 승인할 때 정해요.</p>
                </div>
              )
            ) : null}
          </div>
          {itemCategory === "other" ? (
            <div className={f.block}>
              <div className={f["field-head"]}>
                <label className="label" htmlFor="itemOther">
                  어떤 선물인가요? ({ITEM_OTHER_MAX}자까지)
                </label>
                <span className={f["char-count"]} id="itemOther-count" aria-live="polite" data-over={charCount(itemOther) > ITEM_OTHER_MAX ? "true" : undefined}>
                  {charCount(itemOther)} / {ITEM_OTHER_MAX}자
                </span>
              </div>
              <input
                id="itemOther"
                className="field"
                type="text"
                // 칸 최대 길이는 서버·DB 와 같은 숫자다. 서버·DB 는 코드 포인트(글자)로 세고 브라우저 maxLength 는 UTF-16 단위로 센다 —
                // 한글·영문은 한 글자가 한 단위라 그대로 맞고, 이모지처럼 두 단위인 글자는 칸이 더 일찍 막는다(서버보다 엄격할 뿐 넘치지는 않는다).
                maxLength={ITEM_OTHER_MAX}
                placeholder="예: 손편지와 사진"
                aria-invalid={errors.itemOther ? true : undefined}
                aria-describedby={errors.itemOther ? "itemOther-count itemOther-error" : "itemOther-count"}
                {...register("itemOther")}
              />
              {err("itemOther-error", errors.itemOther?.message)}
            </div>
          ) : null}
          <div
            className={f.block}
            role="radiogroup"
            aria-labelledby="metal-q"
            aria-describedby={errors.electronicsOrMetal ? "metal-hint metal-error" : "metal-hint"}
          >
            <p className={f.lb} id="metal-q">
              전자기기나 금속 제품이 들어 있나요?
            </p>
            <div className={f.opts}>
              <label className={f.opt}>
                <input type="radio" value="yes" {...register("electronicsOrMetal")} />네, 있어요
              </label>
              <label className={f.opt}>
                <input type="radio" value="no" disabled={metalForced} {...register("electronicsOrMetal")} />
                아니요, 없어요
              </label>
            </div>
            <p className={f.hint} id="metal-hint">
              {metalForced
                ? "전자기기를 골라서 「있어요」로 정해졌어요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요."
                : "검수할 때 참고해요. 신고한 상자는 검수에 시간이 조금 더 걸릴 수 있어요."}
            </p>
            {err("metal-error", errors.electronicsOrMetal?.message)}
          </div>
          {anniversaryMark ? (
            <div className={f.block}>
              <label className={f.check}>
                <input
                  type="checkbox"
                  checked={markAnniversary}
                  onChange={(e) => setMarkedFor(e.currentTarget.checked ? creatorId : null)}
                  aria-describedby="mark-hint"
                />
                <span>「{anniversaryMark} 선물」로 표시해서 보내기</span>
              </label>
              <p className={f.hint} id="mark-hint">
                {picked?.name}님의 「{anniversaryMark}」까지 7일이 남지 않았어요. 고르면 크리에이터가 승인할 때 이 표시가 보여요.
              </p>
            </div>
          ) : null}
          {/* together INV-F2: 선물 사진(선택) — 「함께한 시간」에서 나만 본다. 파일 칸은 좁은 폭에서 넘치지 않게 숨기고 라벨을 버튼 모양으로(크리에이터 설정 「사진 고르기」 방식) */}
          <div className={f.block} role="group" aria-labelledby="photo-q">
            <p className={f.lb} id="photo-q">
              선물 사진 <span className={f["photo-opt"]}>(선택)</span>
            </p>
            <div className={f["photo-row"]}>
              <input
                className={`sr-only ${f["photo-file"]}`}
                id="gift-photo"
                ref={photoRef}
                type="file"
                accept={PHOTO_ACCEPT}
                aria-describedby={["photo-name", "photo-hint", photoError ? "photo-error" : ""].filter(Boolean).join(" ")}
                onChange={(e) => pickPhoto(e.currentTarget.files?.[0])}
              />
              <label className={`btn btn--line btn--sm ${f["photo-pick"]}`} htmlFor="gift-photo">
                {photo ? "다른 사진 고르기" : "사진 고르기"}
              </label>
              {photo ? (
                <button className="btn btn--line btn--sm" type="button" onClick={clearPhoto}>
                  사진 빼기
                </button>
              ) : null}
            </div>
            <p className={`${f.hint} ${f["photo-name"]}`} id="photo-name">
              {photo ? `고른 사진: ${photo.name}` : "고른 사진이 없어요."}
            </p>
            <p className={f.hint} id="photo-hint">
              상자·송장이 아니라 선물만 찍어 주세요. jpg·png·webp, 10MB 까지. 촬영 위치 같은 사진 정보는 지우고 저장하고, 크리에이터에게도 보이지 않아요 — 「함께한 시간」에서 나만 봐요.
            </p>
            {err("photo-error", photoError ?? undefined)}
          </div>
          {/* together INV-F7: 나만 보는 메모(선물 이름·내용, 둘 다 선택) — 보낸 팬만 본다. 위 「기타」 물품 이름(크리에이터에게 보인다)과 다른 덩어리. 회색 보조 판(시안 v39 .memo) */}
          <section className={f.memo} aria-labelledby="memo-h">
            <div>
              <h3 className={f["memo-h"]} id="memo-h">
                <svg className={f["memo-lock"]} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                나만 보는 메모 <span className={f["photo-opt"]}>(선택)</span>
              </h3>
              <p className={f.hint}>나만 볼 수 있는 메모예요. 나중에 보낸 선물에서 다시 볼 수 있어요.</p>
            </div>
            <div>
              <div className={f["field-head"]}>
                <label className="label" htmlFor="memoTitle">
                  선물 이름
                </label>
                <span className={f["char-count"]} id="memoTitle-count" aria-live="polite" data-over={charCount(memoTitle) > MEMO_TITLE_MAX ? "true" : undefined}>
                  {charCount(memoTitle)} / {MEMO_TITLE_MAX}자
                </span>
              </div>
              <input
                id="memoTitle"
                className="field"
                type="text"
                maxLength={MEMO_TITLE_MAX}
                placeholder="예) 생일 축하 선물"
                aria-invalid={errors.memoTitle ? true : undefined}
                aria-describedby={errors.memoTitle ? "memoTitle-count memoTitle-error" : "memoTitle-count"}
                {...register("memoTitle")}
              />
              {err("memoTitle-error", errors.memoTitle?.message)}
            </div>
            <div>
              <div className={f["field-head"]}>
                <label className="label" htmlFor="memoBody">
                  내용
                </label>
                <span className={f["char-count"]} id="memoBody-count" aria-live="polite" data-over={charCount(memoBody) > MEMO_BODY_MAX ? "true" : undefined}>
                  {charCount(memoBody)} / {MEMO_BODY_MAX}자
                </span>
              </div>
              <textarea
                id="memoBody"
                className="field"
                rows={5}
                maxLength={MEMO_BODY_MAX}
                placeholder="무엇을 담았는지, 어떤 마음으로 보냈는지 적어 두세요."
                aria-invalid={errors.memoBody ? true : undefined}
                aria-describedby={errors.memoBody ? "memoBody-count memoBody-error" : "memoBody-count"}
                {...register("memoBody")}
              />
              {err("memoBody-error", errors.memoBody?.message)}
            </div>
          </section>
        </fieldset>

        {/* 3 상자 — 상자 칸 셋(휴대폰은 한 줄씩) + 회색 안내 하나. 「소형은 …이하예요」 세 줄은 상자 칸에 같은 값이 있어 뺐다(design-rules 25절) */}
        <section className={f.step} hidden={step !== 3} aria-labelledby="h-3">
          <div className={f.qtiles}>
            {PRICED_TIERS.map((tier) => {
              const guide = PARCEL_TIER_GUIDE[tier];
              return (
                <div key={tier} className={`${f.qtile} ${summary.counts[tier] === 0 ? f.zero : ""}`}>
                  <div className={f["qtile-text"]}>
                    <p className={f.qn}>{guide.name} 상자</p>
                    <p className={f.qm}>{guide.rule}</p>
                    <p className={f.qm}>{won(prices[tier].priceKrw)}</p>
                  </div>
                  <div className={f.qty} role="group" aria-label={`${guide.name} 상자 수`}>
                    <button
                      className={f["qty-btn"]}
                      type="button"
                      aria-label={`${guide.name} 상자 하나 줄이기`}
                      aria-disabled={!summary.canRemove[tier]}
                      onClick={() => changeCount(tier, -1)}
                    >
                      −
                    </button>
                    <output aria-live="polite">{summary.counts[tier]}</output>
                    <button
                      className={f["qty-btn"]}
                      type="button"
                      aria-label={`${guide.name} 상자 하나 늘리기`}
                      aria-disabled={!summary.canAdd}
                      onClick={() => changeCount(tier, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {err("box-error", boxError)}
          <div className={`${f.gnote} ${f["gnote-first"]}`}>
            <h3>상자 크기는 이렇게 정해져요</h3>
            <ul>
              <li>크기와 무게 중 큰 쪽으로 정해져요. {OVERSIZE_RULE}는 받지 않아요.</li>
              <li>도착해서 재 보니 신고보다 큰 상자 크기면 차액을 따로 요청드려요. 차액을 내셔야 출고돼요.</li>
              <li>재 보니 더 작아도 차액은 돌려드리지 않아요.</li>
            </ul>
          </div>
        </section>

        {/* 4 확인하고 결제 — 확인 줄 · 회색 안내 하나(돌려보내는 경우 + 승인 시간) · 하늘 결제 칸(시안 v39 gifts-new-b 4단계) */}
        <section className={f.step} hidden={step !== 4} aria-labelledby="h-4">
          <dl className={f.sums}>
            <div className={f["sum-row"]}>
              <dt>받는 크리에이터</dt>
              <dd>{picked ? `${picked.name}님` : "아직 안 골랐어요"}</dd>
              {fix(1, "받는 크리에이터")}
            </div>
            <div className={f["sum-row"]}>
              <dt>선물 종류</dt>
              <dd>{itemText || "아직 안 골랐어요"}</dd>
              {fix(2, "선물 종류")}
            </div>
            <div className={f["sum-row"]}>
              <dt>전자기기·금속 제품</dt>
              <dd>{metalText}</dd>
              {fix(2, "전자기기·금속 제품 신고")}
            </div>
            <div className={f["sum-row"]}>
              <dt>상자</dt>
              <dd>{boxesText}</dd>
              {fix(3, "상자 수")}
            </div>
            {photo ? (
              <div className={f["sum-row"]}>
                <dt>선물 사진</dt>
                <dd className={f["photo-name"]}>{photo.name}</dd>
                {fix(2, "선물 사진")}
              </div>
            ) : null}
            {anniversaryMark && markAnniversary ? (
              <div className={f["sum-row"]}>
                <dt>표시</dt>
                <dd>「{anniversaryMark} 선물」</dd>
                {fix(2, "기념일 표시")}
              </div>
            ) : null}
          </dl>
          {/* 승인을 기다리지 않고 보내는 대신 거절되면 반송비를 뺀다 — 결제 전에 반드시 보이게 조건 없이 둔다(2026-10-02 사용자 결정). 두 카드를 회색 칸 하나로(25절) */}
          <div className={f.gnote} role="note" aria-labelledby="return-notice-title">
            <h3 id="return-notice-title">이럴 때는 돌려보내 드려요</h3>
            <p>{RETURN_ON_REJECT_NOTICE}</p>
            <p>{RETURN_ON_INSPECTION_NOTICE}</p>
            {picked ? (
              <>
                <hr />
                <h3>
                  {picked.approvalMinutes === null
                    ? `${picked.name}님은 아직 승인 기록이 없어요`
                    : `${picked.name}님은 보통 ${formatDuration(picked.approvalMinutes)} 안에 승인해요`}
                </h3>
                <p>
                  크리에이터가 승인하면 팬꾹 주소가 바로 보여요. 기다리지 않고 「먼저 보내기」로 미리 보낼 수도 있어요. {PROMISE.approval}
                </p>
              </>
            ) : null}
          </div>
          {/* 요금은 배송비를 포함한 한 금액(사용자 결정 d7) — 서비스료·배송비 나눔은 기록에만 있다 */}
          <div className={f.paybox} aria-label="결제 금액">
            <div className={f.lines}>
              {summary.lines.map((l) => (
                <div key={l.tier} className={f.ln}>
                  <span>
                    {PARCEL_TIER_GUIDE[l.tier].name} 상자 {l.count}개{" "}
                    <small>
                      {won(l.unitKrw)} × {l.count}
                    </small>
                  </span>
                  <span>{won(l.subtotalKrw)}</span>
                </div>
              ))}
              <div className={f.tot}>
                <span className={f["tot-label"]}>합계</span>
                <b>
                  {summary.totalKrw !== null ? (
                    <>
                      {summary.totalKrw.toLocaleString("ko-KR")}
                      <small>원</small>
                    </>
                  ) : (
                    totalText
                  )}
                </b>
              </div>
            </div>
            <p className={f["tag-line"]}>
              <span className="tag tag--brand">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                검수 포함
              </span>
            </p>
            <p className={f["pay-note"]}>배송비가 포함된 금액이에요. 선물이 사무실에 도착하기 전에 거절되면 전액 돌려드려요.</p>
            {step === 4 ? (
              <div className={f.consent}>
                <PaymentConsent
                  id="pay-consent"
                  checked={consented}
                  invalid={consentMissing}
                  errorId="pay-consent-error"
                  onChange={(v) => {
                    setConsented(v);
                    if (v) setConsentMissing(false);
                  }}
                />
                <div role="alert">
                  {consentMissing ? (
                    <p className={f.error} id="pay-consent-error">
                      {PAYMENT_CONSENT_MISSING}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {alerts}
        {actions}
      </form>
    </div>
  );
}
