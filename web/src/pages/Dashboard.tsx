import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect, useRef } from 'react';
import { SSHRemoteTerminal, TerminalHandle } from '../components/Terminal';
import { FileTree } from '../components/FileTree';
import { Terminal, Database, X, Layers, Server, Search, Command, Zap, Cpu, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { RedisManager } from '../components/RedisManager';
import { MongoManager } from '../components/MongoManager';
import { SQLManager } from '../components/SQLManager';
import { useAuthStore } from '../stores/authStore';
import { ActivityBar, ActivityType } from '../components/ActivityBar';
import { AssetExplorer, AssetConfig, Group } from '../components/AssetExplorer';
import { ResizableSplit } from '../components/ResizableSplit';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { buildWsUrl, toLoginPath } from '../lib/basePath';

type Tab = {
    id: string;
    title: string;
    type: 'terminal' | 'editor' | 'redis' | 'mongo';
    assetId: string;
    isConnected?: boolean; // Track SSH connection state
};

// --- Sub-components for Dashboard UI ---

const WelcomeScreen = () => {
    const { t } = useTranslation();
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 text-foreground p-8 animate-in-fade select-none">
            <div className="max-w-2xl w-full space-y-8">
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 mx-auto bg-primary/10 rounded-3xl flex items-center justify-center border border-primary/20 shadow-xl shadow-primary/5 mb-6">
                        <Command className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
                        {t('workspace.title')}
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                        {t('workspace.welcome')}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
                    <div className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-all cursor-pointer group">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3 group-hover:bg-blue-500/20 transition-colors">
                            <Terminal className="w-5 h-5 text-blue-500" />
                        </div>
                        <h3 className="font-semibold mb-1">{t('workspace.ssh')}</h3>
                        <p className="text-sm text-muted-foreground">{t('workspace.sshDescription')}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card hover:border-emerald-500/50 transition-all cursor-pointer group">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition-colors">
                            <Database className="w-5 h-5 text-emerald-500" />
                        </div>
                        <h3 className="font-semibold mb-1">{t('workspace.databases')}</h3>
                        <p className="text-sm text-muted-foreground">{t('workspace.databasesDescription')}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card hover:border-orange-500/50 transition-all cursor-pointer group">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-3 group-hover:bg-orange-500/20 transition-colors">
                            <Zap className="w-5 h-5 text-orange-500" />
                        </div>
                        <h3 className="font-semibold mb-1">{t('workspace.quickActions')}</h3>
                        <p className="text-sm text-muted-foreground">{t('workspace.quickActionsDescription')}</p>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-8 border-t border-border/50">
                    <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span>{t('workspace.connected', { count: 0 })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4" />
                        <span>{t('workspace.healthy')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Dashboard Component ---

function Dashboard() {
    const { t } = useTranslation();
    const [config, setConfig] = useState<AssetConfig | null>(null);
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const terminalRefs = useRef<Record<string, TerminalHandle | null>>({});

    // Activity Bar State
    const [activeActivity, setActiveActivity] = useState<ActivityType>('explorer');
    const [isPanelOpen, setIsPanelOpen] = useState(true);

    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);

    const authenticatedFetch = useAuthenticatedFetch();

    useEffect(() => {
        if (!token) return;

        authenticatedFetch('/api/v1/assets')
            .then(async res => { if (!res.ok) throw new Error('Failed to load assets'); return res.json(); })
            .then(data => {
                setConfig(data);
                const initialExpanded: Record<string, boolean> = {};
                data.groups?.forEach((g: Group) => {
                    initialExpanded[g.name] = true;
                });
                setExpandedGroups(initialExpanded);
            })
            .catch(err => console.error("Failed to load assets:", err));
    }, [token, authenticatedFetch]);

    const toggleGroup = (name: string) => {
        setExpandedGroups(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const openTab = (id: string, title: string, type: 'terminal' | 'editor' | 'redis' | 'mongo') => {
        const existing = tabs.find(t => t.id === id);
        if (existing) {
            setActiveTabId(id);
            return;
        }
        const newTab: Tab = {
            id,
            title,
            type,
            assetId: id,
            isConnected: false
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(id);
    };

    const handleConnected = (tabId: string) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isConnected: true } : t));
    };

    const closeTab = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id && newTabs.length > 0) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        } else if (newTabs.length === 0) {
            setActiveTabId(null);
        }
        // Clean up ref
        delete terminalRefs.current[id];
    };

    const handleFileUpload = async (assetId: string, files: FileList) => {
        const terminal = terminalRefs.current[assetId];
        if (!terminal) {
            console.error('Terminal ref not found for', assetId);
            return;
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            terminal.write(`\r\n\x1b[36m${t('terminal.uploadFile', { name: file.name, size: (file.size / 1024).toFixed(2) })}\x1b[0m\r\n`);

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await authenticatedFetch(`/api/v1/sftp/${assetId}/upload?path=/tmp`, {
                    method: 'POST',
                    body: formData,
                });

                if (response.ok) {
                    const data = await response.json();
                    terminal.write(`\x1b[32m${t('terminal.uploadSuccess', { path: data.path })}\x1b[0m\r\n`);
                } else {
                    const error = await response.json();
                    terminal.write(`\x1b[31m${t('terminal.uploadFailed', { error: translateError(error.error) })}\x1b[0m\r\n`);
                }
            } catch (err) {
                terminal.write(`\x1b[31m${t('terminal.uploadFailed', { error: translateError(err) })}\x1b[0m\r\n`);
            }
        }

        // Send Enter key to refresh shell prompt
        const ws = (window as any).sshWebSocket;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('\r');
        }
    };

    const handleLogout = () => {
        logout();
        window.location.href = toLoginPath();
    };

    const handleActivityChange = (activity: ActivityType) => {
        if (activeActivity === activity) {
            // Toggle panel if clicking the same activity
            setIsPanelOpen(!isPanelOpen);
        } else {
            setActiveActivity(activity);
            setIsPanelOpen(true);
        }
    };

    return (
        <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
            {/* Level 1: Activity Bar */}
            <ActivityBar
                activeActivity={activeActivity}
                onActivityChange={handleActivityChange}
            />

            {/* Level 2: Side Panel */}
            <div
                className={cn(
                    "flex flex-col bg-muted/30 border-r border-border transition-all duration-300 ease-in-out overflow-hidden relative",
                    isPanelOpen ? "w-72 opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-full"
                )}
            >
                <div className="min-w-[288px] h-full flex flex-col">
                    {activeActivity === 'explorer' && (
                        <AssetExplorer
                            config={config}
                            expandedGroups={expandedGroups}
                            toggleGroup={toggleGroup}
                            openTab={openTab}
                            handleLogout={handleLogout}
                        />
                    )}
                    {activeActivity === 'search' && (
                        <div className="p-6 text-center h-full flex flex-col items-center justify-center text-muted-foreground">
                            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                                <Search className="w-6 h-6 opacity-50" />
                            </div>
                            <h3 className="font-medium mb-1">{t('workspace.search')}</h3>
                            <p className="text-sm opacity-60">{t('workspace.searchDescription')}</p>
                            <span className="mt-4 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{t('common.comingSoon')}</span>
                        </div>
                    )}
                    {activeActivity === 'monitor' && (
                        <div className="p-6 text-center h-full flex flex-col items-center justify-center text-muted-foreground">
                            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                                <Activity className="w-6 h-6 opacity-50" />
                            </div>
                            <h3 className="font-medium mb-1">{t('workspace.monitor')}</h3>
                            <p className="text-sm opacity-60">{t('workspace.monitorDescription')}</p>
                            <span className="mt-4 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{t('common.comingSoon')}</span>
                        </div>
                    )}
                    {activeActivity === 'settings' && (
                        <div className="p-6 text-center h-full flex flex-col items-center justify-center text-muted-foreground">
                            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                                <Layers className="w-6 h-6 opacity-50" />
                            </div>
                            <h3 className="font-medium mb-1">{t('common.settings')}</h3>
                            <p className="text-sm opacity-60">{t('workspace.settingsDescription')}</p>
                            <span className="mt-4 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{t('common.comingSoon')}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 bg-background relative z-0">
                {/* Tabs Header */}
                <div className="flex items-end bg-muted/30 border-b border-border overflow-x-auto no-scrollbar pt-1.5 px-0 h-10 select-none">
                    {tabs.map(tab => {
                        const isActive = activeTabId === tab.id;
                        return (
                            <div
                                key={tab.id}
                                onClick={() => setActiveTabId(tab.id)}
                                className={cn(
                                    "group flex items-center pl-3 pr-2 py-1.5 text-xs font-medium min-w-[140px] max-w-[220px] cursor-pointer transition-all relative border-r border-border/50",
                                    isActive
                                        ? "bg-background text-primary border-t-2 border-t-primary rounded-t-sm z-10 shadow-sm"
                                        : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-background/50 border-t-2 border-t-transparent mb-[1px]"
                                )}
                            >
                                {tab.type === 'terminal' && <Terminal className={cn("w-3.5 h-3.5 mr-2", isActive ? "text-primary" : "text-muted-foreground")} />}
                                {tab.type === 'editor' && <Database className={cn("w-3.5 h-3.5 mr-2", isActive ? "text-emerald-500" : "text-muted-foreground")} />}
                                {tab.type === 'redis' && <Layers className={cn("w-3.5 h-3.5 mr-2", isActive ? "text-red-500" : "text-muted-foreground")} />}
                                {tab.type === 'mongo' && <Database className={cn("w-3.5 h-3.5 mr-2", isActive ? "text-green-500" : "text-muted-foreground")} />}

                                <span className="truncate flex-1">{tab.title}</span>

                                <button
                                    onClick={(e) => closeTab(e, tab.id)}
                                    className={cn(
                                        "ml-1 p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-all",
                                        isActive ? "hover:bg-muted text-muted-foreground hover:text-foreground" : "hover:bg-muted/80 text-muted-foreground"
                                    )}
                                >
                                    <X className="w-3 h-3" />
                                </button>

                                {/* Connector / Separator fix */}
                                {isActive && (
                                    <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-background" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="flex-1 relative bg-background">
                    {tabs.length === 0 ? (
                        <WelcomeScreen />
                    ) : (
                        tabs.map(tab => (
                            <div
                                key={tab.id}
                                className={cn(
                                    "absolute inset-0 flex flex-col bg-background transition-opacity duration-200",
                                    activeTabId === tab.id
                                        ? "z-10 opacity-100 pointer-events-auto"
                                        : "z-0 opacity-0 pointer-events-none"
                                )}
                            >
                                {tab.type === 'terminal' && (
                                    <ResizableSplit
                                        direction="horizontal"
                                        initialSize={20}
                                        minFirstPixels={200}
                                        minSecondPixels={400}
                                        left={
                                            <div className="h-full border-r border-border bg-card/30">
                                                <FileTree assetId={tab.assetId} enabled={tab.isConnected} />
                                            </div>
                                        }
                                        right={
                                            <div className="flex-1 bg-black h-full overflow-hidden relative">
                                                <SSHRemoteTerminal
                                                    ref={(ref) => terminalRefs.current[tab.assetId] = ref}
                                                    wsUrl={buildWsUrl(`/api/v1/terminal/ws?asset_id=${encodeURIComponent(tab.assetId)}&token=${encodeURIComponent(token || '')}`)}
                                                    onFileUpload={(files) => handleFileUpload(tab.assetId, files)}
                                                    onConnected={() => handleConnected(tab.id)}
                                                />
                                            </div>
                                        }
                                    />
                                )}

                                {tab.type === 'editor' && (
                                    <SQLManager assetId={tab.assetId} />
                                )}

                                {tab.type === 'redis' && (
                                    <RedisManager assetId={tab.assetId} />
                                )}

                                {tab.type === 'mongo' && (
                                    <MongoManager assetId={tab.assetId} />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div >
    );
}

export default Dashboard;
