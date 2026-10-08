# Testing

## Backend

```bash
cd backend
uv sync --all-groups        # installs pytest, pytest-django, model-bakery, coverage
uv run pytest               # the whole suite (458 tests, about a minute)
uv run pytest course        # one app
uv run pytest -k donation   # tests whose name matches
```

- The settings for tests are `config/settings_test.py` (selected in `pytest.ini`): an in-memory database, no migrations replay (`--nomigrations`), local email. Tests need no external service and never touch your real database.
- Each app keeps its tests next to the code (`tests.py`, `test_*.py`, or a `tests/` folder). Examples: `course/test_coordinator_scope.py` (a coordinator manages only their courses), `questionanswer/tests/test_private_visibility.py` (who sees which private question), `donation/test_donations_admin.py` (payments, the re-check job, the donations list).
- A coverage report is written to `backend/htmlcov/` after every run (it is git-ignored).
- External services are replaced with fakes in tests (for example Chapa is monkey-patched), so no money or message is ever sent.

### Writing a test

Use `pytest.mark.django_db`, create people with a small helper that adds a role, and call the API with `rest_framework.test.APIClient` and `force_authenticate`. Test **permissions** (who is refused) as carefully as the happy path. When a rule changes, change the test that describes it.

## Frontend

```bash
cd frontend
npx tsc -b          # type check
npm run build       # type check and production build
```

There is no automated browser test suite yet. Manual check lists are the main safety net for screens: sign in as each role and walk through the pages in the [admin guide](admin-guide.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`: the backend tests, and the frontend type check and build.

## Manual test data

For manual testing, `create_students`, `seed_people` and `reset_dev_data` (see [local-setup.md](local-setup.md)) create sample people in a **development** database. They use sample passwords; never run them on production.
