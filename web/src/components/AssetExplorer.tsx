import { useTranslation } from '../i18n';
import { ChevronRight, ChevronDown, Terminal, Database, Layers, User, Leaf, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { ThemeToggle } from './ThemeToggle';

// Types matching the backend JSON (duplicated from Dashboard for now to avoid circular deps or complex refactor)
export interface AssetConfig {
    groups: Group[];
}

export interface Group {
    name: string;
    servers: ServerAsset[];
    databases: DatabaseAsset[];
}

export interface ServerAsset {
    id: string;
    name: string;
    host: string;
    port: number;
    user: string;
}

export interface DatabaseAsset {
    id: string;
    name: string;
    type: string;
    host?: string;
    database?: string;
}

interface AssetExplorerProps {
    config: AssetConfig | null;
    expandedGroups: Record<string, boolean>;
    toggleGroup: (name: string) => void;
    openTab: (id: string, title: string, type: 'terminal' | 'editor' | 'redis' | 'mongo') => void;
    handleLogout: () => void;
}

export function AssetExplorer({
    config,
    expandedGroups,
    toggleGroup,
    openTab,
    handleLogout
}: AssetExplorerProps) {
    const { t } = useTranslation();
    const username = useAuthStore(state => state.username);
    return (
        <div className="h-full flex flex-col">
            <div className="px-4 py-3 text-xs font-semibold text-muted-foreground/70 tracking-wider uppercase">
                {t('assets.title')}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {!config ? (
                    <div className="p-4 text-muted-foreground text-sm text-center">{t('assets.loading')}</div>
                ) : (
                    (config.groups ?? []).map((group) => (
                        <div key={group.name} className="mb-2">
                            <button
                                onClick={() => toggleGroup(group.name)}
                                className="flex items-center w-full px-2 py-1 text-xs font-bold text-muted-foreground uppercase hover:text-foreground transition-colors"
                            >
                                {expandedGroups[group.name] ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                                {group.name === "Default Assets" ? t('assets.defaultGroup') : group.name}
                            </button>

                            {expandedGroups[group.name] && (
                                <div className="ml-2 mt-1 space-y-0.5 border-l border-border pl-2">
                                    {(group.servers ?? []).map(srv => (
                                        <button
                                            key={srv.id}
                                            onClick={() => openTab(srv.id, srv.name, 'terminal')}
                                            className="flex items-center w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-all group"
                                        >
                                            <Terminal className="w-4 h-4 mr-2 text-muted-foreground group-hover:text-foreground transition-colors" />
                                            <span className="truncate">{srv.name}</span>
                                        </button>
                                    ))}

                                    {(group.databases ?? []).map(db => (
                                        <button
                                            key={db.id}
                                            onClick={() => openTab(db.id, db.name, db.type === 'redis' ? 'redis' : db.type === 'mongo' ? 'mongo' : 'editor')}
                                            className="flex items-center w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-all group"
                                        >
                                            {db.type === 'redis' ? (
                                                <Layers className="w-4 h-4 mr-2 text-red-500/70 group-hover:text-red-500 transition-colors" />
                                            ) : db.type === 'mongo' ? (
                                                <Leaf className="w-4 h-4 mr-2 text-green-500/70 group-hover:text-green-500 transition-colors" />
                                            ) : db.type === 'dm' ? (
                                                <Database className="w-4 h-4 mr-2 text-orange-500/70 group-hover:text-orange-500 transition-colors" />
                                            ) : (
                                                <Database className="w-4 h-4 mr-2 text-blue-500/70 group-hover:text-blue-500 transition-colors" />
                                            )}
                                            <span className="truncate">{db.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* User Profile & Footer */}
            <div className="p-3 border-t border-border bg-card/30">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0">
                            <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">{username}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{t('assets.administrator')}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <ThemeToggle />
                        <button
                            onClick={handleLogout}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            title={t('assets.logout')}
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
