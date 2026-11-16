import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { DarkBackground } from '@/components/DarkBackground';
import { LightBackground } from '@/components/LightBackground';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, User } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { withBasePath } from '@/lib/basePath';

export default function Login() {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [captchaId, setCaptchaId] = useState('');
    const [captchaImage, setCaptchaImage] = useState('');
    const [captchaInput, setCaptchaInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { theme } = useTheme();
    const login = useAuthStore((state) => state.login);

    const fetchCaptcha = async () => {
        try {
            const res = await fetch(withBasePath('/api/auth/captcha'));
            if (res.ok) {
                const data = await res.json();
                setCaptchaId(data.captcha_id);
                setCaptchaImage(data.image);
            }
        } catch (err) {
            console.error('Failed to fetch captcha', err);
        }
    };

    // Fetch captcha on mount
    useEffect(() => {
        fetchCaptcha();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(withBasePath('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    captcha_id: captchaId,
                    captcha: captchaInput
                }),
            });

            if (response.ok) {
                const data = await response.json();
                login(data.token, data.username, data.session_timeout_minutes);
                navigate('/');
            } else {
                const data = await response.json();
                setError(data.message || data.error || t('error.login'));
                // Refresh captcha on failure
                fetchCaptcha();
                setCaptchaInput('');
            }
        } catch (err) {
            setError(t('error.network'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex overflow-hidden bg-background">
            {/* Left Side - Visuals */}
            <div className="hidden lg:flex w-1/2 relative items-center justify-center bg-background overflow-hidden">
                {theme === 'light' ? <LightBackground /> : <DarkBackground />}

                <div className="relative z-10 p-12 text-center max-w-lg">
                    <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">
                        {t('workspace.title')}
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        {t('login.introduction')}
                    </p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="flex-1 flex items-center justify-center p-8 relative">
                <div className="absolute top-8 right-8 flex items-center gap-2">
                    <LanguageSwitcher />
                    <ThemeToggle />
                </div>

                <Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-sm">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold tracking-tight">{t('login.title')}</CardTitle>
                        <CardDescription>
                            {t('login.description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="username">{t('login.username')}</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="username"
                                        placeholder={t('login.usernamePlaceholder')}
                                        type="text"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        disabled={loading}
                                        className="pl-9"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">{t('login.password')}</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        placeholder={t('login.passwordPlaceholder')}
                                        type="password"
                                        disabled={loading}
                                        className="pl-9"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="captcha">{t('login.captcha')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="captcha"
                                        placeholder={t('login.captchaPlaceholder')}
                                        type="text"
                                        disabled={loading}
                                        value={captchaInput}
                                        onChange={(e) => setCaptchaInput(e.target.value)}
                                        className="flex-1"
                                    />
                                    {captchaImage && (
                                        <img
                                            src={captchaImage}
                                            alt={t('login.captcha')}
                                            className="h-10 rounded border cursor-pointer bg-white"
                                            onClick={fetchCaptcha}
                                            title={t('login.refreshCaptcha')}
                                        />
                                    )}
                                </div>
                            </div>

                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{translateError(error)}</AlertDescription>
                                </Alert>
                            )}

                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('login.submit')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
