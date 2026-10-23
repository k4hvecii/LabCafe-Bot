# Interactive settings panel

The panel has two mutually exclusive opt-in modes. With both flags absent or false,
`/ayarlar` retains its five legacy subcommands. No other command is redesigned.
English clients display `/settings` through Discord localization.

## Approved production migration

Set `LABCAFE_SETTINGS_PANEL_ENABLED=true` and leave
`LABCAFE_SETTINGS_PANEL_PROTOTYPE=false` only for an explicitly approved rollout.
This selects the single `/ayarlar` panel for the existing normal, global or
joined-guild command registration scopes. It does not expand those scopes.
The next normal startup/registration synchronizes the new schema, removing the
five subcommands from that scope. Back up SQLite and review registration targets
before starting the approved deployment. No database migration is needed.

Rollback: set `LABCAFE_SETTINGS_PANEL_ENABLED=false` and perform an approved
normal command sync to restore the unchanged legacy definition. Existing ephemeral
sessions expire after five minutes; process restarts invalidate them safely.
The isolated prototype flag is not a production activation mechanism, and enabling
both flags is rejected. Neither this code nor these instructions themselves perform
a Discord registration or deployment.

## Isolated test setup

Use a separate checkout, test application token, test server and fresh SQLite path.
Never reuse production credentials, data, service configuration or process ports.
Install dependencies and build using the existing README instructions, then set:

```dotenv
NODE_ENV=development
LABCAFE_SETTINGS_PANEL_PROTOTYPE=true
LABCAFE_TEST_APPLICATION_ID=YOUR_TEST_APPLICATION_ID
DISCORD_CLIENT_ID=YOUR_TEST_APPLICATION_ID
DISCORD_GUILD_ID=YOUR_TEST_SERVER_ID
DISCORD_REGISTER_JOINED_GUILDS=false
LABCAFE_SETTINGS_PATH=./data/settings-panel-test.sqlite
```

These IDs are placeholders. Put the test bot token only in your local ignored
`.env`. The parser refuses prototype activation in production mode, without a test
guild, with joined-guild registration, or when the explicit test application ID
does not match the configured application. The startup also verifies that the
connected bot belongs to `DISCORD_CLIENT_ID` before synchronizing any commands.

`npm start` synchronizes commands only in the configured test guild when these
settings are enabled. Alternatively `npm run commands:register` registers the
same test definitions; it makes an actual Discord API write, so run it only with
that isolated application. Do not run either against production. No registration
or Discord login was performed as part of developing this prototype.

## Panel behavior

`/ayarlar` opens an ephemeral Components V2 coffee-accent card. Language, reply
visibility and text-channel selections are drafts until Save and Confirm. Clearing
the channel selector allows all channels. Public command replies never make this
management panel public. Reset has its own confirmation. Back preserves the draft;
Discard reloads saved values; Close removes controls without saving.

Each interaction is bound to its owner, guild, channel and message. It is
acknowledged before REST work; current interaction permissions and a freshly
fetched member must both allow Manage Server. Channels are fetched and bot
permissions checked on selection and again before writing. Sessions expire after
five minutes, are bounded in memory and do not survive restarts. A closed/expired
panel instructs the user to run the main command again. Revision checks and an
in-flight lock reject repeat confirmations. Failed permission or channel checks do not write
settings. An atomic expected-state comparison prevents overwriting dashboard
changes; Reload discards the stale draft and reads current values. Normal writes
and resets use the existing SQLite transaction and settings-history mechanisms.

No modal is needed for the three bounded settings. `src/ui/cards.ts` supplies the
existing card style. The router handles channel selectors separately from the
unchanged help interactions.

## Validation and manual acceptance

Automated interaction tests use mocked Discord boundaries and isolated SQLite;
they do not replace live tests. On the separate test application/server:

1. Run `/ayarlar` as a manager and as an unauthorized member. Check private display.
2. Select English and public replies, Save, inspect the summary, and Confirm.
   Reopen the panel and inspect dashboard/settings history for the same values.
3. Choose a text channel; revoke the bot's channel permissions before confirming.
   Verify no write. Clear the selection and confirm all channels.
4. Discard an edit; open Reset and Back; verify neither writes. Confirm Reset and
   verify one reset-history entry.
5. Change settings in the dashboard after opening a panel. Confirm the old draft;
   verify the conflict card, no overwrite, and Reload.
6. Revoke Manage Server while the panel is open. Check rejection. Test rapid repeat
   clicks, expiry after five minutes, and a bot restart with an old panel.
7. Verify `/yardım` categories, search and access-edit interactions still work.

Live acceptance and a real Discord screenshot remain pending until the separate
test application and server are available. Production rollout requires explicit
maintainer approval after acceptance: enable the production flag, review the intended guild/global registration diff, back up settings,
and perform the approved sync. Do not synchronize production definitions without rollout approval. Rollback
uses the unchanged legacy command definition and normal approved registration;
no database schema migration or data deletion is needed.

References: [Discord components](https://docs.discord.com/developers/components/reference)
and [interaction responses](https://docs.discord.com/developers/interactions/receiving-and-responding).
