import type { CookieMethodsServer } from "@supabase/ssr";
import sharp from "sharp";
import { createSessionClient } from "@/shared/api/supabase/session-cookies";
import { insertOrder } from "./creator-link-helpers";
import { adminClient, psql } from "./helpers";

// 함께한 시간(together) 시험 도구 — DB 시험(together-db)과 화면·라우트 시험(together-routes)이 같이 쓴다.
// 주문은 psql 로 바로 넣는다(물품 이름 「시험 선물」 — deleteTestOrders 가 주문을 지우면 사진 줄도 같이 지워진다).
// 저장소의 사진 파일은 주문과 묶이지 않으므로 clearGiftPhotos 가 계정 폴더째 지운다.

export const GIFT_PHOTO_BUCKET = "gift-photos";

/** 한국 시간 오늘에서 days 일 전 그 시각(HH:MI)의 timestamptz 식. */
export function kstDaysAgoAt(days: number, time: string): string {
  return `((public.receiving_today() - ${days})::timestamp + time '${time}') at time zone 'Asia/Seoul'`;
}

/** 한국 시간 오늘에서 days 일 전 날짜(YYYY-MM-DD). */
export function kstDateDaysAgo(days: number): string {
  return psql(`select (public.receiving_today() - ${days})::text`);
}

/** 결제가 끝난(등록 시각이 있는) 주문 하나. status 기본은 결제 직후(registered). */
export function paidOrder(fanId: string, creatorId: string, registeredAt: string, status = "registered"): string {
  return insertOrder(fanId, creatorId, status, registeredAt);
}

export function orderIdOf(orderNo: string): string {
  return psql(`select id from public.orders where order_no = '${orderNo}'`);
}

/** 그 계정 폴더의 사진 파일 이름들(주문 폴더 아래까지). */
export async function photoFiles(fanId: string): Promise<string[]> {
  const admin = adminClient();
  const top = await admin.storage.from(GIFT_PHOTO_BUCKET).list(fanId);
  const out: string[] = [];
  for (const folder of top.data ?? []) {
    const inner = await admin.storage.from(GIFT_PHOTO_BUCKET).list(`${fanId}/${folder.name}`);
    for (const f of inner.data ?? []) out.push(`${fanId}/${folder.name}/${f.name}`);
  }
  return out;
}

export async function clearGiftPhotos(fanIds: readonly string[]): Promise<void> {
  const admin = adminClient();
  for (const id of fanIds) {
    const names = await photoFiles(id);
    if (names.length > 0) await admin.storage.from(GIFT_PHOTO_BUCKET).remove(names);
  }
}

/**
 * 촬영 위치(GPS)와 기기 정보가 든 JPEG — 긴 변 2400. 사진 정보가 실제로 들어 있는지는 만든 뒤 metadata 로 확인한다.
 */
export async function jpegWithGps(width = 2400, height = 1800): Promise<Buffer> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 240, g: 180, b: 170 } } })
    .jpeg({ quality: 80 })
    .withExif({
      IFD0: { Make: "FankkukTestCam", Model: "GPS-1", Copyright: "fankkuk-test" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 1234/100", GPSLongitudeRef: "E", GPSLongitude: "126/1 55/1 4321/100" },
    })
    .toBuffer();
  const meta = await sharp(buf).metadata();
  if (!meta.exif || !meta.exif.includes(Buffer.from("FankkukTestCam"))) throw new Error("시험 사진에 사진 정보가 들어가지 않았다");
  return buf;
}

// ── 개발 서버에 보낼 로그인 쿠키 ──────────────────

type Jar = Map<string, string>;

function memoryCookies(jar: Jar): CookieMethodsServer {
  return {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        if (value === "" || options?.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
}

/** 그 이메일·비밀번호로 로그인한 세션 쿠키 — 브라우저가 개발 서버에 보내는 Cookie 머리줄 꼴. */
export async function sessionCookie(email: string, password: string): Promise<string> {
  const jar: Jar = new Map();
  const config = { url: process.env.FK_TEST_API_URL ?? "", anonKey: process.env.FK_TEST_ANON_KEY ?? "" };
  const client = createSessionClient(config, memoryCookies(jar), { NODE_ENV: "development" });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`로그인 실패: ${email}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}
