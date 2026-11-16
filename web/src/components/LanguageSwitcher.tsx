import { Languages } from 'lucide-react';
import { useTranslation } from '../i18n';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
    const { locale, setLocale, t } = useTranslation();

    if (compact) {
        return (
            <button
                type="button"
                onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
                title={t('common.switchLanguage')}
                aria-label={t('common.switchLanguage')}
                className="w-10 h-10 flex flex-col items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
                <Languages className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] leading-3 mt-0.5">{locale === 'zh-CN' ? '中' : 'EN'}</span>
            </button>
        );
    }

    return (
        <label className="flex items-center gap-2 h-10 rounded-full border border-border bg-background/50 px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
            <Languages className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t('common.language')}</span>
            <select
                value={locale}
                onChange={event => setLocale(event.target.value === 'en' ? 'en' : 'zh-CN')}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
            >
                <option value="zh-CN" lang="zh-CN" className="bg-background">简体中文</option>
                <option value="en" lang="en" className="bg-background">English</option>
            </select>
        </label>
    );
}
