import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect, useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Play, Loader2, Eraser, Table2, Code, Terminal, AlertCircle } from 'lucide-react';
import { ResizableSplit } from './ResizableSplit';
import { DocumentTable } from './DocumentTable';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

interface ScriptConsoleProps {
    assetId: string;
    currentDatabase: string;
    collections: string[];
}

interface MongoshCapabilities {
    available: boolean;
    version: string;
    path: string;
}

type ResultViewMode = 'table' | 'json';

export function ScriptConsole({ assetId, currentDatabase, collections }: ScriptConsoleProps) {
    const { t } = useTranslation();
    const [script, setScript] = useState('db.getCollectionNames()');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ResultViewMode>('table');
    const [executionMode, setExecutionMode] = useState<'native' | 'shell'>('native');
    const [capabilities, setCapabilities] = useState<MongoshCapabilities | null>(null);
    const authenticatedFetch = useAuthenticatedFetch();
    const { theme } = useTheme();
    const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);

    // Fetch capabilities on mount
    useEffect(() => {
        authenticatedFetch('/api/v1/mongo/capabilities')
            .then(res => res.json())
            .then(data => setCapabilities(data))
            .catch(err => console.error('Failed to fetch capabilities:', err));
    }, []);

    const handleExecute = async () => {
        if (!currentDatabase) {
            setError(t('error.selectDatabase'));
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await authenticatedFetch('/api/v1/mongo/script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    database: currentDatabase,
                    script: script,
                    mode: executionMode
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t('error.execute'));
            }

            setResult(data);

            // Auto-switch to table view if result is a cursor (array of docs)
            if (data.type === 'cursor' && Array.isArray(data.data)) {
                setViewMode('table');
            } else if (data.type === 'text' || data.type === 'error') {
                // For text or error results, no specific view mode, just display as text
            } else {
                setViewMode('json');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const isTableData = result?.type === 'cursor' && Array.isArray(result.data);
    const isTextResult = result?.type === 'text' || result?.type === 'error';

    // Monaco Editor Configuration
    const handleEditorDidMount = (_editor: any, monaco: Monaco) => {
        setMonacoInstance(monaco);
    };

    // Force re-render of suggestions when collections change?
    // Monaco provider is registered once, but it closes over 'collections'.
    // However, the closure captures the initial 'collections'.
    // We need to use a ref to access the latest collections inside the provider.
    const collectionsRef = useRef(collections);
    useEffect(() => {
        collectionsRef.current = collections;
    }, [collections]);

    // Register completion provider
    useEffect(() => {
        if (!monacoInstance) return;

        const disposable = monacoInstance.languages.registerCompletionItemProvider('javascript', {
            triggerCharacters: ['.', '$'],
            provideCompletionItems: (model: any, position: any) => {
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                // 1. Trigger on "db." -> Show collections
                if (textUntilPosition.endsWith('db.')) {
                    const suggestions = collectionsRef.current.map(col => ({
                        label: col,
                        kind: monacoInstance.languages.CompletionItemKind.Class,
                        insertText: col,
                        detail: t('mongo.collectionCompletion'),
                        range: range
                    }));
                    return { suggestions };
                }

                // 2. Trigger on "db.collection." -> Show methods
                const collectionMatch = textUntilPosition.match(/db\.([\w_]+)\.$/);
                if (collectionMatch) {
                    const methods = [
                        'find', 'findOne', 'insertOne', 'insertMany', 'updateOne', 'updateMany',
                        'deleteOne', 'deleteMany', 'aggregate', 'countDocuments', 'distinct',
                        'drop', 'createIndex', 'getIndexes'
                    ];

                    const suggestions = methods.map(method => ({
                        label: method,
                        kind: monacoInstance.languages.CompletionItemKind.Method,
                        insertText: method === 'find' ? 'find({})' : `${method}($0)`,
                        insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: t('mongo.methodCompletion'),
                        range: range
                    }));
                    return { suggestions };
                }

                // 3. Trigger on "$" -> Show aggregation operators
                if (textUntilPosition.endsWith('$')) {
                    const operators = [
                        'match', 'group', 'project', 'sort', 'limit', 'skip', 'unwind', 'lookup',
                        'addFields', 'count', 'bucket', 'facet', 'out', 'merge', 'replaceRoot'
                    ];

                    const suggestions = operators.map(op => ({
                        label: `$${op}`,
                        kind: monacoInstance.languages.CompletionItemKind.Keyword,
                        insertText: op,
                        detail: t('mongo.operatorCompletion'),
                        range: range
                    }));
                    return { suggestions };
                }

                return { suggestions: [] };
            }
        });

        return () => {
            disposable.dispose();
        };
    }, [monacoInstance]);

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Toolbar */}
            <div className="h-10 border-b border-border bg-muted/50 flex items-center px-3 gap-3 flex-shrink-0">
                {/* Database Selector removed - now in Sidebar */}

                {/* Execution Mode Toggle */}
                <div className="flex items-center bg-muted rounded p-0.5">
                    <button
                        onClick={() => setExecutionMode('native')}
                        className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${executionMode === 'native'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                        title={t('mongo.nativeHelp')}
                    >
                        <Code className="w-3 h-3" />
                        {t('mongo.native')}
                    </button>
                    <div className="relative group">
                        <button
                            onClick={() => capabilities?.available && setExecutionMode('shell')}
                            disabled={!capabilities?.available}
                            className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${executionMode === 'shell'
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : !capabilities?.available
                                    ? 'text-muted-foreground/50 cursor-not-allowed'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Terminal className="w-3 h-3" />
                            {t('mongo.shell')}
                        </button>

                        {/* Tooltip for disabled shell mode */}
                        {!capabilities?.available && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-2 bg-popover border border-border rounded shadow-xl z-50 invisible group-hover:visible">
                                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <p>{t('mongo.mongoshMissing')}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-px h-4 bg-border mx-1" />

                <button
                    onClick={handleExecute}
                    disabled={loading || !currentDatabase}
                    className="flex items-center gap-1.5 px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-muted disabled:text-muted-foreground text-white text-xs rounded transition-colors"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{t('common.execute')}</span>
                </button>

                <div className="flex-1" />

                <button
                    onClick={() => { setResult(null); setError(null); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={t('mongo.clearResults')}
                >
                    <Eraser className="w-4 h-4" />
                </button>
            </div>

            {/* Split View */}
            <div className="flex-1 overflow-hidden relative">
                <ResizableSplit
                    direction="vertical"
                    initialSize={30} // 30% for editor
                    top={
                        <Editor
                            loading={t('common.loading')}
                            language="javascript"
                            theme={theme === 'light' ? 'light' : 'vs-dark'}
                            value={script}
                            onChange={(v) => setScript(v || '')}
                            onMount={handleEditorDidMount}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: 'on',
                                automaticLayout: true,
                            }}
                        />
                    }
                    bottom={
                        <div className="h-full flex flex-col bg-background">
                            <div className="px-3 py-1.5 bg-muted/50 border-b border-border flex justify-between items-center">
                                <span className="text-xs text-muted-foreground font-semibold uppercase">{t('sql.results')}</span>

                                {isTableData && !isTextResult && (
                                    <div className="flex items-center gap-1 bg-muted p-0.5 rounded">
                                        <button
                                            onClick={() => setViewMode('table')}
                                            className={`p-1 rounded ${viewMode === 'table' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                            title={t('mongo.tableView')}
                                        >
                                            <Table2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => setViewMode('json')}
                                            className={`p-1 rounded ${viewMode === 'json' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                            title={t('mongo.jsonView')}
                                        >
                                            <Code className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-hidden relative">
                                {error ? (
                                    <div className="p-4 text-destructive font-mono text-sm whitespace-pre-wrap overflow-auto h-full">{translateError(error)}</div>
                                ) : result ? (
                                    isTextResult ? (
                                        <div className="h-full overflow-auto p-4 bg-muted text-foreground font-mono text-sm whitespace-pre-wrap">
                                            {result.type === 'error' ? translateError(result.error || result.data) : result.data || t('mongo.noOutput')}
                                        </div>
                                    ) : viewMode === 'table' && isTableData ? (
                                        <DocumentTable documents={result.data} withRowNumber={true} />
                                    ) : (
                                        <Editor
                                            loading={t('common.loading')}
                                            language="json"
                                            theme={theme === 'light' ? 'light' : 'vs-dark'}
                                            value={JSON.stringify(result.data, null, 2)}
                                            options={{
                                                readOnly: true,
                                                minimap: { enabled: false },
                                                fontSize: 13,
                                                lineNumbers: 'on',
                                                automaticLayout: true,
                                            }}
                                        />
                                    )
                                ) : (
                                    <div className="p-4 text-muted-foreground italic font-mono text-sm">
                                        {t('mongo.ready')}
                                    </div>
                                )}
                            </div>
                        </div>
                    }
                />
            </div>
        </div >
    );
}
