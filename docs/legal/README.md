# Legal and static pages

Drafts for `/terms`, `/privacy`, `/rules` and `/faq`, in English and Spanish. They must be reviewed by a lawyer before launch.

Placeholders to replace or inject at render time:

| Placeholder | Source |
|---|---|
| `{{BRAND}}` | Brand config constant |
| `{{DOMAIN}}` | Production domain |
| `{{CONTACT_EMAIL}}` | Contact address for legal and privacy requests |
| `{{CITY}}` | City in Ecuador for jurisdiction |
| `{{PAYMENT_PROVIDER}}` | Merchant of record name |
| `{{EFFECTIVE_DATE}}` | Date the version takes effect |
| `{floor}`, `{step}`, `{decay}`, `{lock_minutes}`, `{grace_minutes}`, `{max_message}` | `app_config`, formatted per locale |

Product requirements these texts depend on:

1. Checkout must show, before payment, a required acknowledgment that the crown is delivered immediately and that the buyer loses any right of withdrawal once it is delivered, plus a link to the terms.
2. Account deletion must exist in edit profile: the profile is anonymized ("Former king" with a generic avatar), its reigns stay in the public record without name, message, link or avatar, and private data is deleted, except payment records kept for tax law.
3. Price-drop and season-start alerts are opt-in. Dethroned alerts are on by default and can be turned off.
4. Cookies are limited to strictly necessary ones (session, language, time zone, bot protection). Visit statistics use Vercel Web Analytics, which sets no cookies and is disclosed in the privacy policy (sections 2, 4, 6 and 10); any other analytics, and any advertising, needs these texts updated first.
