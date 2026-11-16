import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect, useRef } from 'react';
import { Database, Table2, Loader2 } from 'lucide-react';
import { DocumentTable } from './DocumentTable';
import { AggregationPipelineBuilder } from './AggregationPipelineBuilder';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

interface CollectionViewerProps {
    assetId: string;
    database: string;
    collection: string;
    totalDocs?: number;
}

type ViewMode = 'table' | 'code' | 'aggregation';

export function CollectionViewer({ assetId, database, collection, totalDocs }: CollectionViewerProps) {
    const { t } = useTranslation();
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const [filter, setFilter] = useState<string>('{}');
    const [sort, setSort] = useState<string>('{}');
    const [limit, setLimit] = useState<number>(50);
    const [total, setTotal] = useState<number>(totalDocs || 0);
    const authenticatedFetch = useAuthenticatedFetch();
    const { theme } = useTheme();

    // Reset state when collection changes
    useEffect(() => {
        setDocuments([]);
        setTotal(0);
        setFilter('{}');
        setSort('{}');
        setLimit(50);
        setViewMode('table');
        void queryDocuments(true);
        return () => requestRef.current?.abort();
    }, [assetId, database, collection]);

    const queryDocuments = async (reset = false) => {
        if (!database || !collection) return;

        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setLoading(true);
        setError(null);
        try {
            const filterObj = JSON.parse(reset ? '{}' : filter);
            const sortObj = JSON.parse(reset ? '{}' : sort);
            for (const obj of [filterObj, sortObj]) {
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(t('error.queryObject'));
            }
            const response = await authenticatedFetch('/api/v1/mongo/query', {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    database: database,
                    collection: collection,
                    filter: filterObj,
                    sort: sortObj,
                    limit: reset ? 50 : limit,
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || t('error.query'));
            if (controller.signal.aborted) return;
            setDocuments(data.documents || []);
            setTotal(data.total || 0);
        } catch (error) {
            if (!controller.signal.aborted) {
                setError(error instanceof SyntaxError ? `${t('error.invalidJson')}: ${error.message}` : error instanceof Error ? error.message : String(error));
            }
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    };

    const handleAggregationExecute = (results: any[]) => {
        setDocuments(results);
        setTotal(results.length);
        setViewMode('table');
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header with view mode switcher */}
            <div className="px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Database className="w-4 h-4" />
                        <span>{database}</span>
                        <span>/</span>
                        <Table2 className="w-4 h-4" />
                        <span className="text-foreground">{collection}</span>
                        <span className="text-xs text-muted-foreground">({t('mongo.documents', { count: total })})</span>
                    </div>

                    {/* View Mode Tabs */}
                    <div className="flex items-center gap-1 bg-muted p-1 rounded">
                        {(['table', 'code', 'aggregation'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`
                                    px-3 py-1 text-xs rounded transition-colors flex items-center gap-1
                                    ${viewMode === mode
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'}
                                `}
                            >
                                {mode === 'table' && t('mongo.table')}
                                {mode === 'code' && 'JSON'}
                                {mode === 'aggregation' && t('mongo.aggregation')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Query Controls (hide for aggregation mode) */}
                {viewMode !== 'aggregation' && (
                    <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-5">
                            <label className="text-xs text-muted-foreground mb-1 block">{t('mongo.filter')}</label>
                            <input
                                type="text"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
                                placeholder='{"status": "active"}'
                            />
                        </div>
                        <div className="col-span-3">
                            <label className="text-xs text-muted-foreground mb-1 block">{t('mongo.sort')}</label>
                            <input
                                type="text"
                                value={sort}
                                onChange={(e) => setSort(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono"
                                placeholder='{"_id": -1}'
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-muted-foreground mb-1 block">{t('mongo.limit')}</label>
                            <input
                                type="number"
                                value={limit}
                                onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                                className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground"
                            />
                        </div>
                        <div className="col-span-2 flex items-end">
                            <button
                                onClick={() => void queryDocuments()}
                                disabled={loading}
                                className="w-full px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-muted text-white text-xs rounded transition-colors flex items-center justify-center gap-1"
                            >
                                {loading ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    t('common.execute')
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {error && <div role="alert" className="p-3 text-sm text-destructive">{translateError(error)}</div>}
            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {viewMode === 'table' && (
                    <DocumentTable documents={documents} withRowNumber={true} />
                )}

                {viewMode === 'code' && (
                    <Editor
                        loading={t('common.loading')}
                        language="json"
                        theme={theme === 'light' ? 'light' : 'vs-dark'}
                        value={JSON.stringify(documents, null, 2)}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                        }}
                    />
                )}

                {viewMode === 'aggregation' && (
                    <AggregationPipelineBuilder
                        assetId={assetId}
                        database={database}
                        collection={collection}
                        onExecute={handleAggregationExecute}
                    />
                )}
            </div>
        </div>
    );
}
