import { LegalPage, legalMetadata } from "../legal-page";

export const generateMetadata = (props: PageProps<"/[locale]/terms">) => legalMetadata("terms", props);

export default function Page(props: PageProps<"/[locale]/terms">) {
  return <LegalPage doc="terms" {...props} />;
}
