# Private website analytics

## Full native reporting interface (2026-10-21)

The professional interface uses the official Umami v3.4.0 source, rebuilt with BASE_PATH=/admin/analytics and SKIP_BUILD_GEO=1. Geo aggregation is served by the original pinned provider on 3010; the second container supplies the native frontend on loopback 3011. Start with compose.yml plus compose.native.yml; NATIVE_IMAGE in the private deployment .env pins the locally built image ID. The source archive checksum and build log stay under /opt/labcafe-analytics.

Dashboard environment adds ANALYTICS_NATIVE_URL=http://127.0.0.1:3011 and ANALYTICS_NATIVE_BOARD_ID for the configured private board. Every HTML, asset, navigation and API request under /admin/analytics is checked against the existing Discord owner session. The native UI receives only a non-secret placeholder auth marker; provider credentials/tokens remain server-side. Requests are proxied with a narrow header set, fixed loopback upstreams, no redirects to other origins, no upstream cookies and bounded request sizes. Native HTML uses nonce-based script CSP; the existing public site's CSP stays unchanged.

Read APIs are scoped to the configured website and owned boards. Same-origin mutations are limited to personal boards, dashboard layout, saved goals/funnels/segments/cohorts and annotations. Credential management, API keys, sharing links, destructive website operations and replay collection endpoints are blocked. No public share link or alternate publicly exposed Umami port is used.

The saved Traffic Center and Live Traffic boards combine native maps, weekly traffic, sources/pages, devices/countries, events, click goal and page-to-click funnel. The default dashboard is also initialized. These are view definitions, not seeded traffic. Daily confirmed OAuth/Gateway totals remain on LabCafe Management because they are not linked to anonymous browser sessions. Campaigns, replay and Web Vitals remain uncollected. Unsupported collection/credential/theme navigation is hidden; backend permissions enforce the boundary independently.

Reports enforce hostname=eq.labcafe.xyz and match=all. One loopback QA pageview from logout testing is retained under hostname 127.0.0.1 and excluded from production reports; the staging collector was then disabled. Keep production and test traffic separated without rewriting historical records. configure-panels.mjs creates absent private definitions and preserves existing user layouts.

Final native validation: Windows/Linux 104 tests passed, including bootstrap script syntax, mandatory host scope, anonymous asset/API denial, logout and contained provider failure. Native date/country filtering, layout save, live board, English/Turkish and 390px no-overflow rendering were exercised. Live Nginx checks confirmed private assets/API 401, canonical entry slash redirect plus OAuth redirect, native 256k request allowance and unchanged core 8k limit. The bot process was unchanged during the dashboard release.

Rollback: remove or unset ANALYTICS_NATIVE_URL/ANALYTICS_NATIVE_BOARD_ID, restore the previous dashboard source/assets from its release backup and restart only labcafe-dashboard. The original provider and its traffic data remain intact. Stop the native container without removing volumes if needed. The private boards can remain saved.

Deployed 2026-10-21: Umami 3.4.0 and PostgreSQL 16, pinned by image digest in compose.yml. No paid API. This stack is independent of the bot and dashboard processes.

## Runtime

- Private deployment: /opt/labcafe-analytics, root-only directory and .env.
- Umami binds 127.0.0.1:3010 only; PostgreSQL has no host port.
- Dashboard environment: ANALYTICS_URL, ANALYTICS_WEBSITE_ID, ANALYTICS_USERNAME, ANALYTICS_PASSWORD, ANALYTICS_STARTED_AT. The account is a normal user owning only the LabCafe website; administrative credentials stay root-only.
- Both core services use LABCAFE_ANALYTICS_EVENTS_PATH=/var/lib/labcafe/analytics-events.sqlite for daily login/join aggregates. No Discord IDs in this database.
- GET /api/admin/analytics checks the existing authenticated Discord owner ID on every request. The public collector accepts only an allowlisted schema, strips referrer paths and URL parameters, and excludes owner sessions, bots, DNT and GPC.
- Browser counts are estimates. bot_add_click is an intent event; bot_joined is a separate Gateway event. Existing guilds at startup are not counted as new joins. Login success counts successful OAuth completions, not unique accounts.
- No retrospective traffic; collection starts on deployment. No replay, heatmap, public share link or third-party tracker.

## Operations

The daily labcafe-analytics-maintenance.timer runs around 04:15 Europe/Istanbul. maintenance.sh creates a PostgreSQL dump and SQLite online backup before pruning data older than 90 days. Backup files are kept for seven days under /root/labcafe/yedekler/analytics with root-only permissions. These backups are on the same VPS; they do not protect against total VPS loss.

Use `docker compose ps` from /opt/labcafe-analytics and the two core /healthz endpoints for health checks. Never print .env, credential files or authentication responses into reports. Analytics failure must only affect the analytics widget; optional conversion storage failure is caught at startup and event boundaries.

Before upgrading Umami, take a PostgreSQL dump and verify schema changes against the explicit retention SQL. Test restoration in a separate database first; never restore a drill into production. Digests should be deliberately updated after reviewing a release.

## Release rollback

The pre-release application archive and SQLite settings backup are under /root/labcafe/yedekler/analytics-release-20261021. Restore the application archive to /opt/labcafe, reset ownership to labcafe, then restart the dashboard and bot and verify both health endpoints. Existing settings should not be rolled back unless the failure concerns settings data. The old app ignores analytics environment variables; analytics containers and their data can stay isolated during rollback. Stop the analytics stack without deleting volumes if isolation is needed.

Validation: 102 tests passed on Windows and Linux, isolated end-to-end collector/provider/report check, actual Umami outage drill with healthy core services, PostgreSQL dump restore drill, mobile/TR/EN UI checks using clearly labelled sample data, and production anonymous 401 / private provider report checks. Real owner OAuth interaction was not automated.
