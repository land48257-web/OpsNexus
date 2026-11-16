package main

import (
	"context"
	"errors"
	"flag"
	stdlog "log"
	"net/http"
	"opsnexus/internal/api"
	"opsnexus/internal/api/handler"
	"opsnexus/internal/config"
	"opsnexus/internal/service/asset"
	"opsnexus/internal/service/mongo"
	"opsnexus/internal/service/redis"
	"opsnexus/internal/service/ssh_service"
	"opsnexus/pkg/logger"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
)

func main() {
	// 0. Parse Flags
	configPath := flag.String("config", "", "Path to configuration file")
	flag.Parse()

	// 1. Load Config
	cfg, err := config.Load(*configPath)
	if err != nil {
		stdlog.Fatal(err)
	}

	// 2. Init Logger
	log := logger.Init(cfg.LogLevel)
	defer log.Sync()

	log.Info("Starting OpsNexus", zap.String("version", "0.1.0"))

	// 2.5 Secure Passwords (Hash plain text passwords on startup)
	if err := cfg.HashPasswords(); err != nil {
		log.Fatal("Failed to prepare passwords", zap.Error(err))
	}

	// 3. Init Asset Manager
	if err := asset.Init(&cfg.Assets); err != nil {
		log.Fatal("Failed to load assets", zap.Error(err))
	}

	// 4. Init Auth Handler
	authHandler := handler.NewAuthHandler(cfg)

	// 5. Setup Router
	r := api.SetupRouter(cfg, log, authHandler)

	// 6. Start Server
	srv := &http.Server{Addr: cfg.ServerAddress, Handler: r, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	serverErr := make(chan error, 1)
	go func() { serverErr <- srv.ListenAndServe() }()
	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("Server failed", zap.Error(err))
		}
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Warn("Graceful shutdown timed out", zap.Error(err))
		_ = srv.Close()
	}
	ssh_service.GetManager().CloseAll()
	redis.GetManager().CloseAll()
	mongo.GetManager().CloseAll()
}
