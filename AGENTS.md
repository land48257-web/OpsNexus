# Repository Guidelines

## Project Structure & Module Organization
- `cmd/server/main.go`: Go entrypoint for the API/server binary.
- `internal/`: Core application code (API routing, services, config, middleware).
- `pkg/`: Shared libraries and integrations (e.g., database helpers, logger).
- `web/`: Vite + React frontend. `src/` is source, `dist/` is the production build, and `embed.go` packages `web/dist` into the Go binary.
- `dist/`: Output directory for cross-compiled binaries produced by `build.sh`.
- `config.yaml.example`: Configuration template; copy to `config.yaml` for local use.
- `README.md` / `README.zh-CN.md`: Keep English and Chinese project documentation aligned.
- `docs/`: Deployment guides, architecture reference and dated reviews under `reviews/`.
- `.github/`: CI and contribution templates; `web/public/` contains copied static assets.

## Build, Test, and Development Commands
- `make build-web`: Installs frontend deps and builds `web/dist`.
- `make build-server`: Rebuilds the embedded frontend, then builds `./opsnexus`.
- `make all`: Runs both frontend and backend builds.
- `make run`: Runs `./opsnexus` (expects `config.yaml` in the working dir).
- `./build.sh`: Full build with frontend + cross-compiled binaries in `dist/`.
- Frontend dev server: `cd web && npm run dev` (hot reload).
- `make vet`: Checks application packages; bundled DM findings are documented separately.
- `make clean`: Removes generated output without deleting configuration or dependencies.

## Coding Style & Naming Conventions
- Go: Use standard `gofmt` formatting (tabs) and idiomatic naming (lowercase package names, PascalCase for exports).
- Frontend: TypeScript/TSX under `web/src`. Match existing file style for indentation and semicolons. Components are PascalCase; hooks use `useX`.
- Linting: `cd web && npm run lint` (ESLint).

## Testing Guidelines
- Backend tests use Go's `testing` package, httptest, SQL mock and an in-memory Redis server.
- Run `make build-web` before the first Go build/test to generate embed resources, then `go test ./...`; use `go test -race ./...` for concurrency changes.
- Frontend regression tests use Vitest and Testing Library in `web/tests`; run `cd web && npm test`.
- `make test` builds the frontend and runs Go tests, frontend lint and frontend tests.

## Commit & Pull Request Guidelines
- Commit history uses short, descriptive messages (often in Chinese or English). Keep commits small and focused.
- PRs should include a concise summary, testing notes (commands + results), and config changes. Add screenshots for UI changes.

## Security & Configuration Notes
- Do not commit real credentials in `config.yaml`; update `config.yaml.example` when adding new settings.
- Remember to rebuild `web/dist` before packaging or releasing backend binaries.
- Preserve third-party copyright notices; consult `THIRD_PARTY_NOTICES.md` before redistributing bundled driver code.
