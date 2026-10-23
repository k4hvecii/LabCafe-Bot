# Release management and Discord notifications

## Current state and authority

The clean repository has no published GitHub Release or Git tag as of the initial
inspection on 23 October 2026. `package.json` and the lockfile both contain the
inherited `1.0.0`; this is **unreleased development metadata**, not a Stable release.
This implementation leaves it unchanged. A successful CI verifies a commit; it
never creates, approves or deploys a release.

`package.json.version` is the version source. The lockfile root versions must
match it. A tag must be exactly `v` plus that version. Publication stage is derived
from that version **and a real published GitHub Release** at its resolved tag commit:

| Context/version | Reported stage | GitHub prerelease |
| --- | --- | --- |
| No published Release (any valid package version) | Development | Not applicable |
| `0.1.0-dev.0` | Development only; cannot announce a release | Not applicable |
| `0.1.0-beta.1` | Beta after publication and verified CI | true |
| `0.1.0-rc.1` | Release Candidate after publication and verified CI | true |
| `0.1.0` / `0.1.1` | Stable after explicit approval, publication and verified CI | false |

Supported identifiers follow this intentionally restricted SemVer policy: numeric
major/minor/patch and optional `dev.N`, `beta.N` or `rc.N`. Alpha and build suffixes
are not currently used. `LABCAFE_RELEASE_ID`, where used by existing observability,
is a deployment diagnostic identifier, not the publication/version authority here.

## Proposed first version transition (not executed)

After feature acceptance, prepare `0.1.0-beta.1`. Resetting the inherited `1.0.0`
is appropriate only because no real `1.0.0` publication exists; recheck tags/releases
immediately before preparation. Never rename an already published version.

```sh
npm run release:check
npm run release:prepare -- 0.1.0-beta.1
```

Preparation only changes package and lockfile metadata in the working tree. It does
not create commits, tags or GitHub Releases, push code, install packages or deploy.
Review the diff, test, commit and verify Windows/Ubuntu CI. Keep `private: true` to
prevent accidental npm publication. This does not affect GitHub visibility.

For each Beta: complete feature and isolated live tests, review limitations, obtain
publication approval, create a tag at the verified commit, and manually publish a
**pre-release**. Deploy to approved beta servers as a separate operation. For RC:
review beta findings, test the exact candidate and publish a pre-release. For
Stable: obtain explicit maintainer approval, complete acceptance/security checks,
verify tag/version/commit and both CI jobs, then manually publish a non-prerelease.
No command or workflow in this change creates or deploys any release.

Optional local tag consistency check after a tag exists:

```sh
npm run release:check -- --tag v0.1.0-beta.1
```

It checks package/lock metadata and that the tag resolves to local HEAD. Notifications
independently read package/lock files at the remote tag commit, not a moving branch.
A mismatched tag, draft Release, wrong prerelease flag or unverified CI blocks a
release announcement. If a Release was published prematurely, finish/review acceptance
and explicitly review recovery; a later successful CI does not silently announce it.

## Notification events

- **Development completed:** a successful push CI on the default branch associated
  with a genuinely merged PR. Ordinary commits and development-branch successes
  are silent. An important direct-main change can be announced using the manual
  workflow on the default branch with a full SHA, a public-safe summary and the
  explicit confirmation input. The commit must be ancestral to the default branch
  and have successful push CI on both OS jobs. A manual notification is not a release.
- **Test failed:** a completed failing/timed-out run of the existing CI workflow
  for a branch in this repository. Pending, cancelled and fork PR runs are not
  reported as successful or as published releases.
- **Beta / RC / Stable:** only an actual `release: published` event, rechecked using
  the GitHub API. Both OS jobs for the exact tag commit must have passed.

CI lookup uses the actual `.github/workflows/ci.yml` workflow ID, exact SHA, same
head repository and push event. The newest run takes precedence over older successes.
The existing Windows/Ubuntu CI workflow is preserved. Metadata and notifier tests
are part of `npm test` and therefore run on both platforms.

## Git Diff and release notes

Notifications read real GitHub commit/compare file metadata: additions, deletions
and filenames. A short `diff` block shows green `+` and red `-` where the Discord
client supports syntax highlighting. Only counts appear; **no source patch lines**
are forwarded. Up to four allowlisted filenames are shown. Environment files,
private data/config paths, logs, keys, databases, archives and credential-shaped
names are hidden; the safe aggregate count can still include these files.
Author identities, email addresses, commit bodies and file contents are not copied.
PR titles, approved manual summaries and selected release-note bullets are sanitized,
bounded and mention-disabled. They must still be reviewed for public-safe content:
pattern redaction cannot recognize every possible real-world name or secret.

Commit summaries describe the commit, not the entire release. Where a previous
published ancestral release exists, release summaries compare that tag to the new
tag and include a GitHub compare link. Without an earlier release, the card explicitly
shows the tagged **commit** diff, not a fabricated full-release diff. Large API
responses are capped at 300 files and marked partial rather than claimed complete.
GitHub links provide the full review. No code changes are inferred from commit prose.

