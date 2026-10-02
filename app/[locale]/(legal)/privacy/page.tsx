import { LegalPage, legalMetadata } from "../legal-page";

export const generateMetadata = (props: PageProps<"/[locale]/privacy">) => legalMetadata("privacy", props);

export default function Page(props: PageProps<"/[locale]/privacy">) {
  return <LegalPage doc="privacy" {...props} />;
}
