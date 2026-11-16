package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
	"opsnexus/internal/api/handler"
	"opsnexus/internal/config"
)

func TestRoutesAuthenticationAndCORS(t *testing.T) {
	for _, base := range []string{"", "/devops"} {
		cfg := &config.Config{BasePath: base, Security: config.SecurityConfig{JWTSecret: "test-secret", AdminUsers: []config.UserConfig{{Username: "admin"}}}}
		r := SetupRouter(cfg, zap.NewNop(), handler.NewAuthHandler(cfg))
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"username": "admin", "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(cfg.Security.JWTSecret))
		if err != nil {
			t.Fatal(err)
		}
		for _, route := range []struct{ method, path string }{
			{"POST", "/redis/command"}, {"POST", "/mongo/aggregate"}, {"POST", "/mongo/document"}, {"PUT", "/mongo/document"}, {"DELETE", "/mongo/document"}, {"GET", "/mongo/schema"},
		} {
			path := base + "/api/v1" + route.path
			request := httptest.NewRequest(route.method, path, bytes.NewBufferString("{}"))
			response := httptest.NewRecorder()
			r.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized {
				t.Errorf("%s %s: unauthenticated status=%d", route.method, path, response.Code)
			}
			request = httptest.NewRequest(route.method, path, bytes.NewBufferString("{}"))
			request.Header.Set("Authorization", "Bearer "+token)
			request.Header.Set("Content-Type", "application/json")
			response = httptest.NewRecorder()
			r.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Errorf("%s %s: authenticated malformed status=%d body=%s", route.method, path, response.Code, response.Body.String())
			}
		}
		request := httptest.NewRequest("OPTIONS", base+"/api/auth/login", nil)
		request.Header.Set("Origin", "http://localhost:5173")
		request.Header.Set("Access-Control-Request-Method", "POST")
		response := httptest.NewRecorder()
		r.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent || response.Header().Get("Access-Control-Allow-Origin") == "" {
			t.Fatal("CORS middleware did not reach grouped routes")
		}
		request = httptest.NewRequest("GET", base+"/login", nil)
		response = httptest.NewRecorder()
		r.ServeHTTP(response, request)
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "<html") {
			t.Fatal("SPA route failed")
		}
	}
}
