import { notFound } from "next/navigation";

/** Unknown paths under a language get that language's not-found page instead of Next's default. */
export default function UnknownPage() {
  notFound();
}
