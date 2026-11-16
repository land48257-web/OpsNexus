package middleware

import (
	"net/http"
	"opsnexus/internal/config"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""

		if authHeader != "" {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token format"})
				return
			}
		} else if strings.HasSuffix(c.FullPath(), "/api/v1/terminal/ws") || strings.HasSuffix(c.FullPath(), "/sftp/:asset_id/download") {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(cfg.Security.JWTSecret), nil
		}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}
		claims := token.Claims.(jwt.MapClaims)
		username, _ := claims["username"].(string)
		knownUser := false
		for _, user := range cfg.Security.AdminUsers {
			if user.Username == username {
				knownUser = true
				break
			}
		}
		if !knownUser {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unknown user"})
			return
		}
		expiresAt, _ := claims.GetExpirationTime()
		c.Set("username", username)
		c.Set("expires_at", expiresAt.Time)

		c.Next()
	}
}
