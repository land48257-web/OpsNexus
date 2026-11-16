package sshutil

import (
	"net"
	"strconv"
	"testing"
	"time"
)

func TestHandshakeTimeout(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	accepted := make(chan net.Conn, 1)
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			accepted <- conn
		}
	}()
	host, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portText)
	start := time.Now()
	_, err = NewSSHConnection(&Config{Host: host, Port: port, User: "test", Password: "test", Timeout: 50 * time.Millisecond})
	if err == nil {
		t.Fatal("unresponsive SSH peer accepted")
	}
	if time.Since(start) > time.Second {
		t.Fatal("handshake timeout not enforced")
	}
	select {
	case conn := <-accepted:
		conn.Close()
	case <-time.After(time.Second):
		t.Fatal("connection not accepted")
	}
}
