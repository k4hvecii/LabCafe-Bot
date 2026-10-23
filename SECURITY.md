# Security policy

LabCafe is early-stage software without a declared stable supported release. Security fixes currently target the latest reviewed source; there is no guaranteed response SLA.

Do not report vulnerabilities with tokens, personal data, production logs, or exploit details in public issues. Use GitHub private vulnerability reporting once the maintainer enables it. Until a verified private reporting channel is published, do not send sensitive material through an unverified address or public issue. A verified private channel is a release prerequisite. GitHub private vulnerability reporting is documented for public repositories; do not assume it is active while this repository is private. After an approved visibility change, enable and verify the reporting entry point before announcing the release.

Use only your own isolated test environment. Include affected revision, impact, safe reproduction steps, and proposed mitigation. Never test production Discord servers without permission. If a credential is exposed, revoke/rotate it at the provider; deleting a file or adding gitignore is insufficient.

Keep secrets in local environment files, use least privilege, keep exporters on loopback, set the owner Discord user ID explicitly, protect backups and SQLite files, and configure HTTPS and trusted proxy headers carefully. Administrator permission is not required for basic operation. Deployment examples are templates, not production secrets or a universal hardening guarantee.
