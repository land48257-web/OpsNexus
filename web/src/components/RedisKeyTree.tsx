import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Key, RefreshCw, Database, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { buildRedisKeyTree, TreeNode } from '../lib/redisKeyTree';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

interface RedisKeyTreeProps {
    assetId: string;
    db: number;
    onDbChange: (db: number) => void;
    onSelectKey: (key: string) => void;
}


export function RedisKeyTree({ assetId, db, onDbChange, onSelectKey }: RedisKeyTreeProps) {
    const { t } = useTranslation();
    const [keys, setKeys] = useState<string[]>([]);
    const [cursor, setCursor] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scanPatternRef = useRef('*');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [pattern, setPattern] = useState<string>('*');
    const authenticatedFetch = useAuthenticatedFetch();

    // DB Selector state
    const [isDbOpen, setIsDbOpen] = useState(false);
    const dbContainerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dbContainerRef.current && !dbContainerRef.current.contains(event.target as Node)) {
                setIsDbOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchKeys = async (reset = false) => {
        if (loading) return;
        setLoading(true);
        setError(null);
        if (reset) scanPatternRef.current = pattern;
        try {
            const nextCursor = reset ? 0 : cursor;
            const res = await authenticatedFetch('/api/v1/redis/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    pattern: scanPatternRef.current,
                    cursor: nextCursor,
                    count: 1000,
                    db: db
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('error.scan'));

            if (reset) {
                setKeys(data.keys || []);
            } else {
                setKeys(prev => [...new Set([...prev, ...(data.keys || [])])]);
            }
            setCursor(data.cursor);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys(true);
    }, [assetId, db]);

    // Build Tree
    const tree = useMemo(() => buildRedisKeyTree(keys), [keys]);

    const toggleExpand = (path: string) => {
        setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const handleSelect = (key: string) => {
        setSelectedKey(key);
        onSelectKey(key);
    };

    const renderTree = (nodes: Record<string, TreeNode>, level = 0) => {
        return Object.values(nodes).sort((a, b) => {
            // Folders first, then files
            if (Object.keys(a.children).length > 0 && Object.keys(b.children).length === 0) return -1;
            if (Object.keys(a.children).length === 0 && Object.keys(b.children).length > 0) return 1;
            return a.name.localeCompare(b.name);
        }).map(node => {
            const hasChildren = Object.keys(node.children).length > 0;
            const isExpanded = expanded[node.fullPath];
            const isSelected = selectedKey === node.fullPath;

            return (
                <div key={node.fullPath}>
                    <div
                        className={cn(
                            "flex items-center py-1 px-2 cursor-pointer hover:bg-accent/50 text-sm transition-colors select-none",
                            isSelected && "bg-accent text-primary"
                        )}
                        style={{ paddingLeft: `${level * 12 + 8}px` }}
                        onClick={() => hasChildren ? toggleExpand(node.fullPath) : handleSelect(node.fullPath)}
                    >
                        <span className="mr-1 text-muted-foreground flex-shrink-0">
                            {hasChildren ? (
                                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                            ) : (
                                <Key className="w-3 h-3 ml-0.5" />
                            )}
                        </span>
                        <span className={cn("truncate", hasChildren ? "font-medium text-foreground" : "text-muted-foreground")}>
                            {node.name}
                        </span>
                        {hasChildren && node.isLeaf && <button
                            title={t('redis.viewKey', { key: node.fullPath })}
                            className="ml-2 text-primary"
                            onClick={e => { e.stopPropagation(); handleSelect(node.fullPath); }}
                        ><Key className="w-3 h-3" /></button>}
                        {hasChildren && (
                            <span className="ml-2 text-xs text-muted-foreground">
                                ({Object.keys(node.children).length})
                            </span>
                        )}
                    </div>
                    {hasChildren && isExpanded && (
                        <div>
                            {renderTree(node.children, level + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="flex flex-col h-full bg-background border-r border-border">
            {/* Toolbar */}
            <div className="p-2 border-b border-border flex flex-col gap-2">
                {/* DB Selector */}
                <div className="relative" ref={dbContainerRef}>
                    <button
                        onClick={() => setIsDbOpen(!isDbOpen)}
                        className={cn(
                            "flex items-center w-full bg-background border border-border rounded px-2 py-1.5 transition-colors",
                            "hover:border-primary/50 cursor-pointer",
                            isDbOpen && "border-primary/50 ring-1 ring-primary/20"
                        )}
                    >
                        <Database className="w-3.5 h-3.5 text-muted-foreground mr-2 flex-shrink-0" />
                        <span className="text-xs text-foreground truncate flex-1 text-left">
                            DB {db}
                        </span>
                        <ChevronDown className={cn(
                            "w-3 h-3 text-muted-foreground ml-1 transition-transform duration-200",
                            isDbOpen && "rotate-180"
                        )} />
                    </button>

                    {isDbOpen && (
                        <div className="absolute top-full left-0 mt-1 w-full max-h-[300px] overflow-y-auto bg-popover border border-border rounded-md shadow-xl z-50 py-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                            {Array.from({ length: 16 }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        onDbChange(i);
                                        setIsDbOpen(false);
                                    }}
                                    className={cn(
                                        "w-full px-3 py-1.5 text-xs text-left flex items-center hover:bg-accent transition-colors",
                                        db === i ? "text-primary bg-accent/50" : "text-foreground"
                                    )}
                                >
                                    <span className="flex-1 truncate">DB {i}</span>
                                    {db === i && <Check className="w-3 h-3 ml-2 flex-shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                        placeholder={t('redis.pattern')}
                        value={pattern}
                        onChange={(e) => setPattern(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchKeys(true)}
                    />
                    <button
                        onClick={() => fetchKeys(true)}
                        className="p-1 hover:bg-accent rounded text-muted-foreground"
                        title={t('common.refresh')}
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {error && <div role="alert" className="p-2 text-xs text-destructive">{translateError(error)}</div>}
            {/* Tree */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {Object.keys(tree).length === 0 && !loading ? (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                        {t('redis.noKeys')}
                    </div>
                ) : (
                    renderTree(tree)
                )}

                {/* Load More */}
                {cursor !== 0 && (
                    <div
                        className="p-2 text-center text-xs text-primary cursor-pointer hover:text-primary/80 border-t border-border"
                        onClick={() => fetchKeys(false)}
                    >
                        {loading ? t('common.loading') : t('redis.loadMore')}
                    </div>
                )}
            </div>

            {/* Status Bar */}
            <div className="p-1 px-2 bg-background border-t border-border text-[10px] text-muted-foreground flex justify-between">
                <span>{t('redis.loaded', { count: keys.length })}</span>
                <span>{t('redis.cursor', { cursor: String(cursor) })}</span>
            </div>
        </div>
    );
}
