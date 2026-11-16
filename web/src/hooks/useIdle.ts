import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { toLoginPath } from '../lib/basePath';
import { t } from '../i18n';

export const useIdle = (timeoutMinutes: number) => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const logout = useAuthStore((state) => state.logout);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const resetTimer = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            if (useAuthStore.getState().isAuthenticated) {
                timerRef.current = setTimeout(() => {
                    logout();
                    alert(t('error.idleTimeout'));
                    window.location.href = toLoginPath();
                }, timeoutMinutes * 60 * 1000);
            }
        };

        const events = ['mousemove', 'keydown', 'click', 'scroll'];

        const handleActivity = () => {
            resetTimer();
        };

        events.forEach((event) => {
            window.addEventListener(event, handleActivity);
        });

        resetTimer(); // Initial start

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            events.forEach((event) => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [timeoutMinutes, logout, isAuthenticated]);
};
