# Server package

Run from repository root:

```bash
npm run dev:server
```

The server listens on `HOST:PORT`, exposes HTTP API and WebSocket `/ws`, stores match logs under `LOG_DIR`, and serves `client/dist` in production.
