package v1

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestTerminalWriterSerializesOutputAndPreservesBytes(t *testing.T) {
	writeErr := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			writeErr <- err
			return
		}
		defer conn.Close()
		writer := &terminalWriter{conn: conn}
		var wg sync.WaitGroup
		for _, chunk := range [][]byte{{0xe4, 0xb8}, {0xad}, []byte("stderr")} {
			wg.Add(1)
			go func(p []byte) {
				defer wg.Done()
				for i := 0; i < 50; i++ {
					if _, err := writer.Write(p); err != nil {
						select {
						case writeErr <- err:
						default:
						}
						return
					}
				}
			}(chunk)
		}
		wg.Wait()
	}))
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	counts := make(map[string]int)
	for i := 0; i < 150; i++ {
		kind, p, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if kind != websocket.BinaryMessage {
			t.Fatal("terminal bytes sent in UTF-8 text frames")
		}
		counts[string(p)]++
	}
	for _, chunk := range [][]byte{{0xe4, 0xb8}, {0xad}, []byte("stderr")} {
		if counts[string(chunk)] != 50 {
			t.Fatal("lost terminal output")
		}
	}
	select {
	case err := <-writeErr:
		t.Fatal(err)
	default:
	}
}

func TestWebSocketRejectsForeignOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err == nil {
			conn.Close()
		}
	}))
	defer server.Close()
	_, response, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), http.Header{"Origin": []string{"https://foreign.invalid"}})
	if err == nil || response.StatusCode != 403 {
		t.Fatal("foreign origin accepted")
	}
	if response.Body != nil {
		response.Body.Close()
	}
}
