// run-here.mjs - WHAT "RUN HERE" MAY RUN. A reply in Developer may carry a command, and the customer may press to have it run in the
// connected workspace. The page decides which commands get the button; this decides again, in the runner, because a page is never
// trusted with what may run on the machine. A command is run only when it reads or tests, and has nothing in it that a shell
// would act on, that changes the repository, that reaches off the machine, or that points outside the workspace.
// what "Run here" may run: a command that only reads or tests, with nothing in it a shell would act on
export const RUN_READS =
  /^(git (status|log|diff|show|branch|remote -v|rev-parse|blame)\b|ls\b|cat\b|grep\b|rg\b|node --version|npm (test|run (test|lint|build|check|typecheck)\b|ls)|npx (playwright test|tsc|eslint|prettier --check|vitest|jest)\b|pnpm (test|lint)|yarn (test|lint)|pytest\b|python3? -m pytest\b|make (test|check|lint)\b|cargo (test|check|clippy)\b|go (test|vet)\b|flutter (test|analyze)\b|dart (test|analyze)\b|tsc\b|eslint\b|jest\b|vitest\b)/;
export const RUN_NEVER =
  /--force\b|--force-with-lease|\s-f\b|reset --hard|\brm\b|\bdrop (table|database)\b|\bchmod\b|\bchown\b|--no-verify|\bsudo\b|[;&|`$<>\n\r]|\bcurl\b|\bdocker\b|\bkubectl\b|\bgit (push|checkout|clean|stash|merge|rebase|commit|add|reset|revert|pull|fetch|switch|restore|tag)\b|\bpublish\b|\binstall\b|\bsed -i\b|\.\.\/|^\/|\s\/(?!\/)|~/i;
export const runRefusal = (cmd) =>
  !cmd
    ? 'There is no command to run.'
    : RUN_NEVER.test(cmd)
      ? 'That command could change things or reach outside the workspace, so it is not run from here. Copy it and run it yourself.'
      : !RUN_READS.test(cmd)
        ? 'Only commands that read or test are run from here. Copy it and run it yourself.'
        : '';
