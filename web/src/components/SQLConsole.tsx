import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';

import { useState, useEffect, useRef } from 'react';
import { Play, Eraser, Loader2 } from 'lucide-react';
import { SQLEditor } from './SQLEditor';
import { ExecutionResults } from './ExecutionResults';
import { ResizableSplit } from './ResizableSplit';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { useSqlAutocomplete } from '../hooks/useSqlAutocomplete';
import * as monaco from 'monaco-editor';


interface SQLConsoleProps {
    assetId: string;
    currentDatabase: string;
    dbType: string;
    initialScript?: string;
    onScriptChange?: (script: string) => void;
}

export function SQLConsole({ assetId, currentDatabase, dbType, initialScript = '', onScriptChange }: SQLConsoleProps) {
    const { t } = useTranslation();
    const [script, setScript] = useState(initialScript);
    const [isExecuting, setIsExecuting] = useState(false);
    const [stopOnError, setStopOnError] = useState(true);
    const [transaction, setTransaction] = useState<{ status: string; error?: string } | null>(null);
    const executionRef = useRef<AbortController | null>(null);
    useEffect(() => () => executionRef.current?.abort(), []);
    const [results, setResults] = useState<any[]>([]);
    const authenticatedFetch = useAuthenticatedFetch();
    const [monacoInstance, setMonacoInstance] = useState<typeof monaco | null>(null);

    // Enable Autocomplete
    useSqlAutocomplete(monacoInstance, assetId, currentDatabase);

    const handleEditorDidMount = (_: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
        setMonacoInstance(monacoInstance);
    };

    const handleExecute = async () => {
        if (isExecuting || !script.trim()) return;

        const controller = new AbortController();
        executionRef.current = controller;
        setTransaction(null);
        setIsExecuting(true);
        setResults([]); // Clear previous results

        try {
            const response = await authenticatedFetch('/api/v1/executor/batch', {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connection_id: assetId,
                    database: currentDatabase,
                    script,
                    type: dbType,
                    stop_on_error: stopOnError
                }),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error(t('error.noStream'));

            const decoder = new TextDecoder();
            let buffer = '';
            let receivedOutcome = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    if (trimmedLine.startsWith('data:')) {
                        try {
                            const jsonStr = trimmedLine.substring(5).trim();
                            const result = JSON.parse(jsonStr);
                            if (result.kind === 'transaction') {
                                receivedOutcome = true;
                                setTransaction(result);
                            } else {
                                setResults(prev => [...prev, result]);
                            }
                        } catch (e) {
                            console.error('Failed to parse result line:', line, e);
                        }
                    }
                }
            }
            if (!receivedOutcome) throw new Error(t('error.unknownTransaction'));
        } catch (error) {
            if (controller.signal.aborted) return;
            console.error('Execution failed:', error);
            setTransaction({ status: 'error', error: error instanceof Error ? error.message : String(error) });
            setResults(prev => [...prev, {
                sequence: 0,
                statement: 'System Error',
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                time_cost_ms: 0,
                rows_affected: 0
            }]);
        } finally {
            if (!controller.signal.aborted) setIsExecuting(false);
            if (executionRef.current === controller) executionRef.current = null;
        }
    };

    const handleClear = () => {
        setScript('');
        onScriptChange?.('');
        setResults([]);
        setTransaction(null);
    };

    return (
        <div className="flex flex-col h-full w-full bg-background overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 h-10 flex-shrink-0">
                <div className="flex items-center space-x-4">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={stopOnError} disabled={isExecuting} onChange={e => setStopOnError(e.target.checked)} />
                        {t('sql.stopOnError')}
                    </label>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleExecute}
                        disabled={isExecuting || !script.trim()}
                        className="flex items-center px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        title={t('sql.executeShortcut')}
                    >
                        {isExecuting ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        ) : (
                            <Play className="w-3.5 h-3.5 mr-2 fill-current" />
                        )}
                        {t('common.execute')}
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={isExecuting}
                        className="flex items-center px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Eraser className="w-3.5 h-3.5 mr-2" />
                        {t('common.clear')}
                    </button>
                </div>
            </div>

            {transaction && <div role="status" className={`px-4 py-2 text-xs ${transaction.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {transaction.status === 'error' ? translateError(transaction.error) : t('sql.transactionFinished')}
            </div>}
            {/* Content Split */}
            <div className="flex-1 overflow-hidden">
                <ResizableSplit
                    direction="vertical"
                    initialSize={40}
                    top={
                        <div className="h-full flex flex-col">
                            <SQLEditor
                                value={script}
                                onChange={(val) => {
                                    const newVal = val || '';
                                    setScript(newVal);
                                    onScriptChange?.(newVal);
                                }}
                                onExecute={handleExecute}
                                onMount={handleEditorDidMount}
                            />
                        </div>
                    }
                    bottom={
                        <div className="h-full flex flex-col bg-background">
                            {/* Result Header */}
                            <div className="px-4 py-1.5 bg-muted/20 border-b border-border text-xs flex justify-between items-center flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                                        {t('sql.results')}
                                    </span>
                                </div>
                                <span className="text-muted-foreground font-mono">{t('sql.statements', { count: results.length })}</span>
                            </div>

                            {/* Result Content */}
                            <div className="flex-1 overflow-hidden relative">
                                {results.length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                                        <div className="text-center">
                                            <Play className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                            <p className="text-sm">{t('sql.empty')}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <ExecutionResults results={results} />
                                )}
                            </div>
                        </div>
                    }
                />
            </div>
        </div>
    );
}
