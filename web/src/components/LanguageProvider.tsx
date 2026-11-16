import { useEffect, type ReactNode } from 'react';
import { detectLocale, LANGUAGE_STORAGE_KEY, useLocaleStore, useTranslation } from '../i18n';

export function LanguageProvider({ children }: { children: ReactNode }) {
    const { locale } = useTranslation();

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    useEffect(() => {
        const syncPreference = (event: StorageEvent) => {
            if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
                useLocaleStore.setState({ locale: detectLocale() });
            }
        };
        window.addEventListener('storage', syncPreference);
        return () => window.removeEventListener('storage', syncPreference);
    }, []);

    return children;
}
