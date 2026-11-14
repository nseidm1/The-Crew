#!/bin/sh
# fake-install.sh - a TEST DOUBLE for TensorFold's installer: it puts the fake engine where the real installer puts the real one.
# Used only when FO_INSTALL_SH points at it.
set -eu
[ "${TENSORFOLD_NO_MODIFY_PATH:-0}" = 1 ] || { echo 'the runner must not let the installer touch the shell profile' >&2; exit 3; }
# like the real installer under Rosetta: it refuses an Intel shell (the stand-in for arch marks what it starts as native)
if [ "${FO_FAKE_NEEDS_NATIVE:-0}" = 1 ] && [ "${FO_FAKE_NATIVE:-0}" != 1 ]; then echo 'TensorFold: TensorFold native requires Apple Silicon on macOS.' >&2; exit 1; fi
mkdir -p "$TENSORFOLD_INSTALL_DIR/bin"
ln -sf "$FO_FAKE_TF" "$TENSORFOLD_INSTALL_DIR/bin/tensorfold"
echo "Installed TensorFold (test double) under $TENSORFOLD_INSTALL_DIR"
