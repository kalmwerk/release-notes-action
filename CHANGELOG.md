# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2026-11-19

Notes from commits start at the previous full release, never at a floating major tag like `v1`.

### Fixed
- A floating major or minor tag (`v1`, `v1.2`) on the same commit as a full version tag counted as version 1.0.0 (or 1.2.0), so it could be picked as the previous tag: the notes said "since v1" and the compare link read `v1...v1.0.5` instead of `v1.0.0...v1.0.5`. Once `v1` had moved to the new release, a rerun read an empty range. The previous tag is now the highest earlier full version (`x.y.z`, with or without a `v`). Floating tags count only when there's no full version tag to start from, as in a repository tagged `v1`, `v2`, `v3`; a short tag on a commit of its own, like `v1.1` before `v1.1.5`, is still a release.
- A tag on the commit being released is never the previous tag, so a version tagged twice, or a floating tag already moved onto the release, can't give an empty range.
- Run by hand without a tag, the Action takes the newest full version tag rather than a floating tag next to it.

### Changed
- File paths in `dist/index.js` comments read `// src/...` wherever it's built, so the bundle built from this repository's source is byte for byte the released one.

## [1.0.5] - 2026-11-18

Release notes keep the bullets and numbered steps nested under an entry.

### Fixed
- Bullets nested under an entry in `CHANGELOG.md` (or a GitHub release body) were left out of the release notes, which kept only the entry's first line: a "new rules" entry lost the three rules listed under it. Nested bullets now stay under their entry, at any depth, indented with 2 or 4 spaces or a tab, with `-`, `*` or `+`; numbered steps keep their numbers. The `json` output keeps them too, as an indented list after the entry's first line.
- A sub-item indented with a tab became an entry of its own. It's nested under its entry now.

A breaking change's nested bullets stay its migration steps, listed once under "Breaking changes", as before.

## [1.0.4] - 2026-11-14

Notes written from commits flag `hotfix!:`, `bugfix!:`, `deprecate!:` and `remove!:` commits as breaking changes.

### Fixed
- A `!` on a `hotfix:`, `bugfix:`, `deprecate:` or `remove:` commit didn't make it a breaking change, so it was missing from "Breaking changes" and from the breaking-change count. These commits now follow the same rules as LogPulse's changelog-from-commits tool: a `!` or a `BREAKING CHANGE:` footer lists them under "Breaking changes", with their scope and migration steps.
- Entries from those commits kept the type in front, like "hotfix: stop a crash". Like `feat:` and `fix:` entries, they now start with the change itself, under the section the type chose: Fixed, Deprecated or Removed.
- The same goes for entries in CHANGELOG.md written as commit subjects, like `- remove!: the v1 endpoints` under Changed: they're sorted by their type, and a `!` makes them a breaking change. Without one, a `remove:` entry outside a Removed section isn't counted as breaking, as with commits.

## [1.0.3] - 2026-11-13

Notes written from commits list a pull request merged with a merge commit once.

### Fixed
- A pull request merged with "Create a merge commit" was listed twice in notes from commits: once under its title, from the merge commit, and again for each commit on its branch. Commits are now read along the target branch's first parents, so the pull request is one entry, its title with its number, and its branch commits aren't repeated. This works from a full checkout and through the GitHub API. Squash and rebase merges stay one entry per commit on the target branch.
- A merge commit with GitHub's "Pull request title" message (`Fix login (#12)`) was left out and its branch commits listed instead. It's now the pull request's entry.
- A breaking commit on a pull request's branch makes the pull request's entry a breaking change, with that commit's `BREAKING CHANGE:` footer as the migration steps, so leaving the branch commits out doesn't lose it.
- In a squash merge message, a `BREAKING CHANGE:` footer's migration steps no longer run on into the list of squashed commits and the `Co-authored-by:` lines. A squashed `type!:` commit marks the pull request as breaking.

### Changed
- A pull request that brings in other merged pull requests, like `develop` into `main`, is listed as those pull requests instead of as one line.
- `max-commits` limits the commits listed. The whole range is read, so pull requests can be told apart from the commits on their branches.

## [1.0.2] - 2026-11-12

Notes written from commits list each commit once.

### Fixed
- Notes from commits could open with a stray, unformatted copy of one commit above the first section, for example when a `deps:` commit landed under "Other changes". The release body and the job summary now start with the first section. Notes from `CHANGELOG.md` are unchanged.

## [1.0.0] - 2026-11-12

First release: release notes from your changelog, written inside your own workflow.

### Added
- Release notes from the matching `CHANGELOG.md` section, in Keep a Changelog 2.0.0 (or 1.1.0, conventional-changelog, changesets or plain version headings).
- Notes from the commits since the previous tag when there's no changelog section, grouped by Conventional Commits type, with `BREAKING CHANGE:` footers as migration steps.
- Breaking changes listed first with their migration steps, then each change once under its type.
- Fills in the GitHub release body (`replace`, `append`, `prepend` or `keep`), or creates the release on a tag push.
- Job summary, and outputs for the notes, a notes file, JSON, the version and breaking-change counts.
- Works from a full checkout (local git) or with no checkout at all (GitHub API).
