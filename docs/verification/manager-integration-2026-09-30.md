# Manager integration verification — 2026-09-30

Verified locally against the actual Manager app, production Next builds and an isolated MongoDB instance. Test projects, scoped server/client/analytics keys, owner credentials and Finance user/session data were disposable. Existing deployment databases and credentials were not used for verification.

## Results

| Application | Full test runner | Static checks | Production build | Live integration checker |
|---|---:|---|---|---:|
| Public portfolio | `npm test`: 61 passed | ESLint + TypeScript passed | Passed | 10 passed, zero skipped |
| Portfolio admin | `npm test`: 106 passed | ESLint + TypeScript passed | Passed | 11 passed, zero skipped |
| Finance | `npm test`: 435 passed | ESLint passed | Passed | 21 passed, zero skipped |

The shared HTTP/database harness passed 19 additional assertions: Manager owner authentication, anonymous/forged portfolio-session denial, removed OTP endpoints, real Finance OTP verification/session creation, authenticated and anonymous Finance reads, public reads, unsupported public writes, persisted server completions and absence of credential values in logs.

Native Chrome checks covered owner sign-in failure/success, project create/edit/delete through real server actions, public reads reflecting those writes, testimonial creation/deletion, a public contact submission visible in admin Messages, and logout. Finance's authenticated dashboard rendered its balance/cards and fetched protected data successfully. Screenshots were inspected; browser error collections were empty. Form submissions and persisted data used disposable fixtures. Contact email delivery was disabled; Finance OTP delivery was bypassed by seeding a hashed test OTP and exercising the actual verifier.

23 stored browser/action assertions passed. Database evidence includes real browser console records and pageviews for all three projects; password redaction for all three, email redaction for portfolio apps, account-number redaction for Finance; browser markers and server request completions share the same trace. All five portfolio content actions have persisted completion records. At the owner’s request, public testimonials were subsequently unpublished: direct page visits return 404 and desktop/mobile navigation contains no testimonials link; storage/admin editing remain available. These checks initially caught the portfolio's outdated SDK missing headers on no-options fetch; both copies were refreshed from Manager and the browser checks repeated successfully.

Both portfolio delivery scripts sent 200 entries in 10 ingest requests (20 entries/request), with 200 accepted, 200 independently confirmed in MongoDB, zero failed requests and zero SDK drops. Invalid-key runs exited nonzero and reported zero accepted. Enqueue duration includes deliberate pacing (~0.94 seconds); it is not a per-call latency benchmark.

## Reproduction

1. Run each repository's single `npm test` entry point, lint and production build (portfolio apps also provide `npm run typecheck`).
2. Use isolated MongoDB databases for Manager, shared portfolio content and Finance. Create one Manager project per app and distinct `mlk_`, `mck_` and `mak_` keys. Set public browser configuration before building.
3. Start each production app plus a second instance whose server Manager endpoint is unreachable. Run `npm run manager:check` with its scoped keys, `APP_ORIGIN`, `APP_ORIGIN_DEGRADED` and an authorized `MANAGER_READ_COOKIE`. Finance also needs `APP_COOKIE` for its authenticated check. No evidence checks were skipped in this run.
4. Run `node scripts/measure-log-delivery.mjs 200` in each portfolio repository and independently query its project's logs for the 200 `burst_probe_` entries.
5. Use Chrome to exercise the content/auth flows, emit synthetic browser markers/redaction probes, fetch a same-origin API and inspect corresponding Manager logs/events. The bundled SDKs must match `/api/sdk/logger` (TypeScript portfolios) or `?format=js` (Finance).

## Limits and cleanup

This verifies local integration and application behavior; production deployment, external email delivery, distributed login limiting and native iOS were not exercised. Owner login is intentionally a reduced single-owner model: server env bootstrap, centralized named permission, hashed opaque MongoDB sessions and invalidation after credential rotation. It does not expose role/plan/user permission CRUD. The ten-attempt login limiter is per process; a shared backend remains necessary for multiple instances.

Test servers, browser session and disposable databases were stopped, and temporary test credentials/fixtures removed after verification. Generated owner credentials and all disposable test environments were removed; the owner will supply configuration. No secrets are committed. Production builds were repeated with each repository's normal local configuration after stopping the test apps. Changes are local; no deployment or remote push was performed.
