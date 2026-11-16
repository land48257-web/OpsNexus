const rawBasePath = import.meta.env.BASE_URL || '/';
const normalizedBasePath = rawBasePath.endsWith('/')
    ? rawBasePath.slice(0, -1)
    : rawBasePath;

export const getBasePath = (): string => normalizedBasePath;

export const withBasePath = (path: string): string => {
    if (path.startsWith('//') || !path.startsWith('/')) {
        return path;
    }
    if (!normalizedBasePath) {
        return path;
    }
    if (path === normalizedBasePath || path.startsWith(`${normalizedBasePath}/`)) {
        return path;
    }
    return `${normalizedBasePath}${path}`;
};

export const toLoginPath = (): string => withBasePath('/login');

export const buildWsUrl = (path: string): string => {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}${withBasePath(path)}`;
};
