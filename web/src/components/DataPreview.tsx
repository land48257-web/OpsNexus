import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { DetailDrawer } from './DetailDrawer';

interface DataPreviewProps {
    assetId: string;
    database: string;
    tableName: string;
}

export function DataPreview({ assetId, database, tableName }: DataPreviewProps) {
    const { t } = useTranslation();
    const [data, setData] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [selectedRow, setSelectedRow] = useState<any | null>(null);
    const pageSize = 50;
    const authenticatedFetch = useAuthenticatedFetch();

    useEffect(() => {
        // Reset page when table changes
        setCurrentPage(1);
        setSelectedRow(null);
    }, [database, tableName]);

    useEffect(() => {
        const controller = new AbortController();
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch table data with pagination
                const response = await authenticatedFetch(`/api/v1/assets/${encodeURIComponent(assetId)}/table_data?database=${encodeURIComponent(database)}&table=${encodeURIComponent(tableName)}&page=${currentPage}&pageSize=${pageSize}`, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                const result = await response.json();
                if (controller.signal.aborted) return;

                if (result.data && result.data.length > 0) {
                    setData(result.data);
                    // Use columns from backend if available, otherwise fallback to keys
                    if (result.columns && Array.isArray(result.columns)) {
                        setColumns(result.columns);
                    } else {
                        setColumns(Object.keys(result.data[0]));
                    }
                    setTotalRows(result.total || 0);
                } else {
                    setData([]);
                    setColumns(result.columns || []);
                    setTotalRows(result.total || 0);
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                console.error("Failed to fetch table data", err);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        if (assetId && database && tableName) {
            fetchData();
        }
        return () => controller.abort();
    }, [assetId, database, tableName, currentPage, authenticatedFetch]);

    const totalPages = Math.ceil(totalRows / pageSize);

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 h-10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    {/* Removed Warning Badge */}
                </div>

                {/* Stats */}
                <div className="text-xs text-muted-foreground font-mono">
                    {loading ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{t('common.loading')}</span>
                        </div>
                    ) : (
                        <span>{t('common.totalRows', { count: totalRows })}</span>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto relative">
                {error ? (
                    <div className="flex flex-col items-center justify-center h-full text-destructive p-4 text-center">
                        <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">{t('error.loadData')}</p>
                        <p className="text-xs mt-1 opacity-70">{translateError(error)}</p>
                    </div>
                ) : data.length === 0 && !loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p className="text-sm">{t('common.noData')}</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-muted/50 shadow-sm">
                            <tr>
                                <th className="w-12 px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b border-r border-border bg-muted/50 sticky left-0 z-20">
                                    #
                                </th>
                                {columns.map((col) => (
                                    <th key={col} className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-r border-border whitespace-nowrap bg-muted/50 min-w-[100px] max-w-[300px]">
                                        <div className="flex items-center justify-between group cursor-col-resize">
                                            <span className="truncate" title={col}>{col}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-background">
                            {data.map((row, rIdx) => (
                                <tr
                                    key={rIdx}
                                    className="hover:bg-muted/50 transition-colors group cursor-pointer"
                                    onDoubleClick={() => setSelectedRow(row)}
                                >
                                    <td className="px-2 py-1.5 text-center text-xs text-muted-foreground border-b border-r border-border font-mono bg-background sticky left-0 z-10 group-hover:bg-muted/50">
                                        {(currentPage - 1) * pageSize + rIdx + 1}
                                    </td>
                                    {columns.map((col, cIdx) => (
                                        <td key={cIdx} className="px-4 py-1.5 text-xs text-foreground border-b border-r border-border/50 whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis" title={String(row[col])}>
                                            {row[col] === null ? (
                                                <span className="text-muted-foreground/50 italic text-[10px]">NULL</span>
                                            ) : (
                                                <span className="font-mono">{String(row[col])}</span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Footer */}
            {totalRows > 0 && (
                <div className="h-9 border-t border-border bg-muted/30 flex items-center justify-between px-4 flex-shrink-0">
                    <div className="text-xs text-muted-foreground">
                        {t('common.rowRange', { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, totalRows), count: totalRows })}
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            aria-label={t('common.previousPage')}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1 || loading}
                            className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-muted-foreground font-mono">
                            {t('common.page', { page: currentPage, total: totalPages || 1 })}
                        </span>
                        <button
                            aria-label={t('common.nextPage')}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || loading}
                            className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Detail Drawer */}
            <DetailDrawer
                isOpen={!!selectedRow}
                onClose={() => setSelectedRow(null)}
                data={selectedRow}
                columns={columns}
            />
        </div>
    );
}
