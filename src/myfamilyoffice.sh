#!/bin/sh
# myfamilyoffice.sh - the one command that starts Family Office on your own machine. Nothing has to be installed first.
#   curl -fsSL https://<the site>/myfamilyoffice.sh | sh -s https://<the site>/
#   sh ~/.familyoffice/app/myfamilyoffice.sh            (any time after that)
# What it does, in order, and nothing else:
#   1. finds Node.js 22.19 or newer on this machine. If there is none, it fetches Node's own build from nodejs.org into
#      ~/.familyoffice/node and checks it against the checksum Node publishes beside it. No password, no Homebrew, and nothing
#      outside ~/.familyoffice is touched: not your PATH, not a Node you already have.
#   2. hands over to myfamilyoffice.mjs, which fetches the app from the site, checks every file against the site's list, starts it
#      on 127.0.0.1 and opens it in your browser.
# Everything else (a model engine, the agent, Claude Code) is installed later by the app, each only when you press its button.
# The checksum in step 1 comes from the same server as the download: it catches a broken or cut-off download, not a compromised nodejs.org.
set -eu

main() {
  SITE="${1:-}"
  HOME_DIR="${FO_HOME:-$HOME/.familyoffice}"
  PRIV="$HOME_DIR/node"
  AFTER=0   # lines said since the banner was drawn
  say() { AFTER=$((AFTER + 1)); printf 'Family Office: %s\n' "$1"; }
  die() { printf 'Family Office: %s\n' "$1" >&2; exit 1; }

  # THE BANNER. Drawn only on a real terminal, in plain ASCII (so it is the same in every font and every locale), and in the size
  # that fits the terminal's width at that moment: the house beside the name (60 columns or more), the house over the name (24 or
  # more), the name alone (14 or more), or nothing. No line is ever as wide as the terminal, so none can wrap. Colour only where
  # the terminal has it and NO_COLOR is not set. If the terminal is resized while the banner is still the last thing on the screen,
  # it is drawn again in the size that fits now. Nothing is drawn into a pipe or a file, for TERM=dumb, or with FO_NO_ART set.
  cols() {
    c="$( (stty size </dev/tty) 2>/dev/null | cut -d' ' -f2)"   # the terminal itself: under "curl | sh" standard input is the pipe
    [ -n "$c" ] || c="$(tput cols 2>/dev/null || true)"
    [ -n "$c" ] || c="${COLUMNS:-}"
    case "$c" in ''|*[!0-9]*) c=80 ;; esac
    [ "$c" -gt 0 ] || c=80
    printf '%s' "$c"
  }
  ART_LENS=""   # the width of each line of the banner as it was drawn: what a redraw has to clear
  put() { ART_LENS="$ART_LENS ${#1}"; printf '%s%s%s\n' "$2" "$1" "$Z"; }
  banner() {
    ART_LENS=""
    [ -t 1 ] || return 0
    [ "${TERM:-dumb}" != dumb ] || return 0
    [ -z "${FO_NO_ART:-}" ] || return 0
    W="$(cols)"; G=""; D=""; Z=""
    if [ -z "${NO_COLOR:-}" ]; then
      n="$(tput colors 2>/dev/null || true)"; case "$n" in ''|*[!0-9]*) n=0 ;; esac
      if [ "$n" -ge 8 ]; then G="$(printf '\033[32m')"; D="$(printf '\033[2m')"; Z="$(printf '\033[0m')"; fi
    fi
    if [ "$W" -ge 60 ]; then
      put '' ''
      put '       ____/\____' "$G"
      put '      /__________\         F A M I L Y   O F F I C E' "$G"
      put '       ||  ||  ||' "$G"
      put '       ||  ||  ||          Your team, on your own machine.' "$G"
      put '      _||__||__||_' "$G"
      put '     |____________|' "$G"
      put '' ''
    elif [ "$W" -ge 24 ]; then
      put '' ''
      put '     ____/\____' "$G"
      put '    /__________\' "$G"
      put '     ||  ||  ||' "$G"
      put '    _||__||__||_' "$G"
      put '   |____________|' "$G"
      put '' ''
      put '    Family Office' "$G"
      put '' ''
    elif [ "$W" -ge 14 ]; then
      put 'Family Office' "$G"
    fi
  }
  # RESIZED. Only while nothing has been said since the banner: then the rows it takes on the screen are known (a terminal that
  # wraps a line again when it narrows gives a line of n characters one row for every W of them), and it can be cleared and drawn
  # again. Once a line has been said under it, or the app has been handed over to, it is left as the terminal shows it.
  redraw() {
    [ -n "$ART_LENS" ] && [ "$AFTER" -eq 0 ] || return 0
    W="$(cols)"; rows=0
    for len in $ART_LENS; do if [ "$len" -le "$W" ]; then rows=$((rows + 1)); else rows=$((rows + (len + W - 1) / W)); fi; done
    printf '\033[%sA\r\033[J' "$rows"
    banner
  }
  banner
  trap 'redraw || true' WINCH 2>/dev/null || true
  # for the check of the banner (tests/runner/banner.mjs): draw it and stop, or draw it and wait to be resized
  if [ "${FO_BANNER:-}" = only ]; then exit 0; fi
  if [ "${FO_BANNER:-}" = hold ]; then i=0; while [ "$i" -lt 40 ]; do sleep 0.1; i=$((i + 1)); done; exit 0; fi
  fits() { "$1" -e 'var v=process.versions.node.split(".").map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=19)?0:1)' >/dev/null 2>&1; }

  if [ -n "$SITE" ]; then
    host="${SITE#*://}"; host="${host%%/*}"; host="${host%%:*}"
    case "$SITE" in
      https://*) ;;
      http://*) case "$host" in localhost|127.0.0.1|*.localhost) ;; *) die "the app is only fetched over https (or from this machine): $SITE" ;; esac ;;   # a name under .localhost is always this machine
      *) die "the app is only fetched over https (or from this machine): $SITE" ;;
    esac
    case "$SITE" in */) ;; *) SITE="$SITE/" ;; esac
  fi
  command -v curl >/dev/null 2>&1 || die "this needs curl, which was not found on this machine."
  mkdir -p "$HOME_DIR"

  install_node() {
    case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) die "no Node.js 22.19 or newer was found, and this script cannot fetch one for this system. Install it from https://nodejs.org and run the command again." ;; esac
    case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) die "no Node.js 22.19 or newer was found, and Node has no build this script knows for this processor. Install it from https://nodejs.org and run the command again." ;; esac
    # a Terminal opened under Rosetta says x86_64 on an Apple silicon Mac: ask the machine, not the shell
    if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; fi
    dist="${FO_NODE_DIST:-https://nodejs.org/dist/latest-v22.x}"
    tmp="$HOME_DIR/tmp"; rm -rf "$tmp"; mkdir -p "$tmp/node"
    say "no Node.js 22.19 or newer on this machine, so fetching a private copy from $dist (about 45 MB). Nothing outside $HOME_DIR is changed."
    curl -fsSL "$dist/SHASUMS256.txt" -o "$tmp/sums" || die "could not reach $dist."
    line="$(grep -E " node-v[0-9.]+-$os-$arch\.tar\.gz\$" "$tmp/sums" | head -n 1)"
    [ -n "$line" ] || die "Node's list has no build for $os $arch."
    want="${line%% *}"; name="${line##* }"
    curl -fSL --progress-bar "$dist/$name" -o "$tmp/$name" || die "the Node.js download failed."
    if command -v shasum >/dev/null 2>&1; then got="$(shasum -a 256 "$tmp/$name" | cut -d' ' -f1)"; else got="$(sha256sum "$tmp/$name" | cut -d' ' -f1)"; fi
    [ "$got" = "$want" ] || { rm -rf "$tmp"; die "the Node.js download does not match Node's published checksum. Nothing was installed."; }
    tar -xzf "$tmp/$name" -C "$tmp/node" --strip-components 1 || die "the Node.js download could not be unpacked."
    "$tmp/node/bin/node" -v >/dev/null 2>&1 || { rm -rf "$tmp"; die "the fetched Node.js does not run on this machine."; }
    rm -rf "$PRIV"; mv "$tmp/node" "$PRIV"; rm -rf "$tmp"
    say "Node.js $("$PRIV/bin/node" -v) is in $PRIV, for this app only."
  }

  NODE=""
  if [ -x "$PRIV/bin/node" ] && "$PRIV/bin/node" -v >/dev/null 2>&1; then NODE="$PRIV/bin/node"; fi   # the copy this script fetched before
  # On an Apple silicon Mac a Node.js built for it is taken first. One built for Intel runs there too (under Rosetta), but everything
  # it starts would then run as an Intel program, and the model engine does not. So: a native one if there is one, else any that fits.
  WANT=""; if [ "$(uname -s)" = Darwin ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then WANT=arm64; fi
  native() { [ -z "$WANT" ] || [ "$("$1" -p process.arch 2>/dev/null)" = "$WANT" ]; }
  if [ -z "$NODE" ] && [ "${FO_OWN_NODE:-}" != "1" ]; then
    for pass in native any; do
      for c in "$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/v*/bin/node; do
        if [ -n "$c" ] && [ -x "$c" ] && fits "$c" && { [ "$pass" = any ] || native "$c"; }; then NODE="$c"; break 2; fi
      done
    done
  fi
  if [ -z "$NODE" ]; then install_node; NODE="$PRIV/bin/node"; fi

  if [ -n "$SITE" ]; then
    if curl -fsSL "${SITE}myfamilyoffice.mjs" -o "$HOME_DIR/myfamilyoffice.mjs.part"; then mv "$HOME_DIR/myfamilyoffice.mjs.part" "$HOME_DIR/myfamilyoffice.mjs"; exec "$NODE" "$HOME_DIR/myfamilyoffice.mjs" "$SITE"; fi
    rm -f "$HOME_DIR/myfamilyoffice.mjs.part"
    [ -f "$HOME_DIR/app/myfamilyoffice.mjs" ] || die "could not reach $SITE."
    say "could not reach $SITE. Starting the copy already on this machine."
  fi
  [ -f "$HOME_DIR/app/myfamilyoffice.mjs" ] || die "say where the app comes from: sh myfamilyoffice.sh https://<the site>/"
  exec "$NODE" "$HOME_DIR/app/myfamilyoffice.mjs"
}
main "$@"   # the last line on purpose: a download that was cut off part-way runs nothing
