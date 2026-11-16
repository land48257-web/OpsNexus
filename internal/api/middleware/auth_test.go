package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"opsnexus/internal/config"
)

func TestAuthValidatesClaimsAndTokenTransport(t *testing.T) {
	cfg := &config.Config{Security: config.SecurityConfig{JWTSecret: "secret", AdminUsers: []config.UserConfig{{Username: "admin"}}}}
	r := gin.New()
	r.GET("/api/v1/assets", AuthMiddleware(cfg), func(c *gin.Context) { c.Status(204) })
	for _, tc := range []struct {
		name   string
		method jwt.SigningMethod
		claims jwt.MapClaims
		query  bool
		status int
	}{
		{"valid", jwt.SigningMethodHS256, jwt.MapClaims{"username": "admin", "exp": time.Now().Add(time.Hour).Unix()}, false, 204},
		{"expired", jwt.SigningMethodHS256, jwt.MapClaims{"username": "admin", "exp": time.Now().Add(-time.Hour).Unix()}, false, 401},
		{"no expiry", jwt.SigningMethodHS256, jwt.MapClaims{"username": "admin"}, false, 401},
		{"unknown user", jwt.SigningMethodHS256, jwt.MapClaims{"username": "missing", "exp": time.Now().Add(time.Hour).Unix()}, false, 401},
		{"wrong method", jwt.SigningMethodHS384, jwt.MapClaims{"username": "admin", "exp": time.Now().Add(time.Hour).Unix()}, false, 401},
		{"query on ordinary API", jwt.SigningMethodHS256, jwt.MapClaims{"username": "admin", "exp": time.Now().Add(time.Hour).Unix()}, true, 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			token, err := jwt.NewWithClaims(tc.method, tc.claims).SignedString([]byte(cfg.Security.JWTSecret))
			if err != nil {
				t.Fatal(err)
			}
			path := "/api/v1/assets"
			if tc.query {
				path += "?token=" + token
			}
			request := httptest.NewRequest("GET", path, nil)
			if !tc.query {
				request.Header.Set("Authorization", "Bearer "+token)
			}
			response := httptest.NewRecorder()
			r.ServeHTTP(response, request)
			if response.Code != tc.status {
				t.Fatalf("status=%d", response.Code)
			}
		})
	}
}
