# Private source preparation — 23 October 2026

This is the first truthful Git publication of an existing local project. No historical commits were reconstructed. The project is new and does not claim broad adoption, public contributor activity, downloads or stars.

Implemented: TypeScript Discord slash commands (help/search/categories, info, ping, setup, settings), SQLite preferences and command access rules, OAuth2 dashboard with manageable-server permissions and approved settings writes, settings history, rule-based read-only server checks, Turkish/English support and owner-only observability.

The primary maintainer directs product decisions, requirements, development and releases. Much of the source was produced with ChatGPT and OpenAI Codex assistance; no claim is made that the maintainer manually wrote all code. Maintainer responsibilities include change review, issue/security handling, tests, dependencies and releases. Project-owned code is MIT licensed; proposed contributions should be small, tested, reviewed and free of production data. Private vulnerability reporting still needs activation or a verified alternative channel.

Verification on Windows: 153/153 tests, TypeScript check and build pass. These include permission/session/persistence/metrics tests, not all live Discord interactions. The clean initial commit passed both Windows and Ubuntu GitHub Actions jobs; later documentation commits have their own CI results.

Advanced AI analysis, generalized bulk Discord changes and payments are not released features. Original brand assets and references are excluded; the approved MIT code grant remains separate from brand rights and third-party terms. See ASSETS.md and LICENSE. Keep this repository Private until explicitly approved otherwise.

The former help renderer and serialized legacy fixture were independently replaced before this repository was created. The old archive and its commit graph are not part of this repository.
