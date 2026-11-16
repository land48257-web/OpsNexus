import { useTranslation } from '../i18n';
import { translateError } from '../i18n/errors';
import React, { useState, useEffect, useRef } from 'react';
import { Folder, File, Download, RefreshCw, Upload, FolderPlus, FilePlus, Trash2, ArrowUp, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuthStore } from '../stores/authStore';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { withBasePath } from '../lib/basePath';

interface FileTreeProps {
    assetId: string;
    enabled?: boolean;
}

interface FileItem {
    name: string;
    size: number;
    is_dir: boolean;
    mode: string;
}

export const FileTree: React.FC<FileTreeProps> = ({ assetId, enabled = true }) => {
    const { t } = useTranslation();
    const [currentPath, setCurrentPath] = useState('/tmp');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);

    // Dialog states
    const [showNewDirDialog, setShowNewDirDialog] = useState(false);
    const [showNewFileDialog, setShowNewFileDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const token = useAuthStore((state) => state.token);

    const authenticatedFetch = useAuthenticatedFetch();

    const loadDirectory = async (path: string) => {
        if (!enabled || !token) return;

        setLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch(`/api/v1/sftp/${encodeURIComponent(assetId)}/list?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || t('error.loadDirectory'));
            }
            const data = await response.json();
            setFiles(data.files || []);
            setCurrentPath(path);
            setSelectedFile(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('error.loadDirectory'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (enabled && token) {
            loadDirectory('/tmp');
        }
    }, [assetId, enabled, token]);

    const handleDirClick = (name: string) => {
        const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
        loadDirectory(newPath);
    };

    const handleFileClick = (name: string) => {
        setSelectedFile(name);
    };

    const goUp = () => {
        if (currentPath === '/') return;
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        const newPath = parts.length === 0 ? '/' : '/' + parts.join('/');
        loadDirectory(newPath);
    };

    const handleRefresh = () => {
        loadDirectory(currentPath);
    };

    const handleDownload = () => {
        if (!selectedFile) return;
        const filePath = currentPath === '/' ? `/${selectedFile}` : `${currentPath}/${selectedFile}`;
        // Download link needs token in query param since we can't set headers for window.open
        window.open(withBasePath(`/api/v1/sftp/${encodeURIComponent(assetId)}/download?path=${encodeURIComponent(filePath)}&token=${token}`), '_blank');
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const files = e.target.files;
        // Use the existing global upload mechanism via terminal if possible, or direct API
        // Here we use direct API for simplicity and to match the toolbar context

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await authenticatedFetch(`/api/v1/sftp/${encodeURIComponent(assetId)}/upload?path=${encodeURIComponent(currentPath)}`, {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('Upload failed:', error);
                    // Ideally show a toast here
                }
            } catch (err) {
                console.error('Upload error:', err);
            }
        }

        // Clear input and refresh
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadDirectory(currentPath);
    };

    const handleCreateDir = async () => {
        if (!newItemName) return;
        const path = currentPath === '/' ? `/${newItemName}` : `${currentPath}/${newItemName}`;

        try {
            const response = await authenticatedFetch(`/api/v1/sftp/${encodeURIComponent(assetId)}/mkdir?path=${encodeURIComponent(path)}`, {
                method: 'POST'
            });

            if (response.ok) {
                setShowNewDirDialog(false);
                setNewItemName('');
                loadDirectory(currentPath);
            } else {
                const data = await response.json();
                alert(translateError(data.error || t('error.createDirectory')));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateFile = async () => {
        if (!newItemName) return;
        const path = currentPath === '/' ? `/${newItemName}` : `${currentPath}/${newItemName}`;

        try {
            const response = await authenticatedFetch(`/api/v1/sftp/${encodeURIComponent(assetId)}/create_file?path=${encodeURIComponent(path)}`, {
                method: 'POST'
            });

            if (response.ok) {
                setShowNewFileDialog(false);
                setNewItemName('');
                loadDirectory(currentPath);
            } else {
                const data = await response.json();
                alert(translateError(data.error || t('error.createFile')));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async () => {
        if (!selectedFile) return;
        const path = currentPath === '/' ? `/${selectedFile}` : `${currentPath}/${selectedFile}`;

        try {
            const response = await authenticatedFetch(`/api/v1/sftp/${encodeURIComponent(assetId)}/delete?path=${encodeURIComponent(path)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setShowDeleteDialog(false);
                setSelectedFile(null);
                loadDirectory(currentPath);
            } else {
                const data = await response.json();
                alert(translateError(data.error || t('error.delete')));
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 relative">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={handleFileSelect}
            />

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b border-border">
                <div className="flex items-center gap-1">
                    <button onClick={goUp} className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors" title={t('files.parent')}>
                        <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3.5 bg-border mx-1" />
                    <button onClick={handleUploadClick} className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors" title={t('files.upload')}>
                        <Upload className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={!selectedFile}
                        className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title={t('files.download')}
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3.5 bg-border mx-1" />
                    <button onClick={() => setShowNewDirDialog(true)} className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors" title={t('files.newDirectory')}>
                        <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setShowNewFileDialog(true)} className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors" title={t('files.newFile')}>
                        <FilePlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={!selectedFile}
                        className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title={t('common.delete')}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1" />
                    <button onClick={handleRefresh} className="p-1 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors" title={t('common.refresh')}>
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Current Path */}
            <div className="px-3 py-2 border-b border-border">
                <div className="text-xs text-muted-foreground font-mono truncate bg-muted/50 px-2 py-1 rounded" title={currentPath}>
                    {currentPath}
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-2" onClick={() => setSelectedFile(null)}>
                {loading && (
                    <div className="text-center py-8 text-muted-foreground text-xs">{t('common.loading')}</div>
                )}

                {error && (
                    <div className="text-center py-4 text-destructive text-xs px-2">{translateError(error)}</div>
                )}

                {!loading && !error && (
                    <div className="space-y-0.5">
                        {files.map((file, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "group flex items-center px-2 py-1.5 text-xs rounded-md cursor-pointer select-none transition-colors",
                                    selectedFile === file.name ? "bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleFileClick(file.name);
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (file.is_dir) handleDirClick(file.name);
                                }}
                            >
                                {file.is_dir ? (
                                    <Folder className="w-3.5 h-3.5 mr-2 text-amber-400 flex-shrink-0" />
                                ) : (
                                    <File className="w-3.5 h-3.5 mr-2 text-muted-foreground/70 flex-shrink-0" />
                                )}
                                <span className="truncate flex-1">{file.name}</span>
                                <span className="text-muted-foreground/50 text-[10px] ml-2 w-12 text-right flex-shrink-0 font-mono">
                                    {file.is_dir ? '-' : (file.size / 1024 < 1 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dialogs */}
            {(showNewDirDialog || showNewFileDialog) && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-card border border-border rounded-lg p-4 w-64 shadow-xl">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-foreground">
                                {showNewDirDialog ? t('files.newDirectory') : t('files.newFile')}
                            </h3>
                            <button onClick={() => { setShowNewDirDialog(false); setShowNewFileDialog(false); setNewItemName(''); }}>
                                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder={t('files.namePlaceholder')}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm text-foreground mb-3 focus:outline-none focus:border-primary"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (showNewDirDialog) { void handleCreateDir(); } else { void handleCreateFile(); }
                                }
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setShowNewDirDialog(false); setShowNewFileDialog(false); setNewItemName(''); }}
                                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={() => showNewDirDialog ? handleCreateDir() : handleCreateFile()}
                                className="px-2 py-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded"
                            >
                                {t('common.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteDialog && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-card border border-border rounded-lg p-4 w-64 shadow-xl">
                        <h3 className="text-sm font-semibold text-foreground mb-2">{t('files.confirmDelete')}</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                            {t('files.deleteWarning', { name: selectedFile || '' })}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowDeleteDialog(false)}
                                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-2 py-1 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded"
                            >
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
