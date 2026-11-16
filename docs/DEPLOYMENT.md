# Deployment

[简体中文](DEPLOYMENT.zh-CN.md) · [Back to README](../README.md)

## Configuration and runtime files

Copy [config.yaml.example](../config.yaml.example) to `config.yaml` and edit it before running. The server loads this file once at startup; changes require a restart. Pass `--config /absolute/path/config.yaml` when the service's working directory differs from the repository.

Passwords accept plaintext or valid `$2a$`, `$2b$`, and `$2y$` bcrypt hashes. Plaintext passwords are hashed in memory without rewriting the configuration. JWT expiry is fixed at login; activity does not renew it. The browser idle timer uses the same configured duration, and terminal sessions close when the JWT expires.

Scalar environment overrides include:

```text
OPSNEXUS_SERVER_ADDRESS
OPSNEXUS_BASE_PATH
OPSNEXUS_LOG_LEVEL
OPSNEXUS_SECURITY_JWT_SECRET
OPSNEXUS_SECURITY_SESSION_TIMEOUT_MINUTES
```

Administrator and asset lists are read from YAML. Keep real credentials and private keys outside version control. SSH key paths are relative to the process working directory unless absolute. Asset responses omit passwords, private-key paths, and MongoDB URIs; HTTP access logs omit query strings.

Database-specific settings:

| Type | Notes |
| --- | --- |
| MySQL | `database` selects the default database |
| DM | `database` selects the schema, such as `SYSDBA` |
| Redis | `database` is a nonnegative logical DB number; `user` can specify an ACL username |
| MongoDB | Use `uri` for replicas, TLS, or `authSource`, or configure `host/port/user/password/database` |

Optional mongosh is discovered in `./bin/mongosh` (`mongosh.exe` on Windows) or PATH. It executes with the server process's OS permissions. SSH currently does not verify host fingerprints. These behaviors assume the documented trusted internal environment.

## Build and run

```bash
make all
./opsnexus --config config.yaml
```

The frontend must be built before compiling or testing Go code because `web/embed.go` embeds `web/dist`. `make all`, `make build-server`, and `build.sh` enforce this ordering. For a backend-only rebuild after an unchanged frontend has been built:

```bash
go build -trimpath -o opsnexus ./cmd/server
```

`./build.sh` produces Linux amd64, Linux arm64, and Windows amd64 binaries under `dist/`. Cross-compilation is not a substitute for runtime validation on a target OS. `make clean` removes generated output; rebuild the frontend before the next Go build or test.

## Subpaths and Nginx

The backend and frontend must use the same URL prefix:

```yaml
base_path: /devops
server_address: 127.0.0.1:9090
```

```bash
VITE_BASE_PATH=/devops/ ./build.sh
./dist/opsnexus-linux-amd64 --config config.yaml
```

Place `map` inside Nginx's `http` context. This HTTP example can also be used inside an existing TLS deployment; it does not configure certificates:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name your-internal-host;

    location = /devops { return 301 /devops/; }

    location ^~ /devops/ {
        proxy_pass http://127.0.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        client_max_body_size 128m;
    }
}
```

Keep `proxy_pass` without a trailing slash to preserve `/devops`. Preserve the browser-facing `Host`, including its port, for the WebSocket origin check. Disable buffering for SQL's POST + SSE response. The example caps uploads at 128 MB; adjust this for your environment. For root deployment use `base_path: ""`, build without `VITE_BASE_PATH`, and use `location /` without the `/devops` redirect.

## Operation semantics

- **SQL:** the UI defaults to stopping and rolling back on error. Disabling the option continues the batch and attempts to commit successful statements. DDL may implicitly commit. If the final transaction event is missing, verify the database state before retrying. The splitter supports ordinary semicolon-separated statements, not client `DELIMITER` scripts or stored-procedure blocks.
- **Redis:** String values preserve their text. Hash edits merge supplied fields; fields outside the preview remain untouched. TTL `-1` or `0` persists a key; positive values set expiry in seconds. The console runs one command per request and does not support stateful transactions or subscriptions.
- **MongoDB:** native scripts accept `db.collection.method(...)` with strict JSON/Extended JSON arguments, plus `db.getCollectionNames()`. Use mongosh for chaining, loops, and variables. Queries/aggregations return at most 1000 documents; shell execution has a 10-second timeout and a 1 MiB output cap.
- **SFTP:** open the asset's terminal first to establish the SSH connection. Creating a new file fails if its name exists; uploading to an existing path overwrites it. Directory deletion supports empty directories.
- **Shutdown:** SIGINT/SIGTERM allows up to 10 seconds for HTTP shutdown, then closes cached SSH, Redis, and MongoDB connections. Reconnect terminals after a restart.

See the [architecture reference](ARCHITECTURE.md#数据正确性和限额) for all current limits. Row/document limits do not cap the total bytes of large field values.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `pattern dist/*: no matching files found` | Run `make build-web` before compiling or testing Go |
| Blank page, missing workers, or asset 404s | Match build-time `VITE_BASE_PATH` to runtime `base_path`, then rebuild the binary |
| SFTP reports no connection | Open the same asset's terminal, or reconnect after SSH failure |
| Native MongoDB script rejected | Use JSON/Extended JSON arguments with quoted keys; use mongosh for full JavaScript |
| SQL outcome is unknown | Inspect the database before retrying; a successful statement alone does not prove commit |
| Full `go vet ./...` reports DM warnings | See the [recorded driver findings](reviews/2026-11-06.md); `make vet` checks the application packages |
