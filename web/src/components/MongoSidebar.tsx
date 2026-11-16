import { useTranslation } from '../i18n';
import { useState, useMemo } from 'react';
import { Database, Search, Folder, Eye, RefreshCw, PanelLeftClose } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLayoutStore } from '../stores/useLayoutStore';

interface MongoSidebarProps {
    databases: string[];
    currentDatabase: string;
    onDatabaseChange: (db: string) => void;
    collections: string[];
    onCollectionClick: (collection: string) => void;
    onRefresh: () => void;
    isLoading?: boolean;
}

export function MongoSidebar({
    databases,
    currentDatabase,
    onDatabaseChange,
    collections,
    onCollectionClick,
    onRefresh,
    isLoading
}: MongoSidebarProps) {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const { toggleSidebar } = useLayoutStore();

    const filteredCollections = useMemo(() => {
        return collections.filter(c =>
            c.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [collections, searchTerm]);

    // Simple heuristic to distinguish views from collections if naming convention exists,
    // otherwise default to Folder icon. In a real app, backend should provide type.
    // For now, we'll assume everything is a collection unless it ends with 'View'.
    const getIcon = (name: string) => {
        if (name.endsWith('View')) return <Eye className="w-4 h-4 text-blue-400" />;
        return <Folder className="w-4 h-4 text-amber-400" />;
    };

    return (
        <div className="h-full flex flex-col bg-background border-r border-border">
            {/* Header / Database Selector */}
            <div className="p-3 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Database className="w-4 h-4" />
                        <span>{t('database.explorer')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onRefresh}
                            className={cn(
                                "text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent",
                                isLoading && "animate-spin"
                            )}
                            title={t('common.refresh')}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={toggleSidebar}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
                            title={t('common.collapseSidebar')}
                        >
                            <PanelLeftClose className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <select
                    value={currentDatabase}
                    onChange={(e) => onDatabaseChange(e.target.value)}
                    className="w-full bg-muted/50 border border-border text-foreground text-xs rounded px-2 py-1.5 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                    <option value="" disabled>{t('database.select')}</option>
                    {databases.map(db => (
                        <option key={db} value={db}>{db}</option>
                    ))}
                </select>

                <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('database.searchCollections')}
                        className="w-full bg-muted/30 border border-border rounded pl-8 pr-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                    />
                </div>
            </div>

            {/* Collection List */}
            <div className="flex-1 overflow-y-auto p-2">
                {currentDatabase ? (
                    <div className="space-y-0.5">
                        {filteredCollections.length > 0 ? (
                            filteredCollections.map(col => (
                                <button
                                    key={col}
                                    onClick={() => onCollectionClick(col)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group text-left"
                                >
                                    {getIcon(col)}
                                    <span className="truncate">{col}</span>
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-4 text-xs text-muted-foreground">
                                {searchTerm ? t('database.noMatches') : t('database.noCollections')}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                        {t('database.selectToBrowse')}
                    </div>
                )}
            </div>
        </div>
    );
}
