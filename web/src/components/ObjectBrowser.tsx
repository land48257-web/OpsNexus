import { useTranslation } from '../i18n';
import { useState, useEffect, useRef } from 'react';
import { Table, Eye, RefreshCw, Search, Database, PanelLeftClose } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { SchemaSelector } from './SchemaSelector';
import { useLayoutStore } from '../stores/useLayoutStore';

interface ObjectBrowserProps {
    assetId: string;
    currentDatabase: string;
    onDatabaseChange: (db: string) => void;
    onSelectTable: (table: string) => void;
}

interface TableItem {
    name: string;
    type: 'table' | 'view';
    comment?: string;
}

export function ObjectBrowser({ assetId, currentDatabase, onDatabaseChange, onSelectTable }: ObjectBrowserProps) {
    const { t } = useTranslation();
    const [databases, setDatabases] = useState<string[]>([]);
    const [tables, setTables] = useState<TableItem[]>([]);
    const [loadingTables, setLoadingTables] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const authenticatedFetch = useAuthenticatedFetch();
    const { toggleSidebar } = useLayoutStore();

    const currentDatabaseRef = useRef(currentDatabase);

    useEffect(() => {
        currentDatabaseRef.current = currentDatabase;
    }, [currentDatabase]);

    // Fetch Databases List
    useEffect(() => {
        const fetchDatabases = async () => {
            try {
                const response = await authenticatedFetch(`/api/v1/assets/${encodeURIComponent(assetId)}/databases`);
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        setDatabases(data);
                        // If no current database, select the first one
                        if (!currentDatabaseRef.current && data.length > 0) {
                            onDatabaseChange(data[0]);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to fetch databases", error);
            }
        };
        fetchDatabases();
    }, [assetId, authenticatedFetch]);

    // Fetch Tables when currentDatabase changes
    useEffect(() => {
        const fetchTables = async () => {
            if (!currentDatabase) {
                setTables([]);
                return;
            }

            setLoadingTables(true);
            try {
                const response = await authenticatedFetch(`/api/v1/assets/${encodeURIComponent(assetId)}/tables?database=${encodeURIComponent(currentDatabase)}`);
                if (response.ok) {
                    const data = await response.json();
                    const tableList: TableItem[] = (data.tables || []).map((t: any) => ({
                        name: t.name,
                        type: 'table', // API might not distinguish yet
                        comment: t.comment
                    }));
                    setTables(tableList);
                } else {
                    setTables([]);
                }
            } catch (error) {
                console.error("Failed to fetch tables", error);
                setTables([]);
            } finally {
                setLoadingTables(false);
            }
        };

        fetchTables();
    }, [assetId, currentDatabase, authenticatedFetch]);

    const filteredTables = tables.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 border-r border-border">
            {/* Header: Database Selector */}
            <div className="p-3 border-b border-border space-y-3">
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('database.title')}</label>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => {
                                    // Trigger re-fetch logic if needed, or just refresh tables
                                    const db = currentDatabase;
                                    onDatabaseChange(''); // Hack to force effect? Better to separate fetch logic.
                                    setTimeout(() => onDatabaseChange(db), 0);
                                }}
                                className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                                title={t('database.refreshTables')}
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", loadingTables && "animate-spin")} />
                            </button>
                            <button
                                onClick={toggleSidebar}
                                className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                                title={t('common.collapseSidebar')}
                            >
                                <PanelLeftClose className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <SchemaSelector
                        value={currentDatabase}
                        onChange={onDatabaseChange}
                        schemas={databases}
                        className="w-full"
                    />
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={t('database.searchObjects')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                </div>
            </div>

            {/* Body: Object List */}
            <div className="flex-1 overflow-y-auto p-2">
                {loadingTables ? (
                    <div className="space-y-2 px-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-muted/50 animate-pulse" />
                                <div className="h-4 flex-1 rounded bg-muted/50 animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : filteredTables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
                        <Database className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs">{t('database.noTables')}</p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {filteredTables.map(table => (
                            <button
                                key={table.name}
                                onClick={() => onSelectTable(table.name)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors group text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                                title={table.comment || table.name}
                            >
                                {table.type === 'view' ? (
                                    <Eye className="w-3.5 h-3.5 text-purple-500/70 flex-shrink-0" />
                                ) : (
                                    <Table className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" />
                                )}
                                <span className="truncate">{table.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
