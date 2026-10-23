# LabCafe

Discord server management bot and web dashboard, built with TypeScript, discord.js and Node.js. LabCafe is developed with assistance from ChatGPT and OpenAI Codex. Its primary maintainer directs product decisions, sets requirements and manages releases. Early-stage open-source development. Project-owned code is licensed under MIT. This clean source repository is public.

## Implemented

- Slash commands: help (categories/search), information, ping, setup and per-server settings.
- Persistent SQLite settings, command access rules, and settings activity history.
- Discord OAuth2 login, manageable server selection, and dashboard settings approval.
- Rule-based, read-only channel/role/permission checks; not comprehensive AI analysis.
- Turkish and English UI support.
- Owner-only Control Center, sanitized logs, operational metrics, and optional self-hosted analytics integration.

Advanced AI analysis and bulk Discord changes are not generally available. Payments and Premium are not included. Undocumented bot name styling is experimental, optional, and not part of normal startup.

## Local setup

Requires Node.js 24.17+ and npm. Use a separate Discord test application and server.

```sh
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell; `cp .env.example .env` on Linux). Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and a test `DISCORD_GUILD_ID`. Never commit `.env`.

```sh
npm run doctor
npm run check
npm test
npm run build
npm start
```

`npm run dev` enables development watch mode. Startup synchronizes commands; use a test guild to avoid unintended global command changes. Local SQLite files are created in `data/`; an external database server is not required.

## Web dashboard

Set `DISCORD_CLIENT_SECRET`, `DASHBOARD_ORIGIN=http://localhost:3000`, `DASHBOARD_PORT=3000`, and register `http://localhost:3000/auth/callback` in the Discord Developer Portal. Start `npm run dashboard` in another terminal. OAuth scopes are `identify guilds`; do not request Administrator just to install the basic bot. Keep owner access unset unless you intend to configure it. See [DASHBOARD.md](DASHBOARD.md) for more detail; advanced deployment guidance must be adapted to your environment.

Both services must use the same settings path when sharing preferences. Do not run this preparation against production data. Linux systemd/observer templates are optional and need environment-specific review.

## Development and verification

Tests use Node's test runner and tsx. The independent help replacement passes 153 local tests in the complete suite; its remote CI is tracked separately. They cover permissions, settings, OAuth/session handling, metrics, analytics, and dashboard routes. Windows and Ubuntu CI run against this clean repository; consult its Actions results for the current commit. Tests are not proof of every live Discord interaction.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [LICENSE](LICENSE). Third-party notices remain under `dashboard/`; package license metadata is listed in `THIRD-PARTY-INVENTORY.json`. Original brand artwork and reference assets are excluded; see ASSETS.md. The code license does not grant separate trademark rights.

## Publication history

This repository starts with a new root commit from the reviewed clean source package. No earlier Git history was imported. The former repository is retained separately as a private archive. Publication was explicitly approved by the maintainer; the private archive remains separate.

## License

Project-owned source code and documentation are available under the [MIT License](LICENSE).

Copyright (c) 2026 LabCafe

“LabCafe” is the approved project/brand designation in this notice, not an assertion that an incorporated legal entity exists. Private brand artwork is excluded; the code license does not grant separate trademark rights or imply endorsement. Third-party materials retain their own licenses and notices. See [ASSETS.md](ASSETS.md).
