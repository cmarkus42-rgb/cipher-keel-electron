# Security Policy

## Supported versions

cipher keel is pre-alpha. There is no tagged release and no packaged build; only `main`
exists. Security reports are accepted against `main` as it currently stands — there is no
older version to back-port a fix to.

## Reporting a vulnerability

Please use GitHub's **Private Vulnerability Reporting** for this repository, under
**Security → Report a vulnerability**:

<https://github.com/cmarkus42-rgb/cipher-keel-electron/security/advisories/new>

This opens a private advisory visible only to the maintainer and does not require you to
share an email address in the clear. **Please do not open a public issue for a suspected
security vulnerability** — a public repository is exactly the setting where a public
report becomes a disclosure before there is a fix.

### Response time

This is a one-person project maintained outside of working hours. There is no SLA and no
credible 24-hour commitment to offer. Best effort, typically within a week — you will get
an acknowledgement and, if the report is valid, a fix or a mitigation plan.

## Scope

cipher keel is a local desktop application: it runs coding-CLI processes on your machine
inside tmux sessions and stores credentials (e.g. GitHub tokens) in the macOS Keychain
rather than in plaintext on disk. Things worth reporting privately as security issues
include, for example: a credential written to disk unencrypted, a command-injection path
through session or IPC input, a Keychain item readable by processes that shouldn't have
access, or a path-traversal issue reaching files outside a project's working tree.

Things that are configuration rather than a vulnerability: the app running arbitrary
commands you or a connected coding CLI explicitly asked it to run, or the tmux sessions
and their contents being visible to other processes running as your own local user — that
is the trust boundary of a local developer tool, not a flaw in it. If you are unsure which
side of that line a finding falls on, report it anyway and let the triage sort it out.
