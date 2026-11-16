import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Database, ChevronLeft, ChevronRight, AlignLeft, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { DetailDrawer } from './DetailDrawer';

interface ExecResult {
    sequence: number;
    statement: string;
    status: string;
    rows_affected: number;
    time_cost_ms: number;
    error?: string;
    columns?: string[];
    data?: any[];
}

interface ExecutionResultsProps {
    results: ExecResult[];
}

export const ExecutionResults: React.FC<ExecutionResultsProps> = ({ results }) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRow, setSelectedRow] = useState<any | null>(null);
    const pageSize = 50;

    // Auto-select the last result when results change (e.g. new execution)
    useEffect(() => {
        if (results.length > 0) {
            // If we are streaming, we might want to stay on the current one unless it's the first load?
            // For now, let's select the latest one if it's a new batch, but here we just default to 0 or keep current if valid.
            // Actually, usually you want to see the result of what just finished. 
            // But if multiple are running, maybe just keep user selection.
            // Let's just ensure selectedIndex is valid.
            if (selectedIndex >= results.length) {
                setSelectedIndex(results.length - 1);
            }
        }
    }, [results.length]);

    // Reset page when selection changes
    useEffect(() => {
        setCurrentPage(1);
        setSelectedRow(null);
    }, [selectedIndex]);

    if (results.length === 0) return null;

    const selectedResult = results[Math.min(selectedIndex, results.length - 1)];

    // Pagination Logic
    const totalRows = selectedResult?.data?.length || 0;
    const totalPages = Math.ceil(totalRows / pageSize);
    const paginatedData = selectedResult?.data?.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    // Determine columns to display
    const columns = selectedResult.columns || (selectedResult.data && selectedResult.data.length > 0 ? Object.keys(selectedResult.data[0]) : []);

    return (
        <div className="flex h-full bg-background border-t border-border">
            {/* Sidebar: Result List */}
            <div className="w-64 flex-shrink-0 flex flex-col border-r border-border bg-muted/30">
                <div className="p-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('sql.history')}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {results.map((res, idx) => (
                        <div
                            key={idx}
                            onClick={() => setSelectedIndex(idx)}
                            className={cn(
                                "group flex flex-col p-3 border-b border-border/50 cursor-pointer transition-colors hover:bg-accent",
                                selectedIndex === idx ? "bg-accent border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center space-x-2">
                                    {res.status === 'success' ? (
                                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                    ) : (
                                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                                    )}
                                    <span className={cn("text-xs font-mono font-medium", res.status === 'error' ? "text-destructive" : "text-muted-foreground")}>
                                        #{res.sequence}
                                    </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground/70 font-mono">
                                    {res.time_cost_ms}ms
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate font-mono mb-1" title={res.sequence === 0 ? t('error.system') : res.statement}>
                                {res.sequence === 0 ? t('error.system') : res.statement.replace(/\s+/g, ' ')}
                            </div>
                            <div className="flex items-center text-[10px] text-muted-foreground/80">
                                <Database className="w-3 h-3 mr-1" />
                                {t('common.rows', { count: res.rows_affected })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content: Detail View */}
            <div className="flex-1 flex flex-col min-w-0 bg-background">
                {selectedResult && (
                    <>
                        {/* Toolbar / Info Bar */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 h-10 flex-shrink-0">
                            <div className="flex items-center space-x-4 overflow-hidden">
                                <div className="flex items-center text-xs text-muted-foreground font-mono truncate">
                                    <AlignLeft className="w-3.5 h-3.5 mr-2 text-primary" />
                                    <span className="truncate max-w-md" title={selectedResult.sequence === 0 ? t('error.system') : selectedResult.statement}>
                                        {selectedResult.sequence === 0 ? t('error.system') : selectedResult.statement}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3 text-xs text-muted-foreground font-mono">
                                <span>{t('common.rows', { count: selectedResult.rows_affected })}</span>
                                <span className="w-px h-3 bg-border" />
                                <span>{t('common.milliseconds', { count: selectedResult.time_cost_ms })}</span>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-hidden relative flex flex-col">
                            {selectedResult.error ? (
                                <div className="p-6 flex flex-col items-center justify-center text-center h-full">
                                    <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                                        <AlertCircle className="w-6 h-6 text-destructive" />
                                    </div>
                                    <h3 className="text-foreground font-medium mb-2">{t('error.execute')}</h3>
                                    <div className="bg-destructive/5 border border-destructive/20 rounded p-4 max-w-2xl">
                                        <code className="text-destructive text-xs font-mono whitespace-pre-wrap break-all">
                                            {translateError(selectedResult.error)}
                                        </code>
                                    </div>
                                </div>
                            ) : selectedResult.data && selectedResult.data.length > 0 ? (
                                <>
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="sticky top-0 z-10 bg-muted/50 shadow-sm">
                                                <tr>
                                                    <th className="w-12 px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b border-r border-border bg-muted/50 sticky left-0 z-20">
                                                        #
                                                    </th>
                                                    {columns.map((key) => (
                                                        <th key={key} className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-r border-border whitespace-nowrap bg-muted/50 min-w-[100px] max-w-[300px]">
                                                            <div className="flex items-center justify-between group cursor-col-resize">
                                                                <span className="truncate" title={key}>{key}</span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-background">
                                                {paginatedData?.map((row, rIdx) => (
                                                    <tr
                                                        key={rIdx}
                                                        className="hover:bg-muted/50 transition-colors group cursor-pointer"
                                                        onDoubleClick={() => setSelectedRow(row)}
                                                    >
                                                        <td className="px-2 py-1.5 text-center text-xs text-muted-foreground border-b border-r border-border font-mono bg-background sticky left-0 z-10 group-hover:bg-muted/50">
                                                            {(currentPage - 1) * pageSize + rIdx + 1}
                                                        </td>
                                                        {columns.map((key, cIdx) => (
                                                            <td key={cIdx} className="px-4 py-1.5 text-xs text-foreground border-b border-r border-border/50 whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis" title={String(row[key])}>
                                                                {row[key] === null ? (
                                                                    <span className="text-muted-foreground/50 italic text-[10px]">NULL</span>
                                                                ) : (
                                                                    <span className="font-mono">{String(row[key])}</span>
                                                                )}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination Footer */}
                                    <div className="h-9 border-t border-border bg-muted/30 flex items-center justify-between px-4 flex-shrink-0">
                                        <div className="text-xs text-muted-foreground">
                                            {t('common.rowRange', { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, totalRows), count: totalRows })}
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                aria-label={t('common.previousPage')}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {t('common.page', { page: currentPage, total: totalPages })}
                                            </span>
                                            <button
                                                aria-label={t('common.nextPage')}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                                    <CheckCircle className="w-12 h-12 mb-4 text-muted-foreground/50" />
                                    <p className="text-sm">{t('sql.success')}</p>
                                    <p className="text-xs mt-1">{t('sql.rowsAffected', { count: selectedResult.rows_affected })}</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Detail Drawer */}
            <DetailDrawer
                isOpen={!!selectedRow}
                onClose={() => setSelectedRow(null)}
                data={selectedRow}
                columns={columns}
            />
        </div>
    );
};
