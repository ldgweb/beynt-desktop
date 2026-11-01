# Security

Beynt desktop puts the commands of your Beynt stacks on your clipboard, ready to
paste into a terminal or a database client. Read a command before running it, and
use stacks that only people you trust can write to, as you would with a repository.

## Reporting vulnerabilities

Use **Security → Report a vulnerability** on the GitHub repository when private
reporting is enabled. If it is unavailable, ask the maintainer for a private
contact channel without including vulnerability details in a public issue.
Never attach access keys, tokens, private keys or the contents of private stacks.

Include the app version, operating system, reproduction steps using synthetic
data, and the expected and actual behavior. No response-time guarantee is offered.

## Before publishing a fork or contributing

- Keep `.env` files, local profiles, databases and private keys out of Git.
- Scan both the candidate source tree and Git history for secrets. Ignore rules
  do not remove files that were already committed.
- Revoke and rotate any exposed credentials before addressing Git history.
- Run the checks in [CONTRIBUTING.md](CONTRIBUTING.md). Dependency and secret
  scanners complement review; passing them is not a security certification.
- A fork that publishes its own releases needs its own update key: generate one,
  keep the private key in the fork's secrets, and replace `plugins.updater` in
  `src-tauri/tauri.conf.json` (public key and endpoint). Otherwise apps installed
  from the fork would look for updates in this repository.

Repository owners should enable private vulnerability reporting and secret
scanning where available. These are GitHub settings, not settings this project
can enable from its source files.
