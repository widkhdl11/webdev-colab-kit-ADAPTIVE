import { SAMPLE_BLOCKED_FANS, SAMPLE_CREATOR_SETTINGS } from "@/entities/creator/api/sample-creator-settings";
import { CreatorSettingsPage } from "@/widgets/creator-settings/ui/creator-settings-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleCreatorHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 주소는 값이 아니라 등록 여부만 넘긴다.
export default function Page() {
  return (
    <>
      <SiteHeader {...sampleCreatorHeader("/creator/settings")} />
      <CreatorSettingsPage settings={SAMPLE_CREATOR_SETTINGS} blockedFans={SAMPLE_BLOCKED_FANS} />
      <SiteFooter />
    </>
  );
}
