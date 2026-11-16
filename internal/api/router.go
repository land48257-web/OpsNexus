package api

import (
	"net/http"
	"opsnexus/internal/api/handler"
	"opsnexus/internal/api/middleware"
	v1 "opsnexus/internal/api/v1"
	"opsnexus/internal/config"
	"opsnexus/web"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func normalizeBasePath(basePath string) string {
	basePath = strings.TrimSpace(basePath)
	if basePath == "" || basePath == "/" {
		return ""
	}
	if !strings.HasPrefix(basePath, "/") {
		basePath = "/" + basePath
	}
	return strings.TrimRight(basePath, "/")
}

func SetupRouter(cfg *config.Config, log *zap.Logger, authHandler *handler.AuthHandler) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery(), func(c *gin.Context) {
		start := time.Now()
		c.Next()
		// Do not log query strings: terminal/download requests may contain JWTs.
		log.Info("HTTP request", zap.String("method", c.Request.Method), zap.String("path", c.Request.URL.Path), zap.Int("status", c.Writer.Status()), zap.Duration("duration", time.Since(start)))
	})
	basePath := normalizeBasePath(cfg.BasePath)

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://127.0.0.1:5173"}, // Allow frontend dev server
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	root := r.Group(basePath)

	// API Routes
	api := root.Group("/api")
	{
		// Auth Routes
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/login", authHandler.Login)
			authGroup.GET("/captcha", authHandler.GetCaptcha)
		}

		// Protected Routes
		v1Group := api.Group("/v1")
		v1Group.Use(middleware.AuthMiddleware(authHandler.Config))
		{
			// Assets
			assets := v1Group.Group("/assets")
			{
				assets.GET("", v1.ListAssets)
				assets.GET("/:id/databases", v1.ListDatabases)
				assets.GET("/:id/tables", v1.ListTables)
				assets.GET("/:id/table_data", v1.GetTableData)
				assets.GET("/:id/metadata", v1.GetDatabaseMetadata)
			}

			// Terminal
			term := v1Group.Group("/terminal")
			{
				term.GET("/ws", v1.SSHWebSocket)
			}

			// SFTP
			sftp := v1Group.Group("/sftp")
			{
				sftp.GET("/:asset_id/list", v1.ListFiles)
				sftp.POST("/:asset_id/upload", v1.UploadFile)
				sftp.GET("/:asset_id/download", v1.DownloadFile)
				sftp.POST("/:asset_id/mkdir", v1.CreateDirectory)
				sftp.POST("/:asset_id/create_file", v1.CreateFile)
				sftp.DELETE("/:asset_id/delete", v1.DeletePath)
			}

			// Redis
			redis := v1Group.Group("/redis")
			{
				redis.POST("/scan", v1.RedisScan)
				redis.GET("/key", v1.RedisGetKey)
				redis.PUT("/key", v1.RedisUpdateKey)
				redis.DELETE("/key", v1.RedisDeleteKey)
				redis.POST("/command", v1.RedisCommand)
			}

			// Mongo
			mongo := v1Group.Group("/mongo")
			{
				mongo.GET("/databases", v1.MongoDatabases)
				mongo.GET("/collections", v1.MongoCollections)
				mongo.POST("/query", v1.MongoQuery)
				mongo.POST("/aggregate", v1.MongoAggregate)
				mongo.PUT("/document", v1.MongoUpdateDoc)
				mongo.DELETE("/document", v1.MongoDeleteDoc)
				mongo.POST("/document", v1.MongoInsertDoc)
				mongo.GET("/schema", v1.MongoSchemaSample)
				mongo.POST("/script", v1.MongoRunScript)
				mongo.GET("/capabilities", v1.MongoGetCapabilities)
			}

			// Executor
			executor := v1Group.Group("/executor")
			{
				executor.POST("/batch", v1.ExecuteBatch)
			}
		}
	}

	// Serve static files (Frontend)
	root.StaticFS("/assets", web.GetAssetsFS())
	root.StaticFS("/monacoeditorwork", web.GetMonacoWorkFS())

	root.GET("/favicon.ico", func(c *gin.Context) {
		data, err := web.GetFavicon()
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "image/x-icon", data)
	})

	// Catch-all route to serve index.html for client-side routing
	r.NoRoute(func(c *gin.Context) {
		requestPath := c.Request.URL.Path
		if basePath != "" {
			if requestPath != basePath && !strings.HasPrefix(requestPath, basePath+"/") {
				c.Status(http.StatusNotFound)
				return
			}
			requestPath = strings.TrimPrefix(requestPath, basePath)
			if requestPath == "" {
				requestPath = "/"
			}
		}

		// If it starts with /api, return 404 JSON
		if len(requestPath) >= 4 && requestPath[:4] == "/api" {
			c.JSON(http.StatusNotFound, gin.H{"error": "API endpoint not found"})
			return
		}

		indexHTML, err := web.GetIndexHTML()
		if err != nil {
			c.String(http.StatusInternalServerError, "Failed to load index.html")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})

	return r
}
