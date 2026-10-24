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
- Your data stays in your computer's data folder, never in the program folder or in git.
- API keys go to the system's credential store, never to the browser or to plain files.
- The Cerebro never sees the password or token of your AI subscription: it runs the
  provider's official tool, where you logged in yourself.
