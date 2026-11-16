.PHONY: all build-web build-server run test vet clean

all: build-server

build-web:
	@echo "Building Frontend..."
	cd web && npm ci && npm run build

build-server: build-web
	@echo "Building Backend..."
	go build -trimpath -o opsnexus ./cmd/server

run:
	./opsnexus

test: build-web
	go test ./...
	cd web && npm run lint && npm test

# The bundled DM driver has known vet findings; see THIRD_PARTY_NOTICES.md.
# Keep checks enabled for all application packages.
vet:
	go vet ./cmd/... ./internal/... ./pkg/dbutil ./pkg/gormdm ./pkg/logger ./pkg/mongoutil ./pkg/sqlutil ./pkg/sshutil ./web

# Only generated output is removed; local configuration and dependencies remain.
clean:
	rm -rf dist web/dist web/coverage web/.vite
	rm -f opsnexus opsnexus.exe coverage.out web/*.tsbuildinfo web/vite.config.js web/vite.config.d.ts
