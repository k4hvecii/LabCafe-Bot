# LabCafe command guide

Independent replacement, specified from the current BotCommand/GuildSettingsStore contracts and Discord component/interaction documentation. It does not retain the former renderer, category prose, special emoji catalogue, theme or byte-parity fixtures.

- catalog.ts: permission-aware command discovery and search from registered command metadata.
- view.ts: one embed, category selector, up to eight commands per page and a bounded navigation row. Turkish/English labels are defined here, not imported from legacy panels.
- handler.ts: random server-side session handles (five-minute expiry, maximum 500), user/guild/channel binding, search modal, access modal with current permission checks, audit-backed writes and stale/replay rejection.
- access-store.ts: existing LabCafe SQLite access schema and evaluator retained as the shared bot/web contract. No legacy renderer dependency.

Public help messages remain visible, but controls belong to the invoking user. Others open their own /yardım or localized /help. After restart/expiry or when clicking former help: controls, users are directed to reopen the guide. No claim is made that the previous visual design or custom IDs are preserved.

Tests assert behavior, access enforcement, payload limits and language handling; no serialized old content is a test oracle. Real Discord test-app validation remains pending separate credentials. This technical replacement is not a claim of independent legal clean-room certification; the developer had prior access to the old project.

References:
https://docs.discord.com/developers/components/reference
https://docs.discord.com/developers/interactions/receiving-and-responding
