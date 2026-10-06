# API reference

The backend is a JSON API. The authoritative, always-current reference is generated from the code:

- **Swagger UI:** `/api/docs/swagger/` on the running backend
- **ReDoc:** `/api/docs/redoc/`
- **OpenAPI schema:** `/api/schema/`
- A readable list of every endpoint, generated from the same schema: [api-endpoints.md](api-endpoints.md)

## Conventions

| Topic | Rule |
|---|---|
| Base URL | the backend address, for example `http://localhost:8000` |
| Authentication | `POST /auth/jwt/create/` with `{"username": "<email>", "password": "..."}` returns `access` and `refresh` tokens (the login field named `username` holds the email). Send `Authorization: Bearer <access>`. Refresh with `POST /auth/jwt/refresh/`. The access token lasts one day. |
| Registration | `POST /auth/users/` (students register themselves) |
| Lists | paginated: `{"count", "next", "previous", "results"}`, 20 rows a page, `?page=2` |
| Errors | `400` with a field-by-field message for bad input, `401` not signed in, `403` signed in but not allowed, `404` not found (also used to hide scheduled-job URLs from strangers), `503` an outside service (such as Chapa) is unavailable |
| Dates | ISO 8601, UTC |
| Rate limits | anonymous 30 requests a minute, signed-in 42 (configurable) |

## Areas

| Prefix | Purpose | Who |
|---|---|---|
| `/auth/` | sign-in, registration, password reset | everyone |
| `/api/public/overview/` | numbers for the landing page | everyone |
| `/api/student/` | profiles, departments | students, admins |
| `/api/service/` | service groups, applicants, events, attendance, families | by role |
| `/api/course/` | curriculums, semester courses, enrolments, class days, attendance, reports | students (own data), coordinators (their courses), Super Admin |
| `/api/resources/` | materials | by scope: general, service group, course |
| `/api/qa/` | public and private questions, answers, moderation, counselor queue, "my work" | by role |
| `/api/donations/` | start a donation, verify, history, webhook, scheduled re-check | visitors and students; webhook and cron are secret-protected |
| `/api/notifications/` | the signed-in user's notifications, device tokens, scheduled triggers | signed-in; triggers need `X-Cron-Token` |
| `/api/analytics/` | Excel exports | Super Admin (some for coordinators, managers, service admins on their own data) |
| `/api/admin-console/` | the Super Admin console | **Super Admin only** |

## Examples

Sign in and call an authenticated endpoint:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/jwt/create/ \
  -H "Content-Type: application/json" \
  -d '{"username":"you@example.org","password":"<your password>"}' | python -c "import sys,json; print(json.load(sys.stdin)['access'])")

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/course/semester-courses/?enrolled=1
```

Start a donation as a visitor (amount only is required; name and email are optional):

```bash
curl -X POST http://localhost:8000/api/donations/initiate/ \
  -H "Content-Type: application/json" \
  -d '{"amount": "50", "name": "Abel", "email": "abel@example.org"}'
# -> {"checkout_url": "https://checkout.chapa.co/...", "tx_ref": "tx-..."}
```

Useful query parameters worth knowing:

- `GET /api/course/semester-courses/?enrolled=1`: only the courses the person **studies** (never ones they merely coordinate).
- `GET /api/course/attendance/?mine=1`: only the person's own attendance records.
- `GET /api/admin-console/donations/?status=&fund=&kind=&search=&date_from=&date_to=&page=`: the donations list with totals.
- `GET /api/analytics/export/donations/` (same filters): the donations Excel file.
