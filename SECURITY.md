# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting: on this repository's **Security** tab,
choose **Report a vulnerability**. Say what you found, how to reproduce it, and what it lets someone do.

You can expect an answer that the report was received, and then a fix or an explanation.

## What matters most here

The Crew runs a small server on the user's own computer that can install software, run a coding agent and write to a
repository. The things it is built to hold are:

| The runner must | How |
|---|---|
| Answer only this machine | It listens on `127.0.0.1`. The phone link is the one exception: off by default, paired by a code shown on the computer, over TLS with a certificate made on that computer |
| Not be driven by another website | The pages are served by the runner, so they share its origin. A site the app was fetched from may only ask `GET /api/hello` and `POST /api/shutdown` |
| Run only what was published | The launcher fetches by `manifest.json` and refuses to write or start any file whose SHA-256 does not match |
| Never keep a credential | A GitHub sign-in is passed to `git` for one command, in that command's environment. Claude Code's sign-in is Claude Code's own |
| Never install by surprise | Each install is listed with its command before the button that runs it, and nothing asks for a password |
| Serve nothing private | The runner's code, its state, the bundle and every dotfile are never served as pages |

A way round any of these is a vulnerability, and so is anything that lets a model's output run a command the user did not ask
for.

## What is not a vulnerability

- **The plan check.** A plan is checked on the user's own machine, with no server. It stops casual copying, not someone who
  edits the app. That is by design.
- **A model saying something wrong.** Report it as an ordinary issue, with the request and the reply.

## Secrets and this repository

The repository holds no secret. Two things are made on a machine and must stay off it:

- `src/.runner/`: the app's own state when run from source (sign-ins, a key for the phone link, the team's work folders).
- `src/android/*.keystore`: the Android app's signing key. A phone accepts an update only from the key that signed the copy it
  has, so a published key would let anyone sign one.

Both are in `.gitignore`. If either was ever committed, treat the key as lost and make a new one.
