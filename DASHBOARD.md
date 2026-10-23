# Dashboard setup

Use Node.js 24.17+ and a separate test Discord application. Run `npm ci` from the repository root. Copy `.env.example` to `.env` and set the bot token, application ID and OAuth client secret locally.

Register exactly `http://localhost:3000/auth/callback` under Discord OAuth2 redirects. Set `DASHBOARD_ORIGIN=http://localhost:3000` and `DASHBOARD_PORT=3000`. Run `npm run dashboard`; open http://localhost:3000. Keep the bot in another terminal using `npm start` when testing shared settings.

OAuth uses identify and guilds scopes. The account must own or manage a server. The bot must be present for settings access. Changes require confirmation. Use the same LABCAFE_SETTINGS_PATH for separate bot and dashboard processes; SQLite needs a writable directory.

Optional owner access uses LABCAFE_OWNER_ID (user ID). Leave observer/control paths and tokens unset for the basic local setup. Never expose metrics ports publicly. Production requires HTTPS, a registered HTTPS callback, least-privilege permissions and environment-specific review of deployment templates. Trust proxy headers only behind a proxy you control.

The original mascot, custom illustrations, founder block and reference assets are excluded from this private source candidate. `/logo.svg` is a neutral replacement. No production credentials, database or analytics data are distributed. No preview route or completed AI-analysis feature is claimed.
