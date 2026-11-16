import { useTranslation } from '../i18n';
import { useState, useEffect } from 'react';
import { ResizableSplit } from './ResizableSplit';
import { Terminal, Table2, X, PanelLeftOpen } from 'lucide-react';
import { ScriptConsole } from './ScriptConsole';
import { CollectionViewer } from './CollectionViewer';
import { MongoSidebar } from './MongoSidebar';
import { cn } from '../lib/utils';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { useLayoutStore } from '../stores/useLayoutStore';

interface MongoManagerProps {
    assetId: string;
}

interface MongoTab {
    id: string;
    type: 'script' | 'collection';
    title: string;
    data?: {
        database: string;
        collection: string;
    };
}

export function MongoManager({ assetId }: MongoManagerProps) {
    const { t } = useTranslation();
    const [databases, setDatabases] = useState<string[]>([]);
    const [currentDatabase, setCurrentDatabase] = useState<string>('');
    const [collections, setCollections] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const authenticatedFetch = useAuthenticatedFetch();
    const { isSidebarOpen, toggleSidebar } = useLayoutStore();

    // Tab State
    const [tabs, setTabs] = useState<MongoTab[]>([
        { id: 'script-console', type: 'script', title: '' }
    ]);
    const [activeTabId, setActiveTabId] = useState<string>('script-console');

    // Load databases on mount
    useEffect(() => {
        fetchDatabases();
    }, [assetId]);

    // Keyboard shortcut for toggling sidebar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                toggleSidebar();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleSidebar]);

    // Load collections when database changes
    useEffect(() => {
        if (currentDatabase) {
            fetchCollections(currentDatabase);
        } else {
            setCollections([]);
        }
    }, [currentDatabase]);

    const fetchDatabases = async () => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(`/api/v1/mongo/databases?asset_id=${encodeURIComponent(assetId)}`);
            const data = await response.json();

            let dbList = data.databases || [];
            const defaultDb = data.default_database;

            // If default DB is specified but not in the list, add it (it might be a specific authorized DB)
            if (defaultDb && !dbList.includes(defaultDb)) {
                dbList = [defaultDb, ...dbList].sort();
            }

            setDatabases(dbList);

            // Set default database if none selected and list is not empty
            if (!currentDatabase && dbList.length > 0) {
                if (defaultDb) {
                    setCurrentDatabase(defaultDb);
                } else {
                    // Try to find 'admin' or use first one
                    const fallback = dbList.includes('admin') ? 'admin' : dbList[0];
                    setCurrentDatabase(fallback);
                }
            }
        } catch (error) {
            console.error('Failed to fetch databases:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCollections = async (dbName: string) => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(`/api/v1/mongo/collections?asset_id=${encodeURIComponent(assetId)}&database=${encodeURIComponent(dbName)}`);
            const data = await response.json();
            setCollections(data.collections || []);
        } catch (error) {
            console.error('Failed to fetch collections:', error);
            setCollections([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCollectionClick = (collection: string) => {
        const tabId = `collection-${currentDatabase}-${collection}`;

        // Check if tab already exists
        if (!tabs.find(t => t.id === tabId)) {
            const newTab: MongoTab = {
                id: tabId,
                type: 'collection',
                title: collection,
                data: {
                    database: currentDatabase,
                    collection: collection
                }
            };
            setTabs(prev => [...prev, newTab]);
        }

        setActiveTabId(tabId);
    };

    const closeTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        if (tabId === 'script-console') return; // Cannot close console

        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            // Switch to the last tab or console
            const lastTab = newTabs[newTabs.length - 1];
            setActiveTabId(lastTab ? lastTab.id : 'script-console');
        }
    };

    const activeTab = tabs.find(t => t.id === activeTabId);

    return (
        <div className="flex flex-col h-full w-full bg-background">
            <div className="flex-1 overflow-hidden relative">
                <ResizableSplit
                    direction="horizontal"
                    initialSize={256}
                    usePixels={true}
                    collapsed={!isSidebarOpen}
                    left={
                        <MongoSidebar
                            databases={databases}
                            currentDatabase={currentDatabase}
                            onDatabaseChange={setCurrentDatabase}
                            collections={collections}
                            onCollectionClick={handleCollectionClick}
                            onRefresh={() => {
                                fetchDatabases();
                                if (currentDatabase) fetchCollections(currentDatabase);
                            }}
                            isLoading={isLoading}
                        />
                    }
                    right={
                        <div className="flex flex-col h-full bg-background">
                            {/* Tabs Header */}
                            <div className="flex items-center border-b border-border bg-muted/10 flex-shrink-0 overflow-x-auto no-scrollbar">
                                {!isSidebarOpen && (
                                    <button
                                        onClick={toggleSidebar}
                                        className="flex items-center justify-center w-9 h-full border-r border-border hover:bg-accent hover:text-foreground text-muted-foreground transition-colors"
                                        title={t('common.expandSidebar')}
                                    >
                                        <PanelLeftOpen className="w-4 h-4" />
                                    </button>
                                )}
                                {tabs.map(tab => (
                                    <div
                                        key={tab.id}
                                        onClick={() => setActiveTabId(tab.id)}
                                        className={cn(
                                            "group flex items-center px-4 py-2.5 text-xs font-medium border-r border-border min-w-[120px] max-w-[200px] cursor-pointer select-none transition-colors relative",
                                            activeTabId === tab.id
                                                ? "bg-background text-foreground border-t-2 border-t-primary"
                                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border-t-2 border-t-transparent"
                                        )}
                                        title={tab.type === 'script' ? t('mongo.console') : tab.title}
                                    >
                                        {tab.type === 'script' ? (
                                            <Terminal className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                                        ) : (
                                            <Table2 className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                                        )}
                                        <span className="truncate flex-1">{tab.type === 'script' ? t('mongo.console') : tab.title}</span>

                                        {tab.id !== 'script-console' && (
                                            <button
                                                onClick={(e) => closeTab(e, tab.id)}
                                                className="ml-2 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-hidden relative">
                                {/* Keep Script Console mounted but hidden when not active to preserve state */}
                                <div className={cn("absolute inset-0", activeTabId === 'script-console' ? "z-10" : "z-0 hidden")}>
                                    <ScriptConsole
                                        assetId={assetId}
                                        currentDatabase={currentDatabase}
                                        collections={collections} // Pass collections for autocomplete
                                    />
                                </div>

                                {activeTab?.type === 'collection' && activeTab.data && (
                                    <div className="absolute inset-0 z-10">
                                        <CollectionViewer
                                            key={activeTab.id} // Re-mount when switching between different collection tabs
                                            assetId={assetId}
                                            database={activeTab.data.database}
                                            collection={activeTab.data.collection}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    }
                />
            </div>
        </div>
    );
}
