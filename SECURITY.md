# Security policy

LabCafe is early-stage software without a declared stable supported release. Security fixes currently target the latest reviewed source; there is no guaranteed response SLA.

Report vulnerabilities privately using [GitHub Report a vulnerability](https://github.com/k4hvecii/LabCafe-Bot/security/advisories/new). Private vulnerability reporting is enabled for this public repository. A GitHub account is required to submit a report. Do not put tokens, personal data, production logs or exploit details in public issues. Maintainers must watch All Activity or Security alerts and enable repository notifications to receive private-report alerts. Email delivery also depends on their account notification settings.

Use only your own isolated test environment. Include affected revision, impact, safe reproduction steps, and proposed mitigation. Never test production Discord servers without permission. If a credential is exposed, revoke/rotate it at the provider; deleting a file or adding gitignore is insufficient.

Keep secrets in local environment files, use least privilege, keep exporters on loopback, set the owner Discord user ID explicitly, protect backups and SQLite files, and configure HTTPS and trusted proxy headers carefully. Administrator permission is not required for basic operation. Deployment examples are templates, not production secrets or a universal hardening guarantee.

