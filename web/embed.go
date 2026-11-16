package web

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed dist/*
var distFS embed.FS

// GetAssetsFS returns the file system for the static assets (rooted at dist/assets).
func GetAssetsFS() http.FileSystem {
	f, err := fs.Sub(distFS, "dist/assets")
	if err != nil {
		panic(err)
	}
	return http.FS(f)
}

// GetMonacoWorkFS returns the file system for the monaco editor workers (rooted at dist/monacoeditorwork).
func GetMonacoWorkFS() http.FileSystem {
	f, err := fs.Sub(distFS, "dist/monacoeditorwork")
	if err != nil {
		panic(err)
	}
	return http.FS(f)
}

// GetIndexHTML returns the content of index.html.
func GetIndexHTML() ([]byte, error) {
	return distFS.ReadFile("dist/index.html")
}

// GetFavicon returns the content of favicon.ico.
func GetFavicon() ([]byte, error) {
	return distFS.ReadFile("dist/favicon.ico")
}
