import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { toLoginPath, withBasePath } from '../lib/basePath';

export function useAuthenticatedFetch() {
    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);

    const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);

        const response = await fetch(withBasePath(url), { ...options, headers });

        if (response.status === 401) {
            logout();
            window.location.href = toLoginPath();
            throw new Error('Unauthorized');
        }

        return response;
    }, [token, logout]);

    return authenticatedFetch;
}
