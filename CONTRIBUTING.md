# Contributing to OpsNexus

English and Chinese issues, pull requests, and documentation improvements are welcome. Use the issue forms for reproducible bugs or focused feature requests. For a large change, explain the problem and proposed behavior in an issue first.

## Development setup

1. Install Go 1.26+ and Node.js 22.13+ (`nvm use` selects Node 22).
2. Copy `config.yaml.example` to `config.yaml`, set your own administrator credentials and JWT secret, and use dedicated test assets.
3. Run `make build-web` before any Go build or test; the backend embeds the frontend build.
4. Start the backend with `go run ./cmd/server --config config.yaml` and Vite with `npm --prefix web run dev` in a separate terminal.

See [README](README.md) and the [deployment guide](docs/DEPLOYMENT.md) for configuration details. Never put real credentials, private keys, or production connection strings in commits, fixtures, logs, or screenshots.

## Code and documentation

- Keep Go entry-point code in `cmd/server`, application logic in `internal`, and shared helpers in `pkg`. Use `gofmt` for Go changes.
- Match the existing TypeScript/React style and run ESLint. Components use PascalCase; hooks use `useX`.
- Keep changes focused. Avoid formatting or renaming the entire imported DM driver while fixing application code.
- Add regression coverage for bugs and meaningful new logic. Go tests use local fixtures, SQL mocks, and in-memory Redis; frontend tests use Vitest and Testing Library.
- Update both `README.md` and `README.zh-CN.md` when documented commands, requirements, or capabilities change. Update `config.yaml.example` for configuration changes.
- Keep `go.sum` and `web/package-lock.json` in sync with dependency changes. Use `npm ci` to reproduce an existing dependency set.

## Validation

From the repository root:

```bash
make test
make vet
go test -race ./...
```

For packaging changes, also run `./build.sh`. For subpath changes, build with `VITE_BASE_PATH=/devops/` and use the same backend `base_path`; restore the root build afterward if needed.

`make vet` checks the application packages. Full `go vet ./...` currently reports findings in the bundled DM driver; these are recorded in the [review](docs/reviews/2026-11-06.md). Do not suppress new findings or disable checks to hide regressions. Protocol compatibility and database failover require dedicated test services; unit tests do not establish those results.

CI builds the frontend before testing Go, runs lint and tests, checks application packages, and cross-compiles the supported release targets. It does not connect to production assets or publish releases.

## Pull requests

Describe the concrete problem, the resulting behavior, and the verification performed. Include configuration changes and screenshots when relevant. Use synthetic data. If a check cannot be run, explain the reason instead of marking it as passed.

Do not commit local configuration, dependencies, generated binaries, or `web/dist`. Do retain new source files, tests, public assets, and lockfiles. `git status --short` and `git diff --check` are useful final checks.

## Licensing

Contributions to original project code are made under the [MIT License](LICENSE). Preserve third-party copyright and license notices. Changes involving `pkg/dm` or `pkg/gormdm` must account for the unresolved redistribution terms in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 中文说明

欢迎使用中文提交 Issue 和 PR。请描述问题、复现步骤、预期行为及验证结果，界面变更附演示截图。开发前先执行 `make build-web`，提交前运行上面的测试命令。不要提交真实配置、凭证、依赖目录或构建产物；功能和配置变化请同步更新中英文 README。安全问题请按 [SECURITY.md](SECURITY.md) 私密反馈。
