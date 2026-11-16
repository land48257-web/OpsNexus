import { useTranslation } from '../i18n';
import { useState, useEffect } from 'react';
import { Code2, Table, X, PanelLeftOpen } from 'lucide-react';
import { ResizableSplit } from './ResizableSplit';
import { SQLConsole } from './SQLConsole';
import { DataPreview } from './DataPreview';
import { ObjectBrowser } from './ObjectBrowser';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { cn } from '../lib/utils';
import { useLayoutStore } from '../stores/useLayoutStore';

interface SQLManagerProps {
    assetId: string;
}

interface Tab {
    id: string;
    type: 'console' | 'preview';
    title: string;
    data?: {
        database: string;
        tableName: string;
    };
}

export function SQLManager({ assetId }: SQLManagerProps) {
    const { t } = useTranslation();
    const [currentDatabase, setCurrentDatabase] = useState<string>('');
    const [dbType, setDbType] = useState<string>('mysql');
    const [consoleScript, setConsoleScript] = useState<string>('');
    const { isSidebarOpen, toggleSidebar } = useLayoutStore();

    // Tabs State
    const [tabs, setTabs] = useState<Tab[]>([
        { id: 'console', type: 'console', title: '' }
    ]);
    const [activeTabId, setActiveTabId] = useState<string>('console');

    const authenticatedFetch = useAuthenticatedFetch();

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

    // Fetch Asset Info to get default database and type
    useEffect(() => {
        const init = async () => {
            try {
                const assetRes = await authenticatedFetch(`/api/v1/assets`);
                if (assetRes.ok) {
                    const assets = await assetRes.json();
                    let asset: any = null;
                    if (assets.groups && Array.isArray(assets.groups)) {
                        for (const group of assets.groups) {
                            if (group.databases && Array.isArray(group.databases)) {
                                const found = group.databases.find((d: any) => d.id === assetId);
                                if (found) {
                                    asset = found;
                                    break;
                                }
                            }
                        }
                    }
                    if (asset) {
                        setDbType(asset.type);
                        if (asset.database) {
                            setCurrentDatabase(asset.database);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to fetch asset info", error);
            }
        };

        if (assetId) {
            init();
        }
    }, [assetId, authenticatedFetch]);

    const handleSelectTable = (tableName: string) => {
        const tabId = `preview-${currentDatabase}-${tableName}`;

        // Check if tab already exists
        if (!tabs.find(t => t.id === tabId)) {
            const newTab: Tab = {
                id: tabId,
                type: 'preview',
                title: tableName,
                data: {
                    database: currentDatabase,
                    tableName: tableName
                }
            };
            setTabs(prev => [...prev, newTab]);
        }

        setActiveTabId(tabId);
    };

    const closeTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        if (tabId === 'console') return; // Cannot close console

        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            // Switch to the last tab or console
            const lastTab = newTabs[newTabs.length - 1];
            setActiveTabId(lastTab ? lastTab.id : 'console');
        }
    };

    const activeTab = tabs.find(t => t.id === activeTabId);

    return (
        <div className="h-full w-full flex flex-col bg-background text-foreground overflow-hidden">
            <ResizableSplit
                direction="horizontal"
                initialSize={256}
                usePixels={true}
                minFirstPixels={200}
                collapsed={!isSidebarOpen}
                left={
                    <ObjectBrowser
                        assetId={assetId}
                        currentDatabase={currentDatabase}
                        onDatabaseChange={setCurrentDatabase}
                        onSelectTable={handleSelectTable}
                    />
                }
                right={
                    <div className="flex flex-col flex-1 h-full min-w-0 bg-background">
                        {/* Tab Strip */}
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
                                    title={tab.type === 'console' ? t('sql.console') : tab.title}
                                >
                                    {tab.type === 'console' ? (
                                        <Code2 className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                                    ) : (
                                        <Table className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                                    )}
                                    <span className="truncate flex-1">{tab.type === 'console' ? t('sql.console') : tab.title}</span>

                                    {tab.id !== 'console' && (
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
                            <div className={cn('absolute inset-0', activeTab?.type === 'console' ? 'z-10' : 'hidden')}>
                                <SQLConsole
                                    assetId={assetId}
                                    currentDatabase={currentDatabase}
                                    dbType={dbType}
                                    initialScript={consoleScript}
                                    onScriptChange={setConsoleScript}
                                />
                            </div>

                            {activeTab?.type === 'preview' && activeTab.data && (
                                <DataPreview
                                    key={activeTab.id}
                                    assetId={assetId}
                                    database={activeTab.data.database}
                                    tableName={activeTab.data.tableName}
                                />
                            )}
                        </div>
                    </div>
                }
            />
        </div>
    );
}
