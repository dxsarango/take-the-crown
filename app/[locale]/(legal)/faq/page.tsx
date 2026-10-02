import { LegalPage, legalMetadata } from "../legal-page";

export const generateMetadata = (props: PageProps<"/[locale]/faq">) => legalMetadata("faq", props);

export default function Page(props: PageProps<"/[locale]/faq">) {
  return <LegalPage doc="faq" {...props} />;
}
