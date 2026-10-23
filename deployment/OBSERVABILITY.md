# LabCafe Control Center — release / rollback

Local implementation; production activation requires the owner's explicit approval. This runbook does not grant it. No deployment command in this document was executed by preparation.

## Components
- Existing Bot + Web services remain separate. Framework and OAuth login scopes unchanged.
- Owner-only /admin, protected JSON/assets/SSE, 15-minute idle / 60-minute absolute admin privilege. Real gestures renew idle only; ordinary user sessions keep their existing lifetime.
- ECharts 6.1.0 modular local bundle. No external chart CDN or paid API. See /third-party-notices.txt.
- Existing Umami is the web analytics source; SQLite operations store is separate from settings and Umami PostgreSQL. MongoDB is not used for application queries; do not advertise query monitoring.
- Bot exporter and optional observer bind to 127.0.0.1 only. JSON is not Prometheus exposition. Observer executes only fixed systemctl show commands, never arbitrary shell, restart, journal or Docker socket access.
- No bot service controls are exposed in the read-only release. Future restart/log-level/command-sync controls need a separate least-privilege broker, approvals and tests.

## Configuration to prepare securely
Never paste real keys into chat, this document, source control or release archives.

Bot /etc/labcafe/bot.env:
LABCAFE_BOT_CONTROL_PATH=/var/lib/labcafe/control-bot.sqlite
LABCAFE_OBSERVABILITY_TOKEN=<separate random base64url secret, 32–128 characters>
BOT_HEALTH_PORT=3001

Web /etc/labcafe/dashboard.env:
LABCAFE_WEB_CONTROL_PATH=/var/lib/labcafe/control-web.sqlite
LABCAFE_OBSERVABILITY_TOKEN=<same private exporter secret>
BOT_HEALTH_PORT=3001
LABCAFE_OBSERVER_PORT=3002
LABCAFE_OWNER_ID=100000000000000001
LABCAFE_INSTALL_FLOW=false

Observer /etc/labcafe/observer.env (0600): exporter secret and observer port only, no bot/OAuth/Umami credentials. New unit: deployment/labcafe-observer.service. No root identity, sudo/polkit grants, extra public ports or proxy route. Read-only /proc and systemd show may be denied by local hardening; unavailable values must remain null.

Existing ANALYTICS_* configuration and collector/proxy boundaries are preserved. Existing settings/database paths are preserved. LABCAFE_RELEASE_ID may be a reviewed version/manifest identifier, never a secret.

## Metric definitions
- REST physical HTTP attempts through response headers; HTTP errors, network errors, SDK rate-limit notices and actual HTTP 429 are separate. Queue/retry depth not measurable through the chosen hook: null.
- p50/p90/p95/p99 are histogram upper-bound estimates. Never average worker percentiles. Bounds above 60 s have explicit overflow/null.
- Aligned minute/hour windows include the partial current bucket. Empty observed intervals are zero; unobserved/downtime intervals null.
- Host current cards are current samples; historical CPU/RAM graphs preserve sampled bucket peaks. At most 720 representative history buckets span the requested window; they are not raw 15 s samples. Peaks between samples cannot be recovered.
- Gateway cache is the guild count; disconnect is not a guild removal. Initial sync is excluded from joins. Lifetime command counters are labeled since process start; daily counts use persisted UTC event totals.
- Site visitors are estimates. Provider sessions are not called unique people. Current vs previous totals use equal elapsed durations. Missing comparison data is null.
- Installation click is not installation. Optional advanced OAuth flow requires canonical token-response guild data, user manage permission, pre-install nonmembership, fresh bot membership confirmation and deduplication within retained history. Callback guild_id is only a hint. Flag is OFF until the Discord Portal code-grant behavior is explicitly checked; existing direct invite flow continues. No token or IP is persisted for attribution. Verified installation counts live in the operations report; no fabricated cross-device/visitor attribution.

