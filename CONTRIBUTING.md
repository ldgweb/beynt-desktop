# Contributing

Use Node.js 22.12 or newer and stable Rust (on Linux, the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)). Install the versions recorded in
the lockfiles and run the checks:

```sh
npm ci
npm run build
npm test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm audit --audit-level=high
```

The project `.npmrc` disables dependency install scripts. `npm run build` comes before the Rust tests:
the app embeds `dist/`. The Rust tests run the library sync and the key check against a fake Beynt
API on 127.0.0.1 (`src-tauri/src/fake_beynt.rs`): extend them when the app reads Beynt differently.

Do not include real credentials, access keys or private file contents in fixtures or screenshots.
See [SECURITY.md](SECURITY.md) for vulnerability reporting.

Keep privileged work on the Rust side and expose narrow, validated commands to the page
(`src/api.ts`). See the [architecture overview](README.md#architecture) and the build commands in
the README.

Describe the behavior changed and the checks run in each pull request. Avoid unrelated rewrites or
version bumps. Windows is where the app is used every day; say on which systems you tried a change,
since window, menu, shortcut and tray changes behave differently on macOS and Linux.

The CI workflow builds and tests on Windows and Linux. The release workflow runs on version tags,
builds the installers on Windows, macOS and Linux, signs the update files with the key in the
repository's secrets, and attaches them with `latest.json` (`scripts/latest-json.mjs`) to a draft
release; it never publishes one. Never commit a private signing key: only the public one belongs in
`src-tauri/tauri.conf.json`.
