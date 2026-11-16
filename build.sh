#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Build script for OpsNexus

APP_NAME="opsnexus"
DIST_DIR="dist"
WEB_DIR="web"

# Create dist directory
mkdir -p "$DIST_DIR"

echo "Building Frontend..."
cd "$WEB_DIR"
npm ci
npm run build
cd ..

echo "Building Backend..."

# Linux amd64
echo "Building Linux (amd64)..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o "$DIST_DIR/${APP_NAME}-linux-amd64" ./cmd/server

# Linux arm64
echo "Building Linux (arm64)..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o "$DIST_DIR/${APP_NAME}-linux-arm64" ./cmd/server

# Windows amd64
echo "Building Windows (amd64)..."
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -o "$DIST_DIR/${APP_NAME}-windows-amd64.exe" ./cmd/server

echo "Build complete! Binaries are in $DIST_DIR"
