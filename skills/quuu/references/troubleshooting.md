# Troubleshooting

## The CLI cannot connect

- Quuu must be running. `quuu servers status` (when it answers) shows each listener and its
  binding error.
- **Settings → Connections → CLI and HTTP clients** must be on (`httpEnabled`). If it is off,
  only the desktop app or an MCP client can turn it back on - ask the human.
- `QUUU_CONNECTION_FILE` selects another instance, `QUUU_USER_DATA` its data directory,
  `QUUU_URL` + `QUUU_TOKEN` override discovery together.
- The CLI needs Node.js 22.12+. The launcher inside the app falls back to Quuu's own runtime when
  `node` is missing.

## Exit codes

- `1`: the operation failed. The message carries Quuu's reason. Do not repeat a failed
  mutation automatically; read the reason and decide.
- `2` from `tasks run` / `tasks send`: accepted, but the immediate action could not proceed
  (Limit, busy slot, unmet dependency). The JSON says why.

## Operations that need a person at the Mac

- `system pick-directory`, `system pick-application`, `system confirm`, `system popup-menu`
  open dialogs or menus on the Mac and wait for a click.
- `settings create-git-hub-app` finishes in the browser.
- `report show`, `review open-pull-request` draw inside the window.
- `terminal open` / `input` / `close` belong to one connection: use `quuu stream` (JSONL
  requests `{ "id": 1, "operation": "terminal.open", "input": {…} }` on stdin) to keep them.

Prefer the headless alternatives (`--query` over `snapshot`, `report get`, explicit paths).

## MCP

`quuu config` prints the MCP endpoint and bearer token. Keep the token private - never paste
it into reports or files. MCP tools are named `tasks_create`, `logs_page`, …; object inputs use
their schema directly, scalar inputs use `{ "input": "ID" }`, no-input tools `{}`. Pick a fixed
MCP port in settings for a client that saves its configuration.
