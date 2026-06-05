# Hearing test

App provides a tool to test each ear individualy after calibrating on 0ne specific frequency.

Read the ARCHITECTURE.md for more background.

We also have a TODO.md managed by the user and agent.

## Tools usage

Next to read/write/edit you can use

- `deno check`
- `git status`

The user runs other `deno task` to test new code.

## TODO

- when fixed a todo from the `Open` section mark it done and move it into the `Done` section
- when user say next todo make sure to reread the todo file
- when fixed a todo make sure to increment the version number `const APP_VERSION = "0.1.1";` in `main.js` and also update `?v=` in `index.html`'s script tag. Then tell the user the new version number.
- when user replies with "not working" asked for the current version number.

## Code

- code is in git versions control.
- before changing code make sure `git status` is clean. If not stop working and ask user what to do with the uncommited changes.
