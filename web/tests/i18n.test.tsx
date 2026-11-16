import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { detectLocale, LANGUAGE_STORAGE_KEY, resolveLocale, t, useLocaleStore } from '../src/i18n';
import { en } from '../src/i18n/en';
import { zhCN, type Message } from '../src/i18n/zh-CN';
import { translateError } from '../src/i18n/errors';
import { useAuthStore } from '../src/stores/authStore';
import { LanguageProvider } from '../src/components/LanguageProvider';
import { LanguageSwitcher } from '../src/components/LanguageSwitcher';
import Login from '../src/pages/Login';
import { SQLManager } from '../src/components/SQLManager';
import { MongoManager } from '../src/components/MongoManager';
import { RedisManager } from '../src/components/RedisManager';
import { FileTree } from '../src/components/FileTree';
import { DocumentTable } from '../src/components/DocumentTable';
import { SSHRemoteTerminal } from '../src/components/Terminal';

const editorStats = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
const terminalStats = vi.hoisted(() => ({ mounts: 0, write: vi.fn(), dispose: vi.fn() }));
vi.mock('../src/hooks/useSqlAutocomplete', () => ({ useSqlAutocomplete: () => {} }));
vi.mock('monaco-editor', () => ({}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));
vi.mock('../src/components/DarkBackground', () => ({ DarkBackground: () => null }));
vi.mock('../src/components/LightBackground', () => ({ LightBackground: () => null }));
vi.mock('@monaco-editor/react', () => ({
    default: function Editor({ value, onChange, language, defaultLanguage }: {
        value?: string; onChange?: (value: string) => void; language?: string; defaultLanguage?: string;
    }) {
        useEffect(() => {
            editorStats.mounts++;
            return () => { editorStats.unmounts++; };
        }, []);
        return <textarea aria-label={`${language || defaultLanguage} editor`} value={value} onChange={event => onChange?.(event.target.value)} />;
    },
}));
vi.mock('xterm', () => ({
    Terminal: class {
        constructor() { terminalStats.mounts++; }
        options = {};
        cols = 80;
        rows = 24;
        loadAddon() {}
        open() {}
        onData() {}
        write = terminalStats.write;
        dispose = terminalStats.dispose;
    },
}));
vi.mock('xterm-addon-fit', () => ({ FitAddon: class { fit() {} } }));

