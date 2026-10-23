# LabCafe-Bot development instructions

## GitHub synchronization

These rules apply to development in this repository. The canonical remote is
https://github.com/k4hvecii/LabCafe-Bot.

- Synchronize completed and verified development tasks, not every small file edit.
- Run the checks and relevant tests appropriate to the completed change before committing. Documentation-only changes do not require redundant runtime test runs; review their diff and formatting and verify GitHub Actions after pushing.
- Before staging and pushing, inspect the exact diff and staged file list for `.env` files, tokens, credentials, secrets, production configuration, logs, SQLite databases, backups and other local or private data. Do not publish such data. Keep `.env.example` limited to safe placeholders.
- Commit successful, safe, coherent changes with meaningful commit messages and push them regularly to `k4hvecii/LabCafe-Bot`.
- Do not push incomplete, broken or experimental changes directly to `main`. Use a separate development branch when needed, and clearly report unfinished work.
- Verify GitHub Actions for the exact pushed commit. Do not describe failed tests, pending CI or incomplete work as successfully completed. Report blockers honestly.
- Do not force push, delete or rewrite Git history, or deploy to production under this synchronization rule.
- A GitHub push is a source publication action, not authorization to update or restart the live bot. Keep source synchronization separate from production deployment; do not introduce automatic production deployment as part of it.
- End each development task with a brief report containing the commit SHA, push status and CI result. If no commit or push was made, state that explicitly and explain any relevant blocker.

Keep changes scoped to the task and preserve existing functionality, security boundaries,
third-party notices and the separation of private brand assets from the MIT code license.
