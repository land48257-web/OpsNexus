import { t } from '../i18n';
import { translateError } from '../i18n/errors';
import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTheme } from 'next-themes';
import 'xterm/css/xterm.css';
import { formatRedisResult } from '../lib/redisFormatter';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

interface RedisConsoleProps {
    assetId: string;
    db: number;
    onDbChange: (db: number) => void;
}

export function RedisConsole({ assetId, db, onDbChange }: RedisConsoleProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const authenticatedFetch = useAuthenticatedFetch();
    const { theme } = useTheme();

    // Command state
    const [currentLine, setCurrentLine] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const currentLineRef = useRef(''); // Ref for sync access in event handlers
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);

    // Keep refs in sync
    useEffect(() => {
        currentLineRef.current = currentLine;
    }, [currentLine]);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        historyIndexRef.current = historyIndex;
    }, [historyIndex]);

    // Update terminal theme when theme changes
    useEffect(() => {
        if (!terminalRef.current) return;

        const isDark = theme === 'dark';

        terminalRef.current.options.theme = {
            background: isDark ? '#000000' : '#ffffff',
            foreground: isDark ? '#d4d4d4' : '#000000',
            cursor: isDark ? '#ffffff' : '#000000',
            selectionBackground: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
        };
    }, [theme]);

    useEffect(() => {
        if (!containerRef.current) return;

        const isDark = theme === 'dark';

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            theme: {
                background: isDark ? '#000000' : '#ffffff',
                foreground: isDark ? '#d4d4d4' : '#000000',
                cursor: isDark ? '#ffffff' : '#000000',
                selectionBackground: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
            },
            rows: 10, // Initial rows, will fit
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(containerRef.current);
        fitAddon.fit();

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        // Initial prompt
        writePrompt(term, assetId, db);

        // Input handling
        term.onData(e => {
            handleInput(e, term);
        });

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            term.dispose();
        };
    }, [theme]); // Run once on mount

    // Update prompt when DB changes (if not initiated by console)
    // Actually, we only want to update prompt if we are at a fresh prompt line.
    // But for simplicity, we assume the user is driving. 
    // If the parent changes DB, we might want to print a message or just update the prompt for the *next* line.
    // Let's just rely on the prompt function using the latest props? 
    // No, the closure in useEffect is stale. We need a ref for current DB or pass it to writePrompt.
    const dbRef = useRef(db);
    useEffect(() => {
        dbRef.current = db;
    }, [db]);

    const writePrompt = (term: Terminal, asset: string, database: number) => {
        // Format: asset:db> 
        // e.g. localhost:0>
        // We might want to shorten assetId if it's long.
        // Let's use a simpler prompt.
        const prompt = `\r\n${asset}[${database}]> `;
        term.write(prompt);
    };

    const handleInput = async (data: string, term: Terminal) => {
        const ord = data.charCodeAt(0);

        if (ord === 13) { // Enter
            const line = currentLineRef.current.trim();
            term.write('\r\n');

            if (line) {
                // Add to history
                const newHistory = [...historyRef.current, line];
                setHistory(newHistory);
                setHistoryIndex(newHistory.length);

                await executeCommand(line, term);
            } else {
                writePrompt(term, assetId, dbRef.current);
            }

            setCurrentLine('');
            setHistoryIndex(historyRef.current.length); // Reset index
        } else if (ord === 127) { // Backspace
            if (currentLineRef.current.length > 0) {
                setCurrentLine(prev => prev.slice(0, -1));
                term.write('\b \b');
            }
        } else if (data === '\u001b[A') { // Up arrow
            const idx = historyIndexRef.current;
            if (idx > 0) {
                const newIdx = idx - 1;
                setHistoryIndex(newIdx);
                const cmd = historyRef.current[newIdx];
                // Clear current line
                clearCurrentLine(term);
                term.write(cmd);
                setCurrentLine(cmd);
            }
        } else if (data === '\u001b[B') { // Down arrow
            const idx = historyIndexRef.current;
            if (idx < historyRef.current.length - 1) {
                const newIdx = idx + 1;
                setHistoryIndex(newIdx);
                const cmd = historyRef.current[newIdx];
                clearCurrentLine(term);
                term.write(cmd);
                setCurrentLine(cmd);
            } else {
                setHistoryIndex(historyRef.current.length);
                clearCurrentLine(term);
                setCurrentLine('');
            }
        } else if (ord < 32) {
            // Ignore other control characters
        } else {
            setCurrentLine(prev => prev + data);
            term.write(data);
        }
    };

    const clearCurrentLine = (term: Terminal) => {
        // Move cursor to beginning of line (after prompt)?
        // Actually, we don't know exactly where the prompt ends in xterm coords easily without tracking.
        // Easiest is to send backspaces for the length of currentLine.
        const len = currentLineRef.current.length;
        for (let i = 0; i < len; i++) {
            term.write('\b \b');
        }
    };

    const executeCommand = async (cmdLine: string, term: Terminal) => {
        // Basic parsing: split by space, respecting quotes
        // This is a naive parser.
        const args = parseCommand(cmdLine);
        if (args.length === 0) return;

        const command = args[0].toLowerCase();

        // Handle local commands
        if (command === 'clear') {
            term.clear();
            writePrompt(term, assetId, dbRef.current);
            return;
        }

        if (command === 'select') {
            if (args.length < 2) {
                term.write(`(error) ERR ${t('error.selectArguments')}`);
                writePrompt(term, assetId, dbRef.current);
                return;
            }
            const newDb = parseInt(args[1], 10);
            if (isNaN(newDb) || newDb < 0 || newDb > 15) { // Redis usually supports 16 DBs, but configurable.
                term.write(`(error) ERR ${t('error.invalidDb')}`);
                writePrompt(term, assetId, dbRef.current);
                return;
            }

            // Update local state
            onDbChange(newDb);
            term.write("OK");
            // Prompt will be written with new DB
            writePrompt(term, assetId, newDb);
            return;
        }

        // Remote execution
        try {
            const res = await authenticatedFetch('/api/v1/redis/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    command: args[0],
                    args: args.slice(1),
                    db: dbRef.current
                })
            });

            const data = await res.json();

            if (data.error) {
                term.write(`(error) ${translateError(data.error)}`);
            } else {
                term.write(formatRedisResult(data.result));
            }
        } catch (err) {
            term.write(`(error) ${t('error.networkDetail', { error: translateError(err) })}`);
        }

        writePrompt(term, assetId, dbRef.current);
    };

    // Naive command parser
    const parseCommand = (input: string): string[] => {
        const args: string[] = [];
        let current = '';
        let inQuote = false;
        let quoteChar = '';

        for (let i = 0; i < input.length; i++) {
            const char = input[i];

            if (inQuote) {
                if (char === quoteChar) {
                    inQuote = false;
                } else {
                    current += char;
                }
            } else {
                if (char === '"' || char === "'") {
                    inQuote = true;
                    quoteChar = char;
                } else if (char === ' ') {
                    if (current.length > 0) {
                        args.push(current);
                        current = '';
                    }
                } else {
                    current += char;
                }
            }
        }
        if (current.length > 0) {
            args.push(current);
        }
        return args;
    };

    return (
        <div ref={containerRef} className="h-full w-full bg-background overflow-hidden" />
    );
}
