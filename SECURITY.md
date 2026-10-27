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
  gives that browser a session cookie (HttpOnly, SameSite=Lax, as GitHub and Google use, so a
  link from another app still opens the Cerebro). The server keeps only hashes of keys and
  sessions.
- Requests whose Host is not this computer are refused (DNS rebinding), and so is any request
  that changes something without an Origin of the Cerebro itself (CSRF). The only other name let
  in is the address of your own domain, and only after you turn remote access on, on the computer.
- Remote access goes through a Cloudflare Tunnel that cloudflared opens from the computer (no
  port is opened on the router; HTTPS to Cloudflare, which ends the encryption there and passes
  the request on through the tunnel). The tunnel sends only your address to the Cerebro. The
  address can be reached from the internet, but it shows only the locked screen: a phone enters
  with a one-time pairing code (5 minutes) shown on the computer, and every device is listed with
  when it was last seen and can be revoked at once. The tunnel's secret and settings stay in the
  data folder; it is turned on and off only on the computer.
- The installed app (PWA) keeps only an offline page on the device; your data always stays on the
  computer.
- Your data stays in your computer's data folder, never in the program folder or in git.
- Each neuron's application runs isolated: a sandboxed frame with an opaque origin and a strict
  Content-Security-Policy (no cookies, no storage, no network), served by a short-lived signed link.
  It may only hand you files it made itself (downloads), and use the libraries of the kit.
  It talks to the Cerebro only through a message bridge that reaches its own data and, through the
  contract, only what you allowed other neurons to share. Only you change permissions.
- Building a neuron gives the AI files only: it works in a draft folder of its own, with file
  tools and nothing else (no commands, no internet, none of your own settings). The draft becomes
  the neuron's application only after the Cerebro checks it (an `index.html`, only the kinds of
  file it serves, no links, size limits); a failed or stopped build leaves nothing.
- Researching a feature to copy, the AI has only the research tools: the Navegador and the tools
  that record what it found. No files, no commands. The Navegador is the Edge or Chrome already on
  the computer, with no window and a new, empty profile each time (none of your accounts, cookies
  or passwords), no downloads and no service workers. Every connection it makes goes through a
  proxy of the Cerebro that resolves each name itself and connects only to public addresses:
  this computer, the home network, cloud metadata and the tailnet are refused, also after a
  redirect and against DNS rebinding. What pages say reaches the AI marked as third-party
  content, never as instructions. Each research has a page limit, and the sites it opened are
  shown in the plan.
- A copy's answer key runs in a page with no network at all; the expected values come from the
  research, never from the code being checked.
- API keys go to the system's credential store (Windows Credential Manager, macOS Keychain,
  Secret Service on Linux), never to the browser or to plain files. Without a store, nothing is
  saved.
- The Cerebro never sees the password or token of your AI subscription: it runs the
  provider's official tool, where you logged in yourself.