beforeEach(() => {
    localStorage.clear();
    useLocaleStore.setState({ locale: 'zh-CN' });
    useAuthStore.setState({ token: 'test-token', isAuthenticated: true, username: 'admin' });
    editorStats.mounts = 0;
    editorStats.unmounts = 0;
    terminalStats.mounts = 0;
    terminalStats.write.mockClear();
    terminalStats.dispose.mockClear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const switchToEnglish = () => act(() => useLocaleStore.getState().setLocale('en'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('language preferences and catalogs', () => {
    it.each([
        ['en', ['zh-CN'], 'en'],
        ['zh-CN', ['en-US'], 'zh-CN'],
        [null, ['zh-TW', 'en'], 'zh-CN'],
        [null, ['en-GB', 'zh-CN'], 'en'],
        ['invalid', ['fr-FR', 'en-US'], 'en'],
        [null, ['fr-FR'], 'zh-CN'],
        [null, [], 'zh-CN'],
    ] as const)('resolves saved %s and browser preferences %j to %s', (saved, languages, expected) => {
        expect(resolveLocale(saved, languages)).toBe(expected);
    });

    it('persists the selection across sign-out and a new initialization', () => {
        switchToEnglish();
        act(() => useAuthStore.getState().logout());
        expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
        expect(detectLocale()).toBe('en');
    });

    it('works with blocked browser storage', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-HK']);
        expect(detectLocale()).toBe('zh-CN');
        switchToEnglish();
        expect(t('login.submit')).toBe('Sign in');
    });

    it('provides matching keys and interpolation variables in every translation', () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort());
        const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
        for (const key of Object.keys(zhCN) as (keyof typeof zhCN)[]) {
            const message: Message = en[key];
            for (const variant of typeof message === 'string' ? [message] : [message.one, message.other]) {
                expect(variant.trim().length, key).toBeGreaterThan(0);
                expect(placeholders(variant), key).toEqual(placeholders(zhCN[key]));
            }
        }
        switchToEnglish();
        expect(t('common.rows', { count: 0 })).toBe('0 rows');
        expect(t('common.rows', { count: 1 })).toBe('1 row');
        expect(t('sql.statements', { count: 2 })).toBe('2 statements');
        expect(t('sql.console')).toBe('SQL Console');
        expect(t('redis.confirmDelete', { key: '<script>{{count}}:用户</script>' }))
            .toBe('Delete the key “<script>{{count}}:用户</script>”?');
    });

    it('localizes application errors while preserving driver diagnostics', () => {
        expect(translateError('{"error":"Invalid captcha"}')).toBe('验证码错误或已过期');
        expect(translateError('Failed to connect to database: Access denied for user root'))
            .toBe('无法连接到数据库: Access denied for user root');
        const diagnostic = "ERROR 1064 (42000): SELECT '中文'";
        expect(translateError(diagnostic)).toBe(diagnostic);
        const previousError = t('error.unknownTransaction');
        switchToEnglish();
        expect(translateError(previousError)).toContain('transaction outcome is unknown');
        expect(translateError('Invalid credentials')).toBe('Incorrect username or password');
    });
});

describe('live language switching', () => {
    it('updates the login form, an existing error, and document language without clearing input', async () => {
        const fetch = vi.fn((url: string) => Promise.resolve(url.endsWith('/login')
            ? json({ error: 'Invalid credentials' }, 401)
            : json({ captcha_id: 'test', image: 'data:image/png;base64,AA==' })));
        vi.stubGlobal('fetch', fetch);
        render(<LanguageProvider><MemoryRouter><Login /></MemoryRouter></LanguageProvider>);
        await screen.findByAltText('验证码');
        fireEvent.change(screen.getByLabelText('用户名'), { target: { value: '运维-admin' } });
        fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password' } });
        fireEvent.click(screen.getByRole('button', { name: '登录' }));
        await screen.findByText('用户名或密码错误');
        const requestCount = fetch.mock.calls.length;

        fireEvent.change(screen.getByRole('combobox', { name: '语言' }), { target: { value: 'en' } });
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
        expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('运维-admin');
        expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('test-password');
        expect(screen.getByText('Incorrect username or password')).toBeTruthy();
        expect(document.documentElement.lang).toBe('en');
        expect(fetch.mock.calls.length).toBe(requestCount);
    });

    it('syncs a preference changed in another browser tab', () => {
        render(<LanguageProvider><LanguageSwitcher compact /></LanguageProvider>);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
        act(() => window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY, newValue: 'en' })));
        expect(document.documentElement.lang).toBe('en');
        fireEvent.click(screen.getByRole('button', { name: '切换到简体中文' }));
        expect(document.documentElement.lang).toBe('zh-CN');
    });

    it('keeps SQL and MongoDB editors mounted and an active SQL stream running', async () => {
        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } });
        const fetch = vi.fn((url: string, _options?: RequestInit) => {
            if (url.endsWith('/executor/batch')) return Promise.resolve(new Response(stream));
            if (url === '/api/v1/assets') return Promise.resolve(json({ groups: [] }));
            if (url.endsWith('/sql/databases')) return Promise.resolve(json(['生产库']));
            if (url.includes('/tables?')) return Promise.resolve(json({ tables: [{ name: '订单' }] }));
            if (url.includes('/mongo/databases')) return Promise.resolve(json({ databases: ['生产库'] }));
            if (url.includes('/mongo/collections')) return Promise.resolve(json({ collections: ['客户'] }));
            return Promise.resolve(json({ available: false }));
        });
        vi.stubGlobal('fetch', fetch);
        render(<><SQLManager assetId="sql" /><MongoManager assetId="mongo" /></>);
        await screen.findByText('订单');
        await screen.findByText('客户');
        const sql = "SELECT '中文' AS message;";
        const mql = 'db.客户.find({name: "张三"})';
        fireEvent.change(screen.getByLabelText('sql editor'), { target: { value: sql } });
        fireEvent.change(screen.getByLabelText('javascript editor'), { target: { value: mql } });
        fireEvent.click(screen.getByTitle('执行 (Ctrl+Enter)'));
        const count = fetch.mock.calls.length;
        const mounts = editorStats.mounts;
        switchToEnglish();
        expect(screen.getByText('SQL Console')).toBeTruthy();
        expect(screen.getByText('Script Console')).toBeTruthy();
        expect((screen.getByLabelText('sql editor') as HTMLTextAreaElement).value).toBe(sql);
        expect((screen.getByLabelText('javascript editor') as HTMLTextAreaElement).value).toBe(mql);
        expect(screen.getByText('订单')).toBeTruthy();
        expect(screen.getByText('客户')).toBeTruthy();
        expect(editorStats.mounts).toBe(mounts);
        expect(editorStats.unmounts).toBe(0);
        expect(fetch.mock.calls.length).toBe(count);
        const request = fetch.mock.calls.find(([url]) => url.endsWith('/executor/batch'))!;
        expect(request[1]?.signal?.aborted).toBe(false);
        expect(JSON.parse(request[1]?.body as string).script).toBe(sql);
        await act(async () => {
            streamController!.enqueue(new TextEncoder().encode('data:{"kind":"transaction","status":"success"}\n\n'));
            streamController!.close();
        });
        expect(screen.getByRole('status').textContent).toContain('Transaction finished');
    });

    it('updates Redis help and file dialogs without clearing the entered filename', async () => {
        const fetch = vi.fn(() => Promise.resolve(json({ keys: ['用户:1'], cursor: 0 })));
        vi.stubGlobal('fetch', fetch);
        render(<><RedisManager assetId="redis" /><FileTree assetId="ssh" enabled={false} /></>);
        await screen.findByText('用户');
        fireEvent.click(screen.getByTitle('新建文件'));
        fireEvent.change(screen.getByPlaceholderText('请输入名称'), { target: { value: '配置.json' } });
        switchToEnglish();
        expect(screen.getByText('Redis Workspace')).toBeTruthy();
        expect(screen.getByText('New file')).toBeTruthy();
        expect((screen.getByPlaceholderText('Enter a name') as HTMLInputElement).value).toBe('配置.json');
        expect(screen.getByText('用户')).toBeTruthy();
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('formats document dates and counts in the selected language without translating data', () => {
        const timestamp = '1700000000000';
        const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        render(<DocumentTable documents={[{ 名称: '原始数据', date: { $date: { $numberLong: timestamp } }, list: ['a'], object: { value: 1 } }]} />);
        expect(screen.getByText(new Date(Number(timestamp)).toLocaleString('zh-CN', options))).toBeTruthy();
        switchToEnglish();
        expect(screen.getByText(new Date(Number(timestamp)).toLocaleString('en', options))).toBeTruthy();
        expect(screen.getByText('[ 1 item ]')).toBeTruthy();
        expect(screen.getByText('{ 1 field }')).toBeTruthy();
        expect(screen.getByText('名称')).toBeTruthy();
        expect(screen.getByText('原始数据')).toBeTruthy();
    });

    it('keeps the SSH connection open and uses the latest language in socket callbacks', async () => {
        const sockets: FakeWebSocket[] = [];
        class FakeWebSocket {
            static OPEN = 1;
            readyState = 1;
            onopen?: () => void;
            onerror?: (error: unknown) => void;
            onclose?: () => void;
            onmessage?: (event: { data: unknown }) => void;
            send = vi.fn();
            close = vi.fn();
            constructor() { sockets.push(this); }
        }
        vi.stubGlobal('WebSocket', FakeWebSocket);
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<><LanguageSwitcher compact /><SSHRemoteTerminal wsUrl="ws://localhost/test" onFileUpload={vi.fn()} /></>);
        await waitFor(() => expect(sockets.length).toBe(1));
        sockets[0].onopen?.();
        expect(terminalStats.write).toHaveBeenLastCalledWith(expect.stringContaining('已连接'));
        fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
        sockets[0].onerror?.(new Error('test'));
        expect(terminalStats.write).toHaveBeenLastCalledWith(expect.stringContaining('[System] Connection failed'));
        sockets[0].onmessage?.({ data: '服务器原始输出' });
        expect(terminalStats.write).toHaveBeenLastCalledWith('服务器原始输出');
        expect(sockets).toHaveLength(1);
        expect(sockets[0].close).not.toHaveBeenCalled();
        expect(terminalStats.dispose).not.toHaveBeenCalled();
        expect(terminalStats.mounts).toBe(1);
    });
});
