import { describe, expect, it } from "vitest";
import { CHANNEL_URL_CASES } from "@/entities/creator/model/channel-url-cases";
import { parseChannelUrl } from "@/entities/creator/model/channel-url";
import { psql } from "./helpers";

// INV-V2: 앱 서버의 채널 주소 검사(parseChannelUrl)와 DB 의 검사(cv_parse_channel_url)가 같은 답을 내는가.
// 같은 주소 목록을 양쪽에 넣어 하나라도 다르면 실패한다 — 한쪽 규칙만 고치면 여기서 걸린다.

/** DB 의 판정: 'platform|key' · 'FKV02'(받지 않는 플랫폼) · '22023'(꼴이 틀림) */
function dbVerdicts(urls: readonly string[]): string[] {
  const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const array = `array[${urls.map(literal).join(", ")}]::text[]`;
  const out = psql(`
    create temp table cv_parity_out (i integer, v text);
    do $$
    declare
      u text[] := ${array};
      r record;
    begin
      for i in 1 .. coalesce(array_length(u, 1), 0) loop
        begin
          select * into r from public.cv_parse_channel_url(u[i]);
          insert into cv_parity_out values (i, r.platform || '|' || r.channel_key || '|' || r.channel_url);
        exception when others then
          insert into cv_parity_out values (i, sqlstate);
        end;
      end loop;
    end $$;
    select v from cv_parity_out order by i;
  `);
  return out.split("\n").filter((line) => line !== "" && !line.startsWith("CREATE") && !line.startsWith("DO"));
}

describe("채널 주소 규칙 — 앱 서버와 DB 가 같다 (INV-V2)", () => {
  it("INV-V2: 시험 주소 전부에서 앱 서버와 DB 의 판정이 같다", () => {
    const urls = CHANNEL_URL_CASES.map((c) => c.url);
    const db = dbVerdicts(urls);
    expect(db).toHaveLength(urls.length);
    const app = urls.map((u) => {
      const r = parseChannelUrl(u);
      if (r.ok) return `${r.channel.platform}|${r.channel.channelKey}|${r.channel.channelUrl}`;
      return r.reason === "unsupported" ? "FKV02" : "22023";
    });
    expect(app).toEqual(db);
  });

  it("INV-V2 (대조가 도는지): 일부러 다른 답을 넣으면 같지 않다", () => {
    const db = dbVerdicts(["https://www.youtube.com/@gguldanji", "https://rplay.live/play/abc"]);
    expect(db).toEqual(["youtube|gguldanji|https://www.youtube.com/@gguldanji", "FKV02"]);
    expect(db).not.toEqual(["youtube|GgulDanji|https://www.youtube.com/@GgulDanji", "FKV02"]);
  });
});
