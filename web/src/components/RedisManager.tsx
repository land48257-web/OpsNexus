import { useTranslation } from '../i18n';
import { useState } from 'react';
import { ResizableSplit } from './ResizableSplit';
import { RedisKeyTree } from './RedisKeyTree';
import { ValueEditorFactory } from './ValueEditorFactory';
import { RedisConsole } from './RedisConsole';
import { Terminal } from 'lucide-react';


interface RedisManagerProps {
    assetId: string;
}

export function RedisManager({ assetId }: RedisManagerProps) {
    const { t } = useTranslation();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [showConsole, setShowConsole] = useState(false);
    const [currentDb, setCurrentDb] = useState<number>(0);

    return (
        <div className="flex flex-col h-full w-full bg-background">
            <div className="flex-1 overflow-hidden relative">
                <ResizableSplit
                    direction="horizontal"
                    initialSize={256}
                    usePixels={true}
                    left={
                        <RedisKeyTree
                            key={`${assetId}:${currentDb}`}
                            assetId={assetId}
                            db={currentDb}
                            onDbChange={(db) => { setSelectedKey(null); setCurrentDb(db); }}
                            onSelectKey={setSelectedKey}
                        />
                    }
                    right={
                        selectedKey ? (
                            <ValueEditorFactory
                                key={`${assetId}:${currentDb}:${selectedKey}`}
                                assetId={assetId}
                                db={currentDb}
                                redisKey={selectedKey}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center mb-6 border border-red-500/20">
                                    <Terminal className="w-10 h-10 text-red-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-4">{t('redis.title')}</h3>
                                <div className="max-w-md space-y-3 text-sm text-muted-foreground">
                                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded border border-border">
                                        <span className="text-primary font-bold">1.</span>
                                        <p><span className="text-foreground font-medium">{t('redis.selectDatabase')}</span>{t('redis.selectDatabaseHelp')}</p>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded border border-border">
                                        <span className="text-primary font-bold">2.</span>
                                        <p><span className="text-foreground font-medium">{t('redis.browseKeys')}</span>{t('redis.browseKeysHelp')}<code className="text-xs bg-muted px-1.5 py-0.5 rounded text-primary">user:*</code></p>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded border border-border">
                                        <span className="text-primary font-bold">3.</span>
                                        <p><span className="text-foreground font-medium">{t('redis.edit')}</span>{t('redis.editHelp')}</p>
                                    </div>
                                </div>
                            </div>
                        )
                    }
                />
            </div>

            {/* Console Toggle / Status Bar */}
            <div className="h-8 border-t border-border bg-background flex items-center px-2 justify-between">
                <div className="text-xs text-muted-foreground">
                    {selectedKey ? t('redis.selected', { key: selectedKey }) : t('redis.ready', { db: currentDb })}
                </div>
                <button
                    onClick={() => setShowConsole(!showConsole)}
                    className="flex items-center gap-2 px-2 py-0.5 hover:bg-accent rounded text-xs text-muted-foreground transition-colors"
                >
                    <Terminal className="w-3 h-3" />
                    <span>{t('redis.console')}</span>
                </button>
            </div>

            {/* Console Panel */}
            {showConsole && (
                <div className="h-64 border-t border-border bg-black relative">
                    <RedisConsole
                        assetId={assetId}
                        db={currentDb}
                        onDbChange={(db) => { setSelectedKey(null); setCurrentDb(db); }}
                    />
                </div>
            )}
        </div>
    );
}
