package handler

import (
	"net/http"
	"opsnexus/internal/config"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/mojocn/base64Captcha"
	"golang.org/x/crypto/bcrypt"
)

var store = base64Captcha.DefaultMemStore

type LoginRequest struct {
	Username  string `json:"username" binding:"required"`
	Password  string `json:"password" binding:"required"`
	CaptchaID string `json:"captcha_id" binding:"required"`
	Captcha   string `json:"captcha" binding:"required"`
}

type AuthHandler struct {
	Config *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{Config: cfg}
}

func (h *AuthHandler) GetCaptcha(c *gin.Context) {
	driver := base64Captcha.NewDriverDigit(80, 240, 6, 0.7, 80)
	captcha := base64Captcha.NewCaptcha(driver, store)
	id, b64s, _, err := captcha.Generate()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate captcha"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"captcha_id": id,
		"image":      b64s,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 1. Verify Captcha
	if !store.Verify(req.CaptchaID, req.Captcha, true) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid captcha"})
		return
	}

	// 2. Verify User
	var user *config.UserConfig
	for _, u := range h.Config.Security.AdminUsers {
		if u.Username == req.Username {
			user = &u
			break
		}
	}

	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Verify Password (assuming bcrypt hash in config)
	// If config has plain text, it should have been hashed on startup.
	// For now, we will try bcrypt compare.
	err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// 3. Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"username": user.Username,
		"exp":      time.Now().Add(time.Duration(h.Config.Security.SessionTimeoutMinutes) * time.Minute).Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.Config.Security.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":                   tokenString,
		"username":                user.Username,
		"session_timeout_minutes": h.Config.Security.SessionTimeoutMinutes,
	})
}
