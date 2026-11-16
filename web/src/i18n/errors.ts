import { t, type StaticMessageKey } from './index';
import { en } from './en';
import { zhCN } from './zh-CN';

// The API currently exposes diagnostic strings rather than error codes. Match
// only application-owned messages and prefixes; preserve driver diagnostics.
const apiMessages: Record<string, StaticMessageKey> = {
    'Invalid credentials': 'error.invalidCredentials',
    'Invalid captcha': 'error.invalidCaptcha',
    'Invalid request': 'error.invalidRequest',
    'Failed to generate captcha': 'error.captcha',
    'Failed to generate token': 'error.token',
    'Unauthorized': 'error.unauthorized',
    'Invalid token format': 'error.unauthorized',
    'Authorization required': 'error.unauthorized',
    'Invalid or expired token': 'error.unauthorized',
    'Unknown user': 'error.unauthorized',
    'Failed to fetch': 'error.network',
    'NetworkError when attempting to fetch resource.': 'error.network',
    'Load failed': 'error.network',
    'Failed to load directory': 'error.loadDirectory',
    'Failed to read directory': 'error.loadDirectory',
    'Failed to create directory': 'error.createDirectory',
    'Failed to create file': 'error.createFile',
    'Failed to delete': 'error.delete',
    'SCAN failed': 'error.scan',
    'invalid db index': 'error.invalidDb',
    'Failed to connect to database': 'error.databaseConnection',
    'Failed to get provider': 'error.provider',
    'Failed to list databases': 'error.listDatabases',
    'Failed to list tables': 'error.listTables',
    'Failed to count rows': 'error.countRows',
    'Failed to fetch data': 'error.loadData',
    'Failed to read rows': 'error.readRows',
    'Failed to get metadata': 'error.metadata',
    'SSH connection not found. Please connect via terminal first.': 'error.sshRequired',
    'SSH connection not found': 'error.sshMissing',
    'Failed to create SFTP client': 'error.sftp',
    'No file uploaded': 'error.noUpload',
    'Failed to create remote file': 'error.remoteFile',
    'Upload failed': 'error.upload',
    'Upload close failed': 'error.uploadClose',
    'File not found': 'error.fileMissing',
    'Failed to get file info': 'error.fileInfo',
    'Failed to close file': 'error.fileClose',
    'key not found': 'error.keyMissing',
    'Server not found': 'error.serverMissing',
    'Asset manager not initialized': 'error.assetManager',
    'API endpoint not found': 'error.endpoint',
    'asset_id is required': 'error.assetRequired',
    'asset_id and database are required': 'error.assetDatabaseRequired',
    'asset_id, database, and collection are required': 'error.collectionRequired',
    'asset_id and key are required': 'error.keyRequired',
    'database parameter is required': 'error.databaseRequired',
    'database and table parameters are required': 'error.tableRequired',
    'path is required': 'error.pathRequired',
    'script is required': 'error.scriptRequired',
    'request type must match the MySQL/DM asset type': 'error.assetType',
    'pipeline must be an array of documents': 'error.pipelineArray',
    'sample_size must be between 1 and 1000': 'error.sampleSize',
    'page must be between 1 and 1000000': 'error.page',
    'pageSize must be between 1 and 1000': 'error.pageSize',
    'invalid filter': 'error.filter',
    'invalid sort': 'error.sort',
    'invalid update': 'error.update',
    'invalid document': 'error.document',
    'Execution cancelled or timed out; verify database state before retrying': 'error.cancelledTransaction',
};

// Errors already on screen should also update when the language changes.
const messages = new Map<string, StaticMessageKey>(Object.entries(apiMessages));
for (const [key, message] of Object.entries(zhCN)) {
    if (!key.startsWith('error.') || message.includes('{{')) continue;
    const staticKey = key as StaticMessageKey;
    messages.set(message, staticKey);
    messages.set(en[staticKey] as string, staticKey);
}

export function translateError(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error ?? '');
    // Some request handlers use response.text() for failed JSON responses.
    try {
        const body: unknown = JSON.parse(message);
        if (body && typeof body === 'object') {
            const payload = body as { error?: unknown; message?: unknown };
            if (typeof payload.error === 'string') message = payload.error;
            else if (typeof payload.message === 'string') message = payload.message;
        }
    } catch {
        // Plain-text diagnostics are expected too.
    }
    const key = messages.get(message);
    if (key) return t(key);
    for (const [source, key] of messages) {
        if (message.startsWith(`${source}: `) || message.startsWith(`${source}：`)) {
            const detail = message.slice(source.length + 1).trimStart();
            return `${t(key)}: ${detail}`;
        }
    }
    return message;
}
