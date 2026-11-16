import { t } from '../i18n';
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTheme } from 'next-themes';
import 'xterm/css/xterm.css';

interface SSHRemoteTerminalProps {
    wsUrl: string;
    onFileUpload: (files: FileList) => void;
    onConnected?: () => void;
}

export interface TerminalHandle {
    write: (data: string) => void;
}

export const SSHRemoteTerminal = forwardRef<TerminalHandle, SSHRemoteTerminalProps>(
    ({ wsUrl, onFileUpload, onConnected }, ref) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const terminalRef = useRef<Terminal | null>(null);
        const wsRef = useRef<WebSocket | null>(null);
        const { theme } = useTheme();
        const lastAppliedThemeRef = useRef<string | null>(null);

        const onFileUploadRef = useRef(onFileUpload);
        const onConnectedRef = useRef(onConnected);

        // Helper to get theme options
        const getThemeOptions = (themeName: string | undefined) => ({
            background: themeName === 'light' ? '#ffffff' : '#020617',
            foreground: themeName === 'light' ? '#333333' : '#f8fafc',
            cursor: themeName === 'light' ? '#333333' : '#f8fafc',
            selectionBackground: themeName === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.3)',
        });

        useEffect(() => {
            onFileUploadRef.current = onFileUpload;
            onConnectedRef.current = onConnected;
        }, [onFileUpload, onConnected]);

        useImperativeHandle(ref, () => ({
            write: (data: string) => {
                if (terminalRef.current) {
                    terminalRef.current.write(data);
                }
            },
        }));

        useEffect(() => {
            if (!containerRef.current) return;

            let terminal: Terminal | null = null;
            let socket: WebSocket | null = null;
            let resizeObserver: ResizeObserver | null = null;
            let initTimer: ReturnType<typeof setTimeout> | null = null;
            let removeDropListeners: (() => void) | undefined;
            let isDisposed = false;

            const initTerminal = () => {
                if (isDisposed) return;

                const el = containerRef.current;
                if (!el) return;

                // Wait for valid dimensions
                if (el.clientWidth === 0 || el.clientHeight === 0) {
                    initTimer = setTimeout(initTerminal, 50);
                    return;
                }

                // 1. Init Terminal
                const term = new Terminal({
                    cursorBlink: true,
                    fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
                    fontSize: 14,
                    allowProposedApi: true,
                    theme: getThemeOptions(theme)
                });
                lastAppliedThemeRef.current = theme || 'dark';

                const fitAddon = new FitAddon();
                term.loadAddon(fitAddon);

                // Helper for safe fitting
                const fit = () => {
                    if (!el || !terminalRef.current || isDisposed) return;
                    // Use requestAnimationFrame to ensure DOM is ready
                    requestAnimationFrame(() => {
                        if (isDisposed || !terminalRef.current || !el) return;
                        if (el.clientWidth === 0 || el.clientHeight === 0) return;
                        try {
                            fitAddon.fit();
                            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
                        } catch (e) {
                            console.warn('Fit error:', e);
                        }
                    });
                };

                // Clear any existing content to be safe
                el.innerHTML = '';

                try {
                    term.open(el);
                    // Immediate fit after open
                    fit();
                } catch (e) {
                    console.error('Terminal open failed:', e);
                    return;
                }

                terminal = term;
                terminalRef.current = term;

                // 2. Connect WebSocket
                const ws = new WebSocket(wsUrl);
                ws.binaryType = 'arraybuffer';
                socket = ws;
                wsRef.current = ws;

                ws.onopen = () => {
                    if (isDisposed) return;
                    term.write(`\r\n\x1b[32m${t('terminal.connected')}\x1b[0m\r\n`);
                    fit();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
                    }
                };

                ws.onmessage = (event) => {
                    if (isDisposed) return;
                    if (event.data instanceof ArrayBuffer) {
                        term.write(new Uint8Array(event.data));
                    } else {
                        try {
                            if (JSON.parse(event.data).type === 'connected') onConnectedRef.current?.();
                        } catch {
                            term.write(event.data);
                        }
                    }
                };

                ws.onerror = (err) => {
                    if (isDisposed) return;
                    console.error('WebSocket Error:', err);
                    term.write(`\r\n\x1b[31m${t('terminal.connectionError')}\x1b[0m\r\n`);
                };

                ws.onclose = () => {
                    if (isDisposed) return;
                    term.write(`\r\n\x1b[33m${t('terminal.closed')}\x1b[0m\r\n`);
                };

                term.onData((data) => {
                    if (isDisposed) return;
                    if (ws.readyState === WebSocket.OPEN) ws.send(data);
                });

                // 3. Drag & Drop
                const handleDrop = (e: DragEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer?.files?.length) {
                        term.write(`\r\n\x1b[36m${t('terminal.uploading')}\x1b[0m\r\n`);
                        if (onFileUploadRef.current) onFileUploadRef.current(e.dataTransfer.files);
                    }
                };

                el.addEventListener('drop', handleDrop);
                const handleDragOver = (e: DragEvent) => e.preventDefault();
                el.addEventListener('dragover', handleDragOver);
                removeDropListeners = () => { el.removeEventListener('drop', handleDrop); el.removeEventListener('dragover', handleDragOver); };

                // 4. Resize Observer
                resizeObserver = new ResizeObserver(() => {
                    if (isDisposed) return;
                    // Debounce or logic could be added here, but simple fit is usually fine
                    // provided dimensions are valid.
                    if (el.clientWidth > 0 && el.clientHeight > 0) {
                        fit();
                        if (ws.readyState === WebSocket.OPEN && term.cols > 0 && term.rows > 0) {
                            ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
                        }
                    }
                });
                resizeObserver.observe(el);
            };

            // Start Init
            // Use setTimeout(..., 0) to push execution to next tick. 
            // This allows the cleanup function to run first if we are in StrictMode double-invocation,
            // preventing the heavy terminal initialization from running on the immediately-unmounted instance.
            initTimer = setTimeout(initTerminal, 0);

            return () => {
                isDisposed = true;
                if (initTimer) clearTimeout(initTimer);
                if (resizeObserver) resizeObserver.disconnect();
                removeDropListeners?.();
                if (socket) {
                    socket.onclose = null; // Avoid extra logging
                    socket.close();
                }
                if (terminal) {
                    terminalRef.current = null;
                    terminal.dispose();
                }
            };
        }, [wsUrl]);

        // Theme update effect
        useEffect(() => {
            if (terminalRef.current && theme && theme !== lastAppliedThemeRef.current) {
                terminalRef.current.options.theme = getThemeOptions(theme);
                lastAppliedThemeRef.current = theme;
            }
        }, [theme]);

        return <div ref={containerRef} className="w-full h-full bg-black/5" />;
    }
);
