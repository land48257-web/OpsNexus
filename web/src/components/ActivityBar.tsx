import { useTranslation } from '../i18n';
import { Server, Search, Activity, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

export type ActivityType = 'explorer' | 'search' | 'monitor' | 'settings';

interface ActivityBarProps {
    activeActivity: ActivityType;
    onActivityChange: (activity: ActivityType) => void;
}

export function ActivityBar({ activeActivity, onActivityChange }: ActivityBarProps) {
    const { t } = useTranslation();
    const items = [
        { id: 'explorer', icon: Server, label: t('assets.navigation') },
        { id: 'search', icon: Search, label: t('common.search') },
        { id: 'monitor', icon: Activity, label: t('assets.monitor') },
    ];

    return (
        <div className="w-[50px] flex flex-col items-center py-4 bg-muted border-r border-border z-20 flex-shrink-0">
            <div className="space-y-4 w-full flex flex-col items-center">
                {items.map((item) => {
                    const isActive = activeActivity === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onActivityChange(item.id as ActivityType)}
                            className={cn(
                                "w-10 h-10 flex items-center justify-center rounded-md transition-all relative group",
                                isActive
                                    ? "text-primary bg-primary/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                            title={item.label}
                        >
                            <item.icon className="w-6 h-6 stroke-[1.5]" />
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="mt-auto w-full flex flex-col items-center space-y-4">
                <LanguageSwitcher compact />
                <button
                    onClick={() => onActivityChange('settings')}
                    className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-md transition-all relative group",
                        activeActivity === 'settings'
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                    title={t('common.settings')}
                >
                    <Settings className="w-6 h-6 stroke-[1.5]" />
                </button>
            </div>
        </div>
    );
}
