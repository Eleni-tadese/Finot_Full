# Payments with Chapa

Donations are paid through [Chapa](https://chapa.co). There are two kinds of donation, and **no categories to choose**:

| Who | What is stored | Account |
|---|---|---|
| Signed-in student | **Weekly Donation** under their name; appears in their history | their own |
| Visitor (no account) | **Support** donation with an optional name and an optional email | none |

Older records may carry other fund names (Building Fund, Charity, ...); they are kept as they were.

## Flow

```
Donor presses Donate ──▶ backend creates a PENDING payment and asks Chapa for a checkout link
        │
        ▼
Donor pays on Chapa's page
        │
        ├──▶ Chapa sends the donor back to  <FRONTEND_URL>/donation/success?tx_ref=...
        │         that page asks the backend to verify with Chapa  ──▶ COMPLETED / FAILED
        │
        └──▶ Chapa also calls our webhook  <PUBLIC_DOMAIN>/api/donations/webhook/  (signed)
```

The webhook address is **configured in the Chapa dashboard** (Settings → Webhook), not in our code: enter `<PUBLIC_DOMAIN>/api/donations/webhook/` there, and set the same secret as `CHAPA_WEBHOOK_SECRET` (or leave that empty to use `CHAPA_SECRET_KEY`). The backend verifies the `x-chapa-signature` header before trusting a webhook.

Everything is idempotent: verifying twice does not count twice. The receipt email (if an email was given) is sent only on the first transition to completed.

## Test mode and live mode

The mode is decided only by the key in `CHAPA_SECRET_KEY` (a test key creates test payments). Never mix keys between modes. In test mode no money moves; use the test phone numbers listed in the [Chapa docs](https://developer.chapa.co/test/testing-mobile). Any other number fails, which is useful for testing the failure path.

## On localhost

Chapa only accepts `https://` return and callback addresses, so on `http://localhost` the donor is **not** sent back and the webhook cannot reach you. The payment stays **Pending** until something asks Chapa. Ways to settle it:

- the student's **Check payment** link in Donations → History
- the Super Admin's **Check pending payments** button on the Donations page
- `uv run python manage.py verify_pending_donations`
- or open `…/donation/success?tx_ref=<reference>` in the browser

In production none of this is needed for normal donors.

## The safety net

`donation/settle.py` re-checks payments whose donor never came back:

- PENDING or FAILED in the last 3 days and Chapa says **paid** → COMPLETED
- PENDING for more than 24 hours and Chapa says **not paid** → FAILED
- Chapa unreachable, or the payment is younger than 10 minutes → left alone

A Chapa outage can never mark a real payment as failed. The check runs hourly through the `verify-donations` GitHub workflow and on demand (above).

## Fees

Chapa adds its processing fee on top of the donation (for example 50.00 ETB plus 1.44 ETB). The system records the donation amount (50.00). Who pays the fee is a setting in the Chapa dashboard: the owner should decide before going live.

## Reporting

**Admin → Donations**: every donation (students and visitors), totals of confirmed payments, pending and failed counts, a per-fund summary, filters (status, student or guest, fund, dates, search) and an Excel export (a Donations sheet and a Summary sheet) that follows the filters.
