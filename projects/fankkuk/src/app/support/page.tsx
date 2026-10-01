import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SupportPage } from "@/widgets/support/ui/support-page";

export default function Page() {
  return (
    <>
      <SiteHeader role="guest" current="/support" />
      <SupportPage />
      <SiteFooter />
    </>
  );
}
