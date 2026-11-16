# Release preparation

## Before making the repository public

1. Resolve the bundled Dameng redistribution item in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Preserve required licenses and attribution for any code retained or replaced, including relevant Git history.
2. Review the files to be published with `git status --short`, `git diff --check`, and `git diff --cached`. Include source, tests, docs, public assets, templates, and dependency lockfiles.
3. Check local configuration, `.env*`, private keys, dependencies, binaries, and build output are ignored. `.gitignore` does not remove files already tracked or present in history.
4. Scan the intended source snapshot and Git history for credentials. For example, use Gitleaks with redacted output; investigate findings and rotate any real exposed credentials before publishing. Do not rewrite shared history without coordinating with its users.
5. Confirm the repository URL in both READMEs matches the intended GitHub repository. Enable private vulnerability reporting before relying on GitHub's reporting button.

## Validate a source-only checkout

Use a clean checkout with no existing `web/dist` or `node_modules`:

```bash
make test
make vet
go test -race ./...
./build.sh
```

Test the built application with a temporary configuration and dedicated assets. Verify root and subpath loading, Monaco workers, login, SQL transaction results, SSH/SFTP, and relevant database operations. Review known DM driver findings and perform real-service compatibility/failover tests before making compatibility claims. GitHub Actions runs the automated build/test checks after pushing; local checks alone do not establish a successful hosted CI run.

## Package a release

`build.sh` creates binaries in `dist/` without publishing them. A release archive should include the selected platform binary, `config.yaml.example`, README, the project license, and all applicable third-party license/notice files. Never include real `config.yaml`, private keys, or a local `mongosh` installation accidentally. Dependencies used inside the binary and embedded frontend may require additional notices.

Document the commit/tag, supported platforms, configuration changes, verification performed, and known limitations. Frontend and backend must be released together because the frontend is embedded. Binaries built for a subpath must advertise that prefix explicitly; root builds use no `VITE_BASE_PATH`.

Publishing a Git tag, GitHub release, or package is a separate maintainer action; neither the build scripts nor CI publish automatically.
