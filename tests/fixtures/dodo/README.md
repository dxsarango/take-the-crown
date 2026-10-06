Dodo Payments webhook bodies for `tests/unit/dodo.test.ts`, shaped like the Payment and Refund
objects in Dodo's API reference. Replace them with bodies recorded from Dodo test mode: run the dev
server with `DODO_RECORD_WEBHOOKS=1`, complete a test checkout (and a refund), and copy the files
from `tests/fixtures/dodo/recorded/` here (each file keeps the signature headers and the raw body;
copy the `body`). Recorded bodies are signed with your test webhook secret,
which the tests do not know, so the tests re-sign them.

`refund-insufficient-funds.json` is the body Dodo's test API answered (409) to a refund request while
the test wallet had no funds.

`payment-succeeded-recorded.json` is a real `payment.succeeded` body from Dodo's test mode (the
`pnpm e2e:dodo` takeover, business ids replaced). Refund and dispute bodies are still doc-shaped:
Dodo's test wallet could not refund yet, and no dispute has been opened in test mode from the
checkout.
