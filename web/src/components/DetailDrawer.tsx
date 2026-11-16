import { useTranslation } from '../i18n';
import { X, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

interface DetailDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    data: any;
    columns?: string[];
}

export function DetailDrawer({ isOpen, onClose, data, columns }: DetailDrawerProps) {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    const displayColumns = columns || (data ? Object.keys(data) : []);

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleCopyJSON = () => {
        if (data) {
            navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setCopiedField('__json__');
            setTimeout(() => setCopiedField(null), 2000);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
            <div className="absolute inset-0 overflow-hidden">
                {/* Background overlay */}
                <div
                    className={cn(
                        "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 ease-in-out",
                        isOpen ? "opacity-100" : "opacity-0"
                    )}
                    onClick={onClose}
                />

                <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                    <div
                        className={cn(
                            "pointer-events-auto w-screen max-w-md transform transition duration-300 ease-in-out",
                            isOpen ? "translate-x-0" : "translate-x-full"
                        )}
                    >
                        <div className="flex h-full flex-col overflow-y-scroll bg-background shadow-xl border-l border-border">
                            {/* Header */}
                            <div className="px-4 py-6 sm:px-6 border-b border-border bg-muted/30">
                                <div className="flex items-start justify-between">
                                    <h2 className="text-base font-semibold leading-6 text-foreground" id="slide-over-title">
                                        {t('record.title')}
                                    </h2>
                                    <div className="ml-3 flex h-7 items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-md bg-background text-muted-foreground hover:text-foreground focus:outline-none ring-1 ring-border px-2 py-1 text-xs flex items-center gap-1 transition-colors"
                                            onClick={handleCopyJSON}
                                        >
                                            {copiedField === '__json__' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                            {t('record.copyJson')}
                                        </button>
                                        <button
                                            type="button"
                                            className="relative rounded-md text-muted-foreground hover:text-foreground focus:outline-none"
                                            onClick={onClose}
                                        >
                                            <span className="absolute -inset-2.5"></span>
                                            <span className="sr-only">{t('common.close')}</span>
                                            <X className="h-6 w-6" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="relative mt-6 flex-1 px-4 sm:px-6 pb-6">
                                <div className="space-y-4">
                                    {data && displayColumns.map((col) => {
                                        const value = data[col];
                                        const strValue = value === null ? 'NULL' : String(value);

                                        return (
                                            <div key={col} className="group relative">
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-xs font-medium text-muted-foreground font-mono">
                                                        {col}
                                                    </label>
                                                    <button
                                                        onClick={() => handleCopy(strValue, col)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                                                        title={t('record.copyValue')}
                                                    >
                                                        {copiedField === col ? (
                                                            <Check className="w-3 h-3 text-green-500" />
                                                        ) : (
                                                            <Copy className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </div>
                                                <div className={cn(
                                                    "text-sm text-foreground bg-muted/30 rounded p-2 font-mono break-all whitespace-pre-wrap border border-transparent group-hover:border-border transition-colors",
                                                    value === null && "text-muted-foreground/50 italic"
                                                )}>
                                                    {strValue}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
