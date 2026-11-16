import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
    token: string | null;
    username: string | null;
    isAuthenticated: boolean;
    sessionTimeoutMinutes: number;
    login: (token: string, username: string, sessionTimeoutMinutes?: number) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            username: null,
            isAuthenticated: false,
            sessionTimeoutMinutes: 30,
            login: (token, username, sessionTimeoutMinutes = 30) => set({ token, username, sessionTimeoutMinutes, isAuthenticated: true }),
            logout: () => set({ token: null, username: null, isAuthenticated: false }),
        }),
        {
            name: 'auth-storage',
        }
    )
);
