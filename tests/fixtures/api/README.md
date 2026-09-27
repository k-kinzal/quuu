# External API v1

`v1.bin` is the pinned Buf descriptor image of the first external gRPC contract.
`npm run api:check` compares the current protocol with this independent baseline.
Do not replace it to make a breaking change pass. Use a new protocol version when
compatibility cannot be retained.

`apps/mac/tests/servers.test.ts` also sends fixed v1 protobuf bytes directly through
the generated gRPC client, bypasses client validation to check server validation,
and exercises the official MCP SDK consumer and built CLI against real listeners.
