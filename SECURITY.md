# Security

The Cerebro runs on your computer and can run code there, so security is part of the design
from the first phase.

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
(**Security → Report a vulnerability** in this repository). You will get an answer within
7 days. Once a fix is out, the report is published with credit, if you want it.

## What the Cerebro promises

- The server listens only on `127.0.0.1`.
- Only whoever started the Cerebro gets in: the terminal shows a one-time link (15 minutes) that
  gives that browser a session cookie (HttpOnly, SameSite=Strict). The server keeps only hashes
  of keys and sessions.
- Requests whose Host is not this computer are refused (DNS rebinding), and so is any request
  that changes something without an Origin of the Cerebro itself (CSRF).
- Your data stays in your computer's data folder, never in the program folder or in git.
- Each neuron's application runs isolated: a sandboxed frame with an opaque origin and a strict
  Content-Security-Policy (no cookies, no storage, no network), served by a short-lived signed link.
  It talks to the Cerebro only through a message bridge that reaches its own data and, through the
  contract, only what you allowed other neurons to share. Only you change permissions.
- Building a neuron gives the AI files only: it works in a draft folder of its own, with file
  tools and nothing else (no commands, no internet, none of your own settings). The draft becomes
  the neuron's application only after the Cerebro checks it (an `index.html`, only the kinds of
  file it serves, no links, size limits); a failed or stopped build leaves nothing.
- API keys go to the system's credential store (Windows Credential Manager, macOS Keychain,
  Secret Service on Linux), never to the browser or to plain files. Without a store, nothing is
  saved.
- The Cerebro never sees the password or token of your AI subscription: it runs the
  provider's official tool, where you logged in yourself.
