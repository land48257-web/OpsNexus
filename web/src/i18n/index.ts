import { create } from 'zustand';
import { en } from './en';
import { zhCN, type Message, type MessageKey } from './zh-CN';

export type Locale = 'zh-CN' | 'en';
export const LANGUAGE_STORAGE_KEY = 'opsnexus-language';

export function resolveLocale(saved: string | null, languages: readonly string[]): Locale {
    if (saved === 'zh-CN' || saved === 'en') return saved;
    for (const language of languages) {
        const base = language.toLowerCase().split(/[-_]/)[0];
        if (base === 'zh') return 'zh-CN';
        if (base === 'en') return 'en';
    }
    return 'zh-CN';
}

export function detectLocale(): Locale {
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
        // Browser privacy settings may disable storage. Switching still works.
    }
    return resolveLocale(saved, typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
}

interface LocaleState {
    locale: Locale;
    setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
    locale: detectLocale(),
    setLocale: (locale) => {
        if (locale !== 'zh-CN' && locale !== 'en') return;
        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
        } catch {
            // Keep the in-memory preference even when persistence is unavailable.
        }
        set({ locale });
    },
}));

type Placeholders<Text extends string> = Text extends `${string}{{${infer Name}}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;
type Values<Key extends MessageKey> = Record<Placeholders<(typeof zhCN)[Key]>, string | number>;
type Args<Key extends MessageKey> = [Placeholders<(typeof zhCN)[Key]>] extends [never]
    ? [values?: Record<string, never>]
    : [values: Values<Key>];
export type StaticMessageKey = { [Key in MessageKey]: Placeholders<(typeof zhCN)[Key]> extends never ? Key : never }[MessageKey];

// Stable function identity is intentional: changing language must not restart
// fetch effects, reset an editor, or reconnect an active SSH/Redis terminal.
// Long-lived event handlers read the current preference when they run.
export function t<Key extends MessageKey>(key: Key, ...args: Args<Key>): string {
    const { locale } = useLocaleStore.getState();
    const values = (args[0] ?? {}) as Record<string, string | number>;
    const message: Message = locale === 'en' ? en[key] : zhCN[key];
    const template = typeof message === 'string' ? message : values.count === 1 ? message.one : message.other;
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => {
        const value = values[name];
        if (value === undefined) return placeholder;
        return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value;
    });
}

export function useTranslation() {
    const locale = useLocaleStore(state => state.locale);
    const setLocale = useLocaleStore(state => state.setLocale);
    return { locale, setLocale, t };
}
