import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Clock, Save, Trash2, RefreshCw, Search, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

interface ValueEditorFactoryProps {
    assetId: string;
    db: number;
    redisKey: string;
}

interface KeyDetail {
    key: string;
    type: string;
    ttl: number;
    value: any;
}

export function ValueEditorFactory({ assetId, db, redisKey }: ValueEditorFactoryProps) {
    const { t } = useTranslation();
    const [detail, setDetail] = useState<KeyDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editValue, setEditValue] = useState<any>(null);
    const [ttl, setTtl] = useState<number>(-1);
    const authenticatedFetch = useAuthenticatedFetch();
    const { theme } = useTheme();

    const fetchDetail = async () => {
        setLoading(true);
        try {
            const res = await authenticatedFetch(`/api/v1/redis/key?asset_id=${encodeURIComponent(assetId)}&key=${encodeURIComponent(redisKey)}&db=${db}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('error.load'));
            setDetail(data);
            setTtl(data.ttl);

            setEditValue(data.value);

        } catch (err) {
            console.error("Failed to load key detail", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (redisKey) {
            fetchDetail();
        }
    }, [assetId, db, redisKey]);

    const handleSave = async () => {
        if (!detail) return;
        setSaving(true);
        try {
            // Prepare value based on type
            const valueToSend = editValue;
            if (detail.type === 'string') {
                // If it was formatted JSON, minify it back? Or keep as is?
                // Usually Redis stores raw string. If user edited it, send as is.
                // But if we formatted it for display, we should probably respect that.
                // For now, send exactly what's in the editor.
            }

            const response = await authenticatedFetch('/api/v1/redis/key', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    key: detail.key,
                    type: detail.type,
                    value: valueToSend,
                    ttl: ttl,
                    db: db
                })
            });
            if (!response.ok) throw new Error((await response.json()).error || t('error.save'));
            await fetchDetail();
        } catch (err) {
            alert(translateError(err instanceof Error ? err : t('error.save')));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(t('redis.confirmDelete', { key: redisKey }))) return;
        try {
            const response = await authenticatedFetch('/api/v1/redis/key', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_id: assetId,
                    keys: [redisKey],
                    db: db
                })
            });
            if (!response.ok) throw new Error((await response.json()).error || t('error.delete'));
            // Notify parent? For now just clear view
            setDetail(null);
        } catch (err) {
            alert(translateError(err instanceof Error ? err : t('error.delete')));
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-full text-muted-foreground">{t('common.loading')}</div>;
    }

    if (!detail) {
        return <div className="flex items-center justify-center h-full text-muted-foreground">{t('redis.selectKey')}</div>;
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="h-14 border-b border-border flex items-center px-4 justify-between bg-muted/50">
                <div className="flex items-center gap-4 overflow-hidden">
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                                detail.type === 'string' && "bg-blue-500/20 text-blue-400",
                                detail.type === 'hash' && "bg-purple-500/20 text-purple-400",
                                detail.type === 'list' && "bg-green-500/20 text-green-400",
                                detail.type === 'set' && "bg-orange-500/20 text-orange-400",
                                detail.type === 'zset' && "bg-pink-500/20 text-pink-400",
                            )}>
                                {detail.type}
                            </span>
                            <span className="font-mono text-sm text-foreground truncate" title={detail.key}>
                                {detail.key}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <Clock className="w-3 h-3" />
                            <span>TTL:</span>
                            <input
                                className="bg-transparent border-b border-border w-16 text-foreground focus:outline-none focus:border-primary text-center"
                                value={ttl}
                                onChange={(e) => setTtl(Number(e.target.value))}
                            />
                            <span>s</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchDetail}
                        className="h-8 w-8"
                        title={t('common.refresh')}
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDelete}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title={t('redis.deleteKey')}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button
                        onClick={handleSave}
                        disabled={saving || (detail.type !== 'string' && detail.type !== 'hash')}
                        size="icon"
                        className="h-8 w-8 bg-indigo-600 hover:bg-indigo-500 text-white"
                        title={saving ? t('redis.saving') : t('redis.save')}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-hidden relative">
                {detail.type === 'string' && (
                    <Editor
                        loading={t('common.loading')}
                        height="100%"
                        defaultLanguage="json"
                        value={typeof editValue === 'string' ? editValue : JSON.stringify(editValue, null, 2)}
                        onChange={(val) => setEditValue(val)}
                        theme={theme === 'light' ? 'light' : 'vs-dark'}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        }}
                    />
                )}

                {detail.type === 'hash' && (
                    <div className="h-full flex flex-col">
                        <div className="p-2 border-b border-border bg-muted/30 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                                <input
                                    className="w-full bg-background border border-border rounded pl-8 pr-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                                    placeholder={t('redis.filterFields')}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-muted sticky top-0">
                                    <tr>
                                        <th className="p-2 border-b border-border text-muted-foreground font-medium w-1/3">{t('redis.field')}</th>
                                        <th className="p-2 border-b border-border text-muted-foreground font-medium">{t('redis.value')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(editValue || {}).map(([field, val]) => (
                                        <tr key={field} className="border-b border-border/50 hover:bg-accent/30">
                                            <td className="p-2 font-mono text-primary align-top">{field}</td>
                                            <td className="p-0">
                                                <input
                                                    className="w-full bg-transparent p-2 text-foreground focus:bg-accent focus:outline-none"
                                                    value={val as string}
                                                    onChange={(e) => {
                                                        const newVal = { ...editValue, [field]: e.target.value };
                                                        setEditValue(newVal);
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {(detail.type === 'list' || detail.type === 'set' || detail.type === 'zset') && (
                    <div className="h-full overflow-auto p-4">
                        <div className="bg-muted/50 border border-border rounded p-4 text-center text-muted-foreground">
                            <p className="mb-2">{t('redis.readOnly')}</p>
                            <p className="text-xs text-muted-foreground">
                                {t('redis.currentValue', { type: detail.type })}
                            </p>
                            <pre className="mt-4 text-left bg-muted p-4 rounded overflow-auto max-h-96 font-mono text-xs text-foreground">
                                {JSON.stringify(editValue, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
