import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';

export function useSqlAutocomplete(
    monacoInstance: typeof monaco | null,
    assetId: string,
    database: string
) {
    const authenticatedFetch = useAuthenticatedFetch();
    const disposableRef = useRef<monaco.IDisposable | null>(null);
    const metadataRef = useRef<any[]>([]);

    // Fetch metadata when database changes
    useEffect(() => {
        if (!assetId || !database) return;

        const fetchMetadata = async () => {
            try {
                const response = await authenticatedFetch(`/api/v1/assets/${encodeURIComponent(assetId)}/metadata?database=${encodeURIComponent(database)}`);
                if (response.ok) {
                    const data = await response.json();
                    // Ensure tables is an array
                    metadataRef.current = Array.isArray(data.tables) ? data.tables : [];
                }
            } catch (error) {
                console.error("Failed to fetch metadata", error);
                metadataRef.current = [];
            }
        };

        fetchMetadata();
    }, [assetId, database, authenticatedFetch]);

    // Register completion provider
    useEffect(() => {
        if (!monacoInstance || !assetId || !database) return;

        // Cleanup previous provider
        if (disposableRef.current) {
            disposableRef.current.dispose();
        }

        const KEYWORDS = [
            'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
            'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
            'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN',
            'ON', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
            'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN',
            'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW'
        ];

        disposableRef.current = monacoInstance.languages.registerCompletionItemProvider('sql', {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const currentWord = word.word.toLowerCase();
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                // Get text up to current position to determine context
                // We use a simple heuristic based on the last keyword found in the current line
                // For a more robust solution, we would need a proper parser or look back multiple lines
                // Get text from the beginning of the file to the current position
                // This ensures we capture context even across multiple lines
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                // Find the last keyword in the text
                // We use a regex to find all keywords and pick the last one
                const keywordRegex = /\b(SELECT|FROM|JOIN|UPDATE|SET|WHERE|GROUP\s+BY|ORDER\s+BY|INSERT\s+INTO|DELETE|VALUES|HAVING|ON)\b/gi;
                const matches = textUntilPosition.match(keywordRegex);
                const lastKeyword = matches && matches.length > 0 ? matches[matches.length - 1].toUpperCase().replace(/\s+/g, ' ') : '';

                const expectingTable = ['FROM', 'JOIN', 'UPDATE', 'INSERT INTO', 'DELETE'].includes(lastKeyword);
                const expectingColumn = ['SELECT', 'WHERE', 'SET', 'GROUP BY', 'ORDER BY', 'HAVING', 'ON'].includes(lastKeyword);

                // If no keyword found yet (start of file), or ambiguous, default to neutral or keywords
                // But if we are clearly expecting a table, we prioritize tables heavily.

                const suggestions: monaco.languages.CompletionItem[] = [];
                const tables = metadataRef.current;

                // Priority constants
                const PRIORITY_HIGH = '0';
                const PRIORITY_MEDIUM = '1';
                const PRIORITY_LOW = '2';

                // 1. Keywords
                KEYWORDS.forEach(keyword => {
                    const isPrefix = keyword.toLowerCase().startsWith(currentWord);
                    suggestions.push({
                        label: keyword,
                        kind: monacoInstance.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range: range,
                        sortText: `${PRIORITY_MEDIUM}${isPrefix ? '0' : '1'}_${keyword}`
                    });
                });

                // 2. Tables & Columns
                tables.forEach((table: any) => {
                    const tableName = table.n;
                    const isTablePrefix = tableName.toLowerCase().startsWith(currentWord);

                    // Table Priority
                    // If expecting table: HIGH
                    // If expecting column: LOW (don't clutter column list)
                    // Otherwise: MEDIUM
                    let tablePriority = PRIORITY_MEDIUM;
                    if (expectingTable) tablePriority = PRIORITY_HIGH;
                    if (expectingColumn) tablePriority = PRIORITY_LOW;

                    suggestions.push({
                        label: tableName,
                        kind: monacoInstance.languages.CompletionItemKind.Class,
                        insertText: tableName,
                        detail: `(${database})`,
                        range: range,
                        sortText: `${tablePriority}${isTablePrefix ? '0' : '1'}_${tableName}`
                    });

                    // Column Suggestions
                    if (Array.isArray(table.c)) {
                        table.c.forEach((col: string) => {
                            const isColPrefix = col.toLowerCase().startsWith(currentWord);

                            // Column Priority
                            // If expecting column: HIGH
                            // If expecting table: LOW (don't clutter table list)
                            // Otherwise: MEDIUM
                            let colPriority = PRIORITY_MEDIUM;
                            if (expectingColumn) colPriority = PRIORITY_HIGH;
                            if (expectingTable) colPriority = PRIORITY_LOW;

                            suggestions.push({
                                label: col,
                                kind: monacoInstance.languages.CompletionItemKind.Field,
                                insertText: col,
                                detail: `(${tableName})`,
                                range: range,
                                sortText: `${colPriority}${isColPrefix ? '0' : '1'}_${col}`
                            });
                        });
                    }
                });

                return { suggestions };
            }
        });

        return () => {
            if (disposableRef.current) {
                disposableRef.current.dispose();
            }
        };
    }, [monacoInstance, assetId, database]);
}
