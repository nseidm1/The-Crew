#!/bin/bash
# fake-claude-install.sh - a TEST DOUBLE for Anthropic's installer: it puts the Claude stand-in where the test expects the CLI.
# Used only when FO_CLAUDE_INSTALL_SH points at it.
set -eu
mkdir -p "$(dirname "$FO_CLAUDE_TARGET")"
ln -sf "$FO_FAKE_CLAUDE" "$FO_CLAUDE_TARGET"
echo "Claude Code (test double) installed at $FO_CLAUDE_TARGET"