## Retention / quotas
Details/errors 30 days; audit 90 days; daily counts 366 days. Details and snapshots each capped at 50,000 rows, memory event queue at 1,000. Database main file capped at roughly 256 MiB; WAL checkpoint/size settings reduce ordinary growth but are not a hard combined disk quota. Quotas can shorten available history. Exporter responses capped at 256 KB; event/API pages bounded. Store writes asynchronous in bounded batches, snapshots approximately minute granularity. Restart metric state compressed and bounded; source UUIDs deduplicate exported bot events across restarts.

## Backup / restore tools
Build first. Use absolute paths and new targets; tool refuses overwrite and validates SQLite integrity. Both modes use the Node SQLite online backup API from a read-only source and preserve WAL-visible committed records. Restore targets a NEW path; stop the target application before switching its configured path.

node scripts/control-store.mjs backup /var/lib/labcafe/control-web.sqlite /root/labcafe-backups/<release>/control-web.sqlite
node scripts/control-store.mjs restore /root/labcafe-backups/<release>/control-web.sqlite /var/lib/labcafe/control-web-restored.sqlite

Stop only the corresponding service before switching configured paths. Do not restore over live settings or delete newer production records. Keep the old database and choose the restored path explicitly. Test restored counts and owner access before declaring recovery.

## Reviewed activation sequence — production approval required
1. Re-inventory /opt/labcafe, units/env file locations, current Node, Nginx config and disk budget; verify Pageant/SSH identity without printing secrets. Current archive has a SHA256SUMS and per-file RELEASE-MANIFEST.json. It is a local source snapshot, not a Git commit.
2. Stage the archive in a new /opt/labcafe-release-<id> directory, verify hashes, run npm ci, check/build/tests with no production .env and no live Discord load. Check the runtime Node against package engines. Never run npm start as a build check.
3. Save current source and unit/Nginx configs; copy env securely with restrictive permissions. Back up settings, conversions and existing operations databases using SQLite backup API/VACUUM INTO, not plain copy of a live WAL database. Record exact old paths and checksums.
4. Prepare new configuration and observer unit; run systemd-analyze verify. Stage safe Nginx queryless logging using nginx-queryless.conf.example. Audit ALL inherited access_log directives and auth-location error logs. Run nginx -t before reload. Do not delete historic logs; retention/access review is separate.
5. Only after approval: stop Bot/Web briefly, activate reviewed source preserving settings/env, apply additive exporter configuration, daemon-reload, start observer and Bot/Web; Nginx reload only after a successful config check. Retain old source/database copies. Umami/PostgreSQL/MongoDB are not restarted or migrated.
6. Verify systemctl is-active and healthz; public site/root/deep-link refresh; OAuth real owner login; nonowner denied; /admin SSE freshness; exporter private port/token failures; real guild command; settings save; Umami continuity. Never print raw Nginx OAuth logs. Observe memory/CPU/DB/WAL and reconnect for 30 min before final acceptance.
7. If a mandatory check fails: stop new Bot/Web/observer, restore previous source/unit/env and old Nginx configuration; nginx -t and daemon-reload; restart the original Bot/Web. Schema changes are separate operations DB additions, existing settings untouched. Keep new operations DB for review rather than delete/overwrite. Recheck health/OAuth/commands/Umami.

## Source provenance
Current local folder has no Git history. Do not invent a commit or push an existing empty repository silently. Review archive + manifest first; eventual Bot/Web split and first source push need an explicit repository decision. User data, .env, key files, DBs and node_modules are excluded by the export allowlist.

## Required remaining environment acceptance
Windows local tests and fixture screenshots do not prove Linux unit permissions, Nginx behavior, real Discord OAuth/grants or production memory. Those checks occur only after approved deployment. Replay/heatmap, external uptime, arbitrary terminal, privileged bot operations, proxy and unused MongoDB query profiling remain disabled by design.
