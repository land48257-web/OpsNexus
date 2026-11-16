import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { RequireAuth } from './components/RequireAuth';
import { useAuthStore } from './stores/authStore';
import { useIdle } from './hooks/useIdle';
import { ThemeProvider } from './components/ThemeProvider';
import { LanguageProvider } from './components/LanguageProvider';

function App() {
    const sessionTimeoutMinutes = useAuthStore(state => state.sessionTimeoutMinutes);
    useIdle(sessionTimeoutMinutes);

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            storageKey="opsnexus-theme"
            enableSystem={false}
            disableTransitionOnChange
        >
            <LanguageProvider>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/"
                        element={
                            <RequireAuth>
                                <Dashboard />
                            </RequireAuth>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </LanguageProvider>
        </ThemeProvider>
    );
}

export default App;
