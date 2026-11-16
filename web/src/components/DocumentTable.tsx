import { useTranslation } from '../i18n';
import React, { useState, useEffect } from 'react';
import { Hash, Calendar, ChevronRight, Copy } from 'lucide-react';

interface Document {
    [key: string]: any;
}

interface DocumentTableProps {
    documents: Document[];
    onDocumentClick?: (doc: Document) => void;
    withRowNumber?: boolean;
}

// Component for rendering ObjectId
function ObjectIdBadge({ value }: { value: string }) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 rounded text-xs text-purple-500 font-mono dark:text-purple-300">
            <Hash className="w-3 h-3" />
            <span>{value.slice(0, 8)}...</span>
            <button
                onClick={handleCopy}
                className="hover:text-purple-600 dark:hover:text-purple-200 transition-colors"
                title={t('record.copyObjectId')}
            >
                <Copy className="w-3 h-3" />
            </button>
            {copied && <span className="text-green-400">✓</span>}
        </div>
    );
}

// Component for rendering Date
function DateBadge({ timestamp }: { timestamp: string }) {
    const { locale } = useTranslation();
    const date = new Date(parseInt(timestamp));

    return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-500 dark:text-blue-300">
            <Calendar className="w-3 h-3" />
            <span>{date.toLocaleString(locale, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })}</span>
        </div>
    );
}

// Component for nested object summary with popover
function ObjectSummary({ value, onClick }: { value: any; onClick: () => void }) {
    const { t } = useTranslation();
    const fieldCount = Object.keys(value).length;

    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted border border-border rounded text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
            <span>{'{'} {t('record.fields', { count: fieldCount })} {'}'}</span>
            <ChevronRight className="w-3 h-3" />
        </button>
    );
}

// Component for array summary
function ArraySummary({ value, onClick }: { value: any[]; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
        >
            <span>[ {t('record.items', { count: value.length })} ]</span>
            <ChevronRight className="w-3 h-3" />
        </button>
    );
}

// Main cell renderer
function renderCellValue(value: any, onExpand: (val: any) => void): React.ReactNode {
    // Handle null/undefined
    if (value === null) return <span className="text-muted-foreground italic">null</span>;
    if (value === undefined) return <span className="text-muted-foreground italic">undefined</span>;

    // Handle Extended JSON BSON types
    if (typeof value === 'object' && !Array.isArray(value)) {
        // ObjectId
        if (value.$oid) {
            return <ObjectIdBadge value={value.$oid} />;
        }

        // DateTime
        if (value.$date && value.$date.$numberLong) {
            return <DateBadge timestamp={value.$date.$numberLong} />;
        }

        // Decimal128
        if (value.$numberLong) {
            return <span className="font-mono text-xs">{value.$numberLong}</span>;
        }
        if (value.$numberDecimal) {
            return <span className="text-green-600 dark:text-green-400 font-mono text-xs">{value.$numberDecimal}</span>;
        }

        // Regular nested object
        return <ObjectSummary value={value} onClick={() => onExpand(value)} />;
    }

    // Handle arrays
    if (Array.isArray(value)) {
        return <ArraySummary value={value} onClick={() => onExpand(value)} />;
    }

    // Handle primitives
    if (typeof value === 'boolean') {
        return <span className="text-orange-600 dark:text-orange-400 font-mono text-xs">{String(value)}</span>;
    }

    if (typeof value === 'number') {
        return <span className="text-cyan-600 dark:text-cyan-400 font-mono text-xs">{value}</span>;
    }

    // String (truncate if too long)
    const strValue = String(value);
    if (strValue.length > 50) {
        return (
            <span className="text-foreground text-xs" title={strValue}>
                {strValue.slice(0, 47)}...
            </span>
        );
    }

    return <span className="text-foreground text-xs">{strValue}</span>;
}

export function DocumentTable({ documents, onDocumentClick, withRowNumber = false }: DocumentTableProps) {
    const { t } = useTranslation();
    const [columns, setColumns] = useState<string[]>([]);
    const [expandedValue, setExpandedValue] = useState<any | null>(null);

    // Extract dynamic columns from documents
    useEffect(() => {
        if (documents.length === 0) {
            setColumns([]);
            return;
        }

        // Sample first 20 documents to determine columns
        const sampleDocs = documents.slice(0, 20);
        const columnSet = new Set<string>();

        sampleDocs.forEach(doc => {
            Object.keys(doc).forEach(key => columnSet.add(key));
        });

        // Convert to array and ensure _id is first
        const cols = Array.from(columnSet);
        const idIndex = cols.indexOf('_id');
        if (idIndex > -1) {
            cols.splice(idIndex, 1);
            cols.unshift('_id');
        }

        setColumns(cols);
    }, [documents]);

    if (documents.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>{t('common.noData')}</p>
            </div>
        );
    }

    return (
        <div className="relative h-full overflow-auto">
            <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted/50 z-10">
                    <tr>
                        {withRowNumber && (
                            <th className="px-3 py-2 text-center text-xs font-semibold border-b border-border whitespace-nowrap text-muted-foreground w-12 bg-muted/50 sticky left-0 z-20 border-r border-border">
                                #
                            </th>
                        )}
                        {columns.map(col => (
                            <th
                                key={col}
                                className={`
                                    px-3 py-2 text-left text-xs font-semibold border-b border-border whitespace-nowrap
                                    ${col === '_id' ? 'text-purple-600 dark:text-purple-400 bg-purple-500/5' : 'text-muted-foreground'}
                                `}
                            >
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {documents.map((doc, rowIndex) => (
                        <tr
                            key={rowIndex}
                            onClick={() => onDocumentClick?.(doc)}
                            className="border-b border-border hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                            {withRowNumber && (
                                <td className="px-3 py-2 text-center text-xs text-muted-foreground border-r border-border bg-background sticky left-0 z-10">
                                    {rowIndex + 1}
                                </td>
                            )}
                            {columns.map(col => (
                                <td
                                    key={col}
                                    className={`
                                        px-3 py-2 whitespace-nowrap
                                        ${col === '_id' ? 'bg-purple-500/5' : ''}
                                    `}
                                >
                                    {renderCellValue(doc[col], setExpandedValue)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Popover for expanded values */}
            {expandedValue && (
                <div
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
                    onClick={() => setExpandedValue(null)}
                >
                    <div
                        className="bg-card border border-border rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-foreground">{t('record.details')}</h3>
                            <button
                                onClick={() => setExpandedValue(null)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <pre className="text-xs text-foreground font-mono bg-muted p-3 rounded overflow-x-auto">
                            {JSON.stringify(expandedValue, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
