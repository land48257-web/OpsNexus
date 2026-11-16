import React, { useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import * as monaco from 'monaco-editor';
import { useTranslation } from '../i18n';

interface SQLEditorProps {
    value: string;
    onChange: (value: string | undefined) => void;
    onExecute?: () => void;
    onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void;
}

export const SQLEditor: React.FC<SQLEditorProps> = ({ value, onChange, onExecute, onMount }) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const executeRef = useRef(onExecute);
    executeRef.current = onExecute;

    const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
        editorRef.current = editor;

        // Add Command for Ctrl+Enter to execute
        if (onExecute) {
            editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
                executeRef.current?.();
            });
        }

        if (onMount) {
            onMount(editor, monacoInstance);
        }
    };

    return (
        <div className="h-full w-full overflow-hidden rounded-md border border-border bg-background">
            <Editor
                loading={t('common.loading')}
                height="100%"
                defaultLanguage="sql"
                theme={theme === 'light' ? 'light' : 'vs-dark'}
                value={value}
                onChange={onChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 },
                }}
            />
        </div>
    );
};
