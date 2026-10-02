import { LegalPage, legalMetadata } from "../legal-page";

export const generateMetadata = (props: PageProps<"/[locale]/rules">) => legalMetadata("rules", props);

export default function Page(props: PageProps<"/[locale]/rules">) {
  return <LegalPage doc="rules" {...props} />;
}
