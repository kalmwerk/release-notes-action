# Changelog to release notes

A free GitHub Action that writes your GitHub release notes from the matching `CHANGELOG.md` section, or from the commits since the last tag when there's no changelog. It runs entirely inside your workflow: no API key, no sign-up, and no calls to anything but GitHub's own API.

- **Reads the changelog you already keep.** Keep a Changelog 2.0.0 (and 1.1.0), conventional-changelog, changesets, or any file with a version in each release heading.
- **Breaking changes first.** Entries marked `**Breaking:**` (or `BREAKING`, `⚠️`, `feat!:`) are listed at the top with their migration steps, then every other change once under Added, Changed, Deprecated, Removed, Fixed and Security.
- **No changelog? Commits.** Conventional Commits are grouped by type, `BREAKING CHANGE:` footers become migration steps, and housekeeping (`chore`, `ci`, `test`…) is left out.
- **Fills in the release.** On a published release, a tag push or a manual run. It can also write a job summary and hand the notes to later steps.

The parser is the same one behind the free [changelog-to-JSON converter](https://release-ripple-roadmap.lovable.app/tools/changelog-to-json), so you can paste your changelog there to see what the Action will find.

## Quick start

Save this as `.github/workflows/release-notes.yml`. Publish a release on GitHub and its notes are filled in from `CHANGELOG.md`.

```yaml
name: Release notes

on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: kalmwerk/release-notes-action@v1
```

The job needs `contents: write` to edit the release. The default `GITHUB_TOKEN` is enough; updates made with it don't trigger the workflow again.

## More ways to run it

**Create the release when you push a tag.** `fetch-depth: 0` gives the Action your full history and tags, which it needs for notes from commits.

```yaml
on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: kalmwerk/release-notes-action@v1
        id: notes
      - name: Warn about breaking changes
        if: steps.notes.outputs.has-breaking-changes == 'true'
        run: echo "::notice::${{ steps.notes.outputs.breaking-change-count }} breaking change(s) in ${{ steps.notes.outputs.tag }}"
```

**Preview or rewrite notes by hand** from the Actions tab:

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: Tag to write notes for (leave empty for the newest version)
        required: false
      update-release:
        description: Write the notes into the GitHub release
        type: boolean
        default: false

permissions:
  contents: write

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: kalmwerk/release-notes-action@v1
        with:
          tag: ${{ inputs.tag }}
          update-release: ${{ inputs.update-release }}
```

**Use the notes somewhere else**, for example with another release tool:

```yaml
      - uses: kalmwerk/release-notes-action@v1
        id: notes
        with:
          update-release: false
      - run: gh release create "${{ steps.notes.outputs.tag }}" --notes-file "${{ steps.notes.outputs.notes-file }}"
        env:
          GH_TOKEN: ${{ github.token }}
```

**Monorepos** with tags like `@acme/sdk@2.0.0` or `sdk-v2.0.0` work too: the previous tag is the highest earlier version with the same prefix. Point `changelog-path` at the package's changelog.

These workflows are also in [`examples/`](examples/).

## How it picks the notes

1. **The tag.** The published release's tag, the pushed tag, or the `tag` input. A manual run without one uses the newest version in the changelog (or the newest tag).
2. **The version.** Read from the tag: `v1.2.0`, `1.2.0`, `pkg@1.2.0` and `release-1.2` all mean version `1.2.0` / `1.2`. Set `version` for tags without one.
3. **The changelog section** for that version, e.g. `## [1.2.0] - 2026-11-12`. `1.2` and `1.2.0` match each other. An optional summary paragraph at the top of the section (Keep a Changelog 2.0.0) opens the notes.
4. **Otherwise, the commits** since the previous tag (unless `source: changelog`, which fails instead). The previous tag is the highest earlier version with the same prefix; a stable release skips pre-release tags, so `2.0.0` covers everything since `1.9.0`.

Commits are sorted like this:

| Commit | Section |
| --- | --- |
| `feat:`, or a subject starting with Add, Introduce, Support… | Added |
| `fix:`, or Fix, Resolve, Correct, Prevent… | Fixed |
| `perf:`, `refactor:`, `revert:`, or Update, Improve, Change, Rename… | Changed |
| Deprecate… / Remove, Drop, Delete… | Deprecated / Removed |
| `feat!:` or a `BREAKING CHANGE:` footer | Breaking changes, footer as migration steps |
| `chore:`, `ci:`, `build:`, `test:`, `style:`, release commits, branch merges | Left out (see `exclude-types`) |

A pull request merged with a merge commit is one entry, its title with its number, and the commits on its branch aren't repeated (a breaking commit there makes the entry breaking, with its migration steps). Squashed, it's its one commit; rebased, each commit is listed once. A pull request that brings in other pull requests, like `develop` into `main`, is listed as those pull requests.

## Example

This section of `CHANGELOG.md`:

```markdown
## [3.0.0] - 2026-11-03

Two breaking changes: `connect()` is async, and `Client.raw()` is gone.

### Changed
- **Breaking:** `connect()` is now async. Replace `db = connect(url)` with `db = await connect(url)`.
- Error messages include the line and column ([#398]).

### Deprecated
- `Client.legacy_query()`: use `Client.query()`. It will be removed in 4.0.0.

### Removed
- **Breaking:** `Client.raw()`, deprecated since 2.4.0. Use `Client.query(raw=True)`.

### Fixed
- Timeouts apply to DNS lookups ([#405]).

[#398]: https://github.com/acme/db/pull/398
[#405]: https://github.com/acme/db/pull/405
```

becomes this release body:

```markdown
Two breaking changes: `connect()` is async, and `Client.raw()` is gone.

## ⚠️ Breaking changes

- `connect()` is now async. Replace `db = connect(url)` with `db = await connect(url)`.
- Removed `Client.raw()`, deprecated since 2.4.0. Use `Client.query(raw=True)`.

## Changed

- Error messages include the line and column (#398).

## Deprecated

- `Client.legacy_query()`: use `Client.query()`. It will be removed in 4.0.0.

## Fixed

- Timeouts apply to DNS lookups (#405).

**Full changelog:** https://github.com/acme/db/compare/v2.4.1...v3.0.0
```

GitHub links `#398` to the pull request. Set `style: original` to keep the section exactly as written instead.

## Inputs

All inputs are optional.

| Input | Default | What it does |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token for reading tags and writing the release. Needs `contents: write` to update releases. |
| `tag` | release or pushed tag | Tag to write notes for. On a manual run without one: the newest changelog version, or the newest tag. |
| `version` | from the tag | Version to look up in the changelog, for tags without one. |
| `changelog-path` | `CHANGELOG.md` | Path to the changelog, relative to the repository root. |
| `source` | `auto` | `auto`: changelog section, else commits. `changelog`: fail without a section. `commits`: always commits. |
| `previous-tag` | highest earlier version | Where the commit range and compare link start. |
| `exclude-types` | `chore,ci,build,test,tests,style` | Conventional Commits types left out of commit notes. Breaking commits are always kept. `none` keeps everything. |
| `max-commits` | `250` | Most commits listed (1–1000); a pull request merged with a merge commit counts as one. |
| `style` | `clean` | `clean`: breaking changes first, each change once. `original`: the section as written. |
| `update-release` | `true` | Write the notes into the GitHub release for the tag. `false` only sets outputs and the job summary. |
| `create-release` | `true` | Create the release if the tag exists but has no release yet. Never creates tags. |
| `body-mode` | `replace` | Text already in the release: `replace`, `append`, `prepend`, or `keep` (only fill an empty body). |
| `summary` | `true` | Write the notes to the job summary. |
| `compare-link` | `true` | End with a "Full changelog" link from the previous tag to this one. |

The notes sit between two invisible HTML comments in the release body, so running the Action again replaces only its own block, whatever the `body-mode`.

## Outputs

| Output | What it holds |
| --- | --- |
| `notes` | The release notes as Markdown. |
| `notes-file` | Path to a file with the notes, e.g. for `gh release create --notes-file`. |
| `json` | The release as JSON in LogPulse's machine-readable changelog shape: `version`, `date`, `breaking_changes[]` (summary, affects, migration), `deprecations[]` (item, replacement, removal_version), `changes`. |
| `source` | `changelog` or `commits`. |
| `tag` | The tag the notes are for (empty when a manual run found a version with no tag yet). |
| `version` | The version, without a leading `v`. |
| `previous-tag` | Where the commit range and compare link start (empty for a first release). |
| `has-breaking-changes` | `true` or `false`. |
| `breaking-change-count` | Number of breaking changes. |
| `deprecation-count` | Number of deprecations. |
| `release-id` | ID of the release that was updated or created (empty when none was touched). |
| `release-url` | URL of that release. |
| `release-action` | `updated`, `created`, `unchanged` or `skipped`. |

## Privacy and security

- Everything runs in your runner. The Action reads your changelog and git history and, to fill in the release, calls the GitHub API (`GITHUB_API_URL`, so GitHub Enterprise Server works too) with the token you give it. It sends nothing anywhere else: no LogPulse account, API key, analytics or telemetry.
- No dependencies are installed when it runs. `dist/index.js` is built from `src/` with esbuild and has no third-party packages; CI fails if it doesn't match the source.
- It never creates or moves tags, and never touches a release when `update-release` is `false`.

## Troubleshooting

- **"GitHub refused to update the release (403)"**: add `permissions: contents: write` to the workflow or job.
- **"CHANGELOG.md has no section for 1.2.0"**: the heading needs the version, like `## [1.2.0] - 2026-11-12`. If you tag before moving entries out of `## [Unreleased]`, rename that section first. Without `source: changelog`, the Action falls back to commits and says so in a warning.
- **Commit notes cover too much or too little**: check out with `fetch-depth: 0`, or set `previous-tag`. Without full history the Action uses the GitHub API instead, which also works.
- **Your own text in the release was replaced**: use `body-mode: append`, `prepend` or `keep`.

## Development

```sh
npm ci
npm test          # unit tests, plus end-to-end runs of dist/index.js against a fake GitHub API
npm run build     # rebuild dist/index.js; commit it with the source
```

`src/converter/` is a copy of the parser from LogPulse's free converter; see [its README](src/converter/README.md).

Want hosted changelog pages and release emails? [LogPulse](https://release-ripple-roadmap.lovable.app) hosts changelog pages free; release emails come with Pro, which opens soon (join the waitlist).

## Related tools

These free pages are on LogPulse, our own site: Kalmwerk makes both this Action and LogPulse, so read them as ours, not as independent picks. You don't need any of them to use the Action.

- [Changelog to JSON](https://release-ripple-roadmap.lovable.app/tools/changelog-to-json): paste a `CHANGELOG.md` and see what this Action will read from it. It's the same parser.
- [Changelog validator](https://release-ripple-roadmap.lovable.app/tools/changelog-validator): checks a `CHANGELOG.md` against Keep a Changelog 2.0.0, with line numbers and a fix for each issue.
- [Changelog badge](https://release-ripple-roadmap.lovable.app/tools/changelog-badge): a README badge that runs that check and links to the report.
- [Changelog from git commits](https://release-ripple-roadmap.lovable.app/tools/changelog-from-commits): paste `git log` output and get a Keep a Changelog section, sorted with this Action's commit rules. It runs in your browser.
- [GitHub release notes generator](https://release-ripple-roadmap.lovable.app/tools/github-release-notes): notes for the commits and merged pull requests between two releases or tags of a public repository, or for old tags that never got notes.
- [Release notes from GitHub](https://release-ripple-roadmap.lovable.app/tools/release-notes-from-github): everything merged since a public repository's last tag, breaking changes first.
- [GitLab CI/CD component](https://release-ripple-roadmap.lovable.app/tools/gitlab-component): the same release notes for GitLab releases, with `CI_JOB_TOKEN` only.
- [This Action's page](https://release-ripple-roadmap.lovable.app/tools/github-action): the workflows above, a rendered example and a download with its SHA-256.
- Guide: [how to generate a changelog from git commits](https://release-ripple-roadmap.lovable.app/guides/generate-changelog-from-git), with the `git log` commands for a first draft.

## License

[MIT](LICENSE) © 2026 Kalmwerk
