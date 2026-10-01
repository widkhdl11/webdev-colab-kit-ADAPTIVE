import { LandingPage } from "@/widgets/landing/ui/landing-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export default function Page() {
  return (
    <>
      <SiteHeader role="guest" current="/" />
      <LandingPage />
      <SiteFooter />
    </>
  );
}
