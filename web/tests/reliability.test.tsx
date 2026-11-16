import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '../src/stores/authStore';
import { useAuthenticatedFetch } from '../src/hooks/useAuthenticatedFetch';
import { SQLEditor } from '../src/components/SQLEditor';
import { AggregationPipelineBuilder } from '../src/components/AggregationPipelineBuilder';
import { CollectionViewer } from '../src/components/CollectionViewer';
import { AssetExplorer } from '../src/components/AssetExplorer';
import { SQLConsole } from '../src/components/SQLConsole';
import { useIdle } from '../src/hooks/useIdle';
import { useLocaleStore } from '../src/i18n';

const editor = vi.hoisted(() => ({ command: undefined as (() => void) | undefined }));
vi.mock('../src/hooks/useSqlAutocomplete', () => ({ useSqlAutocomplete: () => {} }));
vi.mock('monaco-editor', () => ({}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@monaco-editor/react', () => ({
    default: function Editor({ onMount, value }: { onMount?: (...args: any[]) => void; value?: string }) {
        useEffect(() => {
            onMount?.({ addCommand: (_: unknown, command: () => void) => { editor.command = command; } }, { KeyMod: { CtrlCmd: 1 }, KeyCode: { Enter: 2 } });
        }, []);
        return <pre>{value}</pre>;
    },
}));

const originalLogout = useAuthStore.getState().logout;
beforeEach(() => {
    useLocaleStore.setState({ locale: 'zh-CN' });
    useAuthStore.setState({ logout: originalLogout, token: 'test-token', isAuthenticated: true, username: 'admin' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('regressions', () => {
    it('preserves Headers instances when adding authorization', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetch);
        const { result } = renderHook(() => useAuthenticatedFetch());
        await result.current('/api/v1/assets', { headers: new Headers({ 'X-Test': 'kept' }) });
        const headers = fetch.mock.calls[0][1].headers as Headers;
        expect(headers.get('X-Test')).toBe('kept');
        expect(headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('executes the latest SQL shortcut callback after edits', () => {
        const first = vi.fn(); const latest = vi.fn();
        const view = render(<SQLEditor value="" onChange={() => {}} onExecute={first} />);
        view.rerender(<SQLEditor value="SELECT 1" onChange={() => {}} onExecute={latest} />);
        act(() => editor.command?.());
        expect(first).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledOnce();
    });

    it('authenticates aggregation requests', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [{ value: 1 }] })));
        vi.stubGlobal('fetch', fetch);
        const onExecute = vi.fn();
        render(<AggregationPipelineBuilder assetId="mongo" database="test" collection="items" onExecute={onExecute} />);
        fireEvent.click(screen.getByText('$match - 筛选文档'));
        fireEvent.click(screen.getByText('执行完整管道'));
        await waitFor(() => expect(onExecute).toHaveBeenCalledWith([{ value: 1 }]));
        expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('rejects invalid query JSON without sending an unfiltered query', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ documents: [], total: 0 })));
        vi.stubGlobal('fetch', fetch);
        render(<CollectionViewer assetId="mongo" database="test" collection="items" />);
        await waitFor(() => expect(screen.getByText('执行').closest('button')?.disabled).toBe(false));
        const count = fetch.mock.calls.length;
        fireEvent.change(screen.getByPlaceholderText('{"status": "active"}'), { target: { value: '{invalid' } });
        fireEvent.click(screen.getByText('执行'));
        await screen.findByRole('alert');
        expect(fetch.mock.calls.length).toBe(count);
    });

    it('starts idle tracking immediately after login without user activity', () => {
        vi.useFakeTimers();
        vi.stubGlobal('alert', vi.fn());
        const logout = vi.fn();
        useAuthStore.setState({ isAuthenticated: false, logout });
        renderHook(() => useIdle(1));
        act(() => useAuthStore.setState({ isAuthenticated: true }));
        act(() => vi.advanceTimersByTime(60001));
        expect(logout).toHaveBeenCalledOnce();
    });
});

it('waits for a transaction outcome and sends the selected stop-on-error policy', async () => {
    const stream = 'data:{"sequence":1,"status":"success","statement":"UPDATE items SET a=1","rows_affected":1}\n\n' +
        'data:{"kind":"transaction","status":"success","statement":"COMMIT"}\n\n';
    const fetch = vi.fn().mockResolvedValue(new Response(stream));
    vi.stubGlobal('fetch', fetch);
    render(<SQLConsole assetId="sql" currentDatabase="test" dbType="mysql" initialScript="UPDATE items SET a=1" />);
    fireEvent.click(screen.getByText('执行'));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(JSON.parse(fetch.mock.calls[0][1].body).stop_on_error).toBe(true);
});

it('reports unknown transaction state when a stream ends after statement results', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('data:{"sequence":1,"status":"success","statement":"UPDATE items SET a=1","rows_affected":1}\n\n'));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SQLConsole assetId="sql" currentDatabase="test" dbType="mysql" initialScript="UPDATE items SET a=1" />);
    fireEvent.click(screen.getByText('执行'));
    await waitFor(() => expect(screen.getByText(/事务结果未知/)).toBeTruthy());
});

it('renders groups with omitted asset lists and an empty asset configuration', () => {
    const props = { expandedGroups: { test: true }, toggleGroup: vi.fn(), openTab: vi.fn(), handleLogout: vi.fn() };
    const view = render(<AssetExplorer {...props} config={{ groups: [{ name: 'test', servers: null, databases: null }] } as any} />);
    expect(screen.getByText('test')).toBeTruthy();
    view.rerender(<AssetExplorer {...props} config={{ groups: null } as any} />);
    expect(screen.getByText('资源列表')).toBeTruthy();
});
