# Publishing

Publishing The Crew means making one folder and putting it at an address. This page is for whoever does that.

## The bundle

```bash
npm run bundle           # node tools/bundle.mjs  ->  dist/
```

`dist/` holds everything the product needs, so one address serves all of it:

| In `dist/` | What it is |
|---|---|
| The pages, `css/`, `js/` | What a visitor's browser loads |
| `server.mjs`, `runner/` | The part that runs on the user's own machine |
| `myfamilyoffice.sh`, `myfamilyoffice.mjs` | The one command: find or fetch Node.js, fetch the app by the manifest, start it |
| `android/familyoffice.apk` | The Android app, when it has been built |
| `manifest.json` | Every file with its SHA-256. The version is a hash of that list |

Left out on purpose: the owner's panel, the Android source and its signing key, the tests, and this machine's own state.

The bundle is **refused** if any page uses a root-absolute path (`/js/app.js`), because the same folder has to work at the root
of an address (`name.eth.limo/`) and under a subpath (a gateway's `/ipfs/<cid>/`). It is rebuilt, never edited.

Because the version is the content, the same files always give the same version, the same manifest and the same IPFS address.

## Trying it as a visitor would

```bash
npm run bundle && npm run gateway
```

The gateway serves `dist/` and nothing else on <http://localhost:5300/>, the way an IPFS gateway or any static host would: no
`/api/`, no runner. Open it, press Start, and run the command it shows. (Opening `dist/index.html` from the disk is not a test:
browsers refuse module scripts and `fetch` on `file://` pages.)

On its default port the gateway also starts the app from source on port 5220, which is the only place the owner's panel
exists. `GATEWAY_NO_OWNER=1` turns that off.

## What a visitor runs

```bash
curl -fsSL https://<the site>/myfamilyoffice.sh | sh -s https://<the site>/
```

The address in it is the page's own, so it is right wherever the bundle is served from. What it does, and nothing else:

1. Looks for Node.js 22.19 or newer. If there is none it fetches Node's own build into `~/.familyoffice/node` and checks it
   against the checksum Node publishes. No password, no change to `PATH` or to a Node already on the machine.
2. Reads the site's `manifest.json` and fetches the files this machine does not have into `~/.familyoffice/app`.
3. Refuses to write or start anything if a file does not match the list.
4. Starts `server.mjs` on `127.0.0.1` (5210, or the next free port) and opens it in the browser.

Run again with `sh ~/.familyoffice/app/myfamilyoffice.sh`: it checks the site for a newer copy, and starts the installed one
if the site cannot be reached. State is in `~/.familyoffice/state`, apart from the app, so an update never touches it.

**The names in `dist/` are a contract.** Installed copies fetch `manifest.json`, start `server.mjs` and are started by
`myfamilyoffice.sh`. Renaming any of those breaks every copy already installed.

## The publisher's own values

What a publisher sets belongs to them, not to the repository: whether plans are enforced, the lock's address, the access codes,
the GitHub Client ID, the Remote switch, the landing page's readings. The source carries neutral values (plans not enforced, no
lock, no codes, no Client ID). A publisher's own are kept in `.owner/`, which git never sees:

```
.owner/billing.js   .owner/github.js   .owner/product.js   .owner/pulse.js
```

Each is a copy of the file of the same name under `src/js/`, with the publisher's values in it. To begin, copy the four files
there. From then on:

- `npm run owner` runs the app from source with those values (`FO_OWNER_DIR=.owner`), and the owner's panel edits them there.
- `npm run bundle` puts them into `dist/` in place of the neutral ones, and says so. `FO_NO_OWNER=1` builds without them.
- `tools/make-code.mjs` writes to `.owner/billing.js` when it exists.

With no `.owner/` folder everything works from the source as it is: every feature open, and GitHub reached through the `gh`
command already on the machine.

## The owner's panel

`http://127.0.0.1:<port>/owner.html`, only when the app runs from source. Each card is one job:

| Card | What it does |
|---|---|
| Billing | Whether plans are enforced |
| Locks | The Unlock Protocol lock behind the paid tier |
| Codes | Access codes: made here, shown once, kept only as a slow salted hash |
| Check a wallet | What plan a wallet holds, read from the chain |
| GitHub sign-in | The public Client ID of the GitHub app the device flow uses |
| Remote tab | Whether this version shows Remote |
| Bundle and checks | Adds the day's reading to the landing page, builds the bundle, runs the self-test |
| Publish the bundle | Builds, pins `dist/` to IPFS through Pinata, and asks your wallet to point an ENS name at it |

Publishing from the panel signs nothing itself: the one transaction (the name's content hash) is confirmed in your wallet. The
Pinata key is a secret. It is kept in the app's state folder with owner-only permissions, never written to the source or the
bundle, and never sent back to the page. Publishing has been proven against stand-ins only.

### The same jobs from a terminal

```bash
node tools/make-code.mjs --tier pro --days 30 --label launch     # an access code, shown once
node tools/make-code.mjs --list                                  # labels and terms, never codes
node tools/pulse.mjs add date=2026-11-18 proofsDay=3104 ...      # a dated reading for the landing page
```

Both edit a file under `src/js/` (`billing.js`, `pulse.js`); build the bundle and publish afterwards.

## Plans

The tiers are in `src/js/billing.js`: **Free** (a team on your own Claude Code) and **Pro** (local models, set up for you or
already running, here or on your other machines).

A plan is a key on a lock. The paid tier is an [Unlock Protocol](https://unlock-protocol.com/) lock on Base; a customer buys a
key on Unlock's own checkout, prepaid in USDC, and the key is a non-transferable token in their wallet. The app never handles
a payment. The runner checks two things, with no server and no secret: that the wallet signed a plain message naming this
machine, and that the wallet holds a valid key on the lock, read through public Base endpoints. A good reading is kept for two
weeks so that a machine that is offline keeps its plan that long.

It is a check on the customer's own machine. It stops casual copying, not someone who edits the app.

## The Android app

```bash
node src/android/build.mjs       # -> src/android/familyoffice.apk
```

It needs the Android SDK and a JDK, and uses the SDK's own tools: no Gradle, no library. The app is a WebView on the user's own
runner, reached over the phone link.

**The signing key.** The first build makes `src/android/debug.keystore`. A phone accepts an update only from the key that
signed the copy it has, so keep that file, back it up, and never commit it (`.gitignore` leaves it out). The Play Store wants a
key of its own.

## Before the first real release

None of these has run outside a stand-in, and each is the publisher's own act:

- one publish: a bundle built, pinned, and a name pointed at it
- one purchase of a plan on Base
- the Android app on a real phone
