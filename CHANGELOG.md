# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First release: release notes from your changelog, written inside your own workflow.

### Added
- Release notes from the matching `CHANGELOG.md` section, in Keep a Changelog 2.0.0 (or 1.1.0, conventional-changelog, changesets or plain version headings).
- Notes from the commits since the previous tag when there's no changelog section, grouped by Conventional Commits type, with `BREAKING CHANGE:` footers as migration steps.
- Breaking changes listed first with their migration steps, then each change once under its type.
- Fills in the GitHub release body (`replace`, `append`, `prepend` or `keep`), or creates the release on a tag push.
- Job summary, and outputs for the notes, a notes file, JSON, the version and breaking-change counts.
- Works from a full checkout (local git) or with no checkout at all (GitHub API).