Use these headings in the actual GitHub Release body; up to two short bullets per
group are included in Discord:

```markdown
## Yeni özellikler
- Reviewed user-facing additions.
## İyileştirmeler
- Reviewed improvements.
## Hata düzeltmeleri
- Reviewed fixes.
## Güvenlik
- Public-safe security summary; no exploit/credential details.
## Bilinen sorunlar
- Actual remaining limitations.
```

English headings Features, Improvements, Fixes, Security and Known issues are also
supported. Missing known-issue notes are labelled **not specified**, not “no issues”.
A draft from real local commit subjects can be generated with:

```sh
npm run release:notes -- --from FULL_BASE_SHA --to FULL_HEAD_SHA
```

This outputs a labelled, unreviewed Markdown draft with five groups. It is not
proof that a feature is complete; review every bullet and known limitation before
publication. It does not edit a Release or invent history.

## GitHub/Discord setup — maintainer action required

This change is on a separate development branch. Review and merge it before
activation; `workflow_run` and manual dispatch use the workflow on the default
branch. The branch push alone does not activate the notifier or update the bot.

1. In the desired Discord text channels, create separate **incoming webhooks** for
   development and releases if desired. Use the native webhook URLs, **without**
   GitHub's `/github` suffix. Do not post the URLs in issues, chat or source.
2. Repository Settings → Secrets and variables → Actions → New repository secret:
   `DISCORD_DEV_WEBHOOK_URL` and `DISCORD_RELEASE_WEBHOOK_URL`. Either may be omitted;
   its notifications safely skip. No bot token or Discord OAuth secret is needed.
3. Review/protect the default branch and workflow changes. The new workflow has
   read-only GitHub permissions, checks out only the trusted default branch with
   credentials persistence disabled, executes no contributor code/install hooks,
   downloads no untrusted artifacts, and pins the actions it uses to commit SHAs.
   No `pull_request_target` trigger is used. The read-only preparation job sees
   no Discord secrets; secrets are supplied only to configuration/delivery steps.
4. After approval, test one real development notification on a verified commit.
   This implementation only performs offline mocked POST tests and dry-runs; it
   has not posted to your Discord server or created Actions Secrets.
5. Only after the custom system is confirmed, repository Settings → Webhooks →
   existing direct GitHub/Discord connection → Edit → uncheck Active → save. Keep
   the old webhook unchanged until then. Both enabled systems can otherwise post
   overlapping announcements. The existing hook was observed active on all events;
   it was neither removed nor changed by this work.

## Duplicate protection and delivery failures

Canonical keys: `development-SHA`, `ci-failure-RUN_ID`, `release-RELEASE_ID`. PR and
manual announcements for the same commit share a key. A per-key concurrency group
serializes deliveries; an immutable Actions cache reservation is saved **before**
POST, restored and owner-verified before use. An atomic local attempt file prevents
simultaneous sends within a runner. No cache is executed as code.

**Tradeoff:** this is conservative at-most-once attempt handling while a reservation
exists, not a permanent exactly-once delivery guarantee. An interrupted run after
reservation can lose an announcement; cache eviction/expiration can eventually
remove deduplication history. Do not rerun old events after deleting/evicting their
cache without checking Discord. A reservation/cache read-back failure blocks POST.
A missing webhook creates no reservation. Old direct-webhook duplicates are outside
this notifier and require the separate manual deactivation step above.

Discord 429 responses retry only known rejected requests, at most three attempts,
with a maximum 30-second delay each. Network timeouts, redirects or 5xx responses
have uncertain delivery and are **not retried**. The delivery job reports sanitized
status codes, never webhook URLs, request headers or response bodies. For a failed
reserved event, inspect the job and Discord first; only an explicitly reviewed
recovery may remove that one cache reservation and rerun the event. No automatic
cache deletion or blind retry is implemented.

## Dry-run previews (no Discord POST)

Offline, clearly hypothetical release cards, with no invented diff counts:

```sh
npm run notifications:preview -- --example beta
npm run notifications:preview -- --example stable
```

Public GitHub metadata can be read without a token (subject to GitHub rate limits).
A local `GITHUB_TOKEN` is optional for authenticated read rate limits and must never
be committed. These commands do GET requests only and print safe payload JSON:

```sh
npm run notifications:preview -- --commit FULL_COMMIT_SHA
npm run notifications:preview -- --compare FULL_BASE_SHA...FULL_HEAD_SHA
npm run notifications:preview -- --example beta --commit FULL_COMMIT_SHA
```

The last command combines an explicitly hypothetical release card with the real
referenced commit diff. It is not evidence that a Beta or Stable Release exists.
Current release publication, production deployment, existing webhook changes and
live Discord delivery remain separate approval/acceptance steps.

References: [Semantic Versioning](https://semver.org/),
[GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[Discord webhooks](https://docs.discord.com/developers/resources/webhook),
[Discord message limits](https://docs.discord.com/developers/resources/message#embed-object-embed-limits).
