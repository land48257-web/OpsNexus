package sshutil

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// SSHConnection holds the underlying client and allows spawning sessions/sftp.
type SSHConnection struct {
	Client *ssh.Client
}

// Config holds SSH connection parameters
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	KeyPath  string // Path to private key
	Timeout  time.Duration
}

// NewSSHConnection establishes the initial TCP connection.
func NewSSHConnection(cfg *Config) (*SSHConnection, error) {
	authMethods := []ssh.AuthMethod{}

	// Try key-based authentication first
	if cfg.KeyPath != "" {
		key, err := os.ReadFile(cfg.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("unable to read private key: %w", err)
		}

		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("unable to parse private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	// Fall back to password authentication
	if cfg.Password != "" {
		authMethods = append(authMethods, ssh.Password(cfg.Password))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("no authentication method provided")
	}

	clientConfig := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // Note: In production, use known_hosts
		Timeout:         cfg.Timeout,
	}

	if clientConfig.Timeout == 0 {
		clientConfig.Timeout = 5 * time.Second
	}

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	tcpConn, err := net.DialTimeout("tcp", addr, clientConfig.Timeout)
	if err != nil {
		return nil, fmt.Errorf("failed to dial: %w", err)
	}
	// ssh.Dial's Timeout only covers TCP, not a stalled SSH handshake.
	_ = tcpConn.SetDeadline(time.Now().Add(clientConfig.Timeout))
	conn, channels, requests, err := ssh.NewClientConn(tcpConn, addr, clientConfig)
	if err != nil {
		_ = tcpConn.Close()
		return nil, fmt.Errorf("SSH handshake failed: %w", err)
	}
	_ = tcpConn.SetDeadline(time.Time{})
	client := ssh.NewClient(conn, channels, requests)

	return &SSHConnection{Client: client}, nil
}

// NewShellSession creates a new session for terminal interaction.
func (c *SSHConnection) NewShellSession() (*ssh.Session, error) {
	return c.Client.NewSession()
}

// NewSFTPClient creates an SFTP client using the EXISTING ssh.Client connection.
// It does NOT open a new TCP connection.
func (c *SSHConnection) NewSFTPClient() (*sftp.Client, error) {
	return sftp.NewClient(c.Client)
}

// Close closes the underlying SSH connection.
func (c *SSHConnection) Close() error {
	return c.Client.Close()
}

// CreateTerminalModes returns default terminal modes.
func CreateTerminalModes() ssh.TerminalModes {
	return ssh.TerminalModes{
		ssh.ECHO:          1,     // enable echoing
		ssh.TTY_OP_ISPEED: 14400, // input speed = 14.4kbaud
		ssh.TTY_OP_OSPEED: 14400, // output speed = 14.4kbaud
	}
}
