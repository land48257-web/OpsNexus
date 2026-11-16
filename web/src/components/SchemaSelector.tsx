import { useTranslation } from '../i18n';
import { useState, useRef, useEffect } from 'react';
import { Database, ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface SchemaSelectorProps {
    value: string;
    onChange: (value: string) => void;
    schemas?: string[];
    disabled?: boolean;
    className?: string;
}

export function SchemaSelector({ value, onChange, schemas, disabled, className }: SchemaSelectorProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (schema: string) => {
        onChange(schema);
        setIsOpen(false);
    };

    const displayValue = value === 'default' ? t('database.defaultSchema') : value;

    // Combine default options with fetched schemas, removing duplicates
    const safeSchemas = Array.isArray(schemas) ? schemas : [];
    const allOptions = ['default', ...safeSchemas];
    const uniqueOptions = Array.from(new Set(allOptions));

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "flex items-center bg-background border border-border rounded px-2 py-1 h-7 w-full transition-colors",
                    disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50 cursor-pointer",
                    isOpen && "border-primary/50 ring-1 ring-primary/20"
                )}
            >
                <Database className="w-3.5 h-3.5 text-muted-foreground mr-2 flex-shrink-0" />
                <span className="text-xs text-foreground truncate flex-1 text-left">
                    {displayValue}
                </span>
                <ChevronDown className={cn(
                    "w-3 h-3 text-muted-foreground ml-1 transition-transform duration-200",
                    isOpen && "rotate-180"
                )} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] max-h-[300px] overflow-y-auto bg-popover border border-border rounded-md shadow-xl z-50 py-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    {uniqueOptions.map((schema) => {
                        const isSelected = schema === value;
                        const label = schema === 'default' ? t('database.defaultSchema') : schema;

                        return (
                            <button
                                key={schema}
                                onClick={() => handleSelect(schema)}
                                className={cn(
                                    "w-full px-3 py-1.5 text-xs text-left flex items-center hover:bg-accent transition-colors",
                                    isSelected ? "text-primary bg-accent/50" : "text-foreground"
                                )}
                            >
                                <span className="flex-1 truncate">{label}</span>
                                {isSelected && <Check className="w-3 h-3 ml-2 flex-shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
