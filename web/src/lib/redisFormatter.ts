
export function formatRedisResult(result: any): string {
    if (result === null || result === undefined) {
        return "(nil)";
    }

    if (typeof result === 'string') {
        return `"${result}"`;
    }

    if (typeof result === 'number') {
        return `(integer) ${result}`;
    }

    if (typeof result === 'boolean') {
        return result ? "(true)" : "(false)";
    }

    if (Array.isArray(result)) {
        if (result.length === 0) {
            return "(empty array)";
        }

        const lines = result.map((item, index) => {
            const formattedItem = formatRedisResult(item);
            // Indent subsequent lines if the item is multiline? 
            // For simplicity, just number them.
            // If item is a string, it might be quoted.
            // If item is an array, it needs indentation.

            // Let's handle nested arrays by splitting lines and indenting
            const itemLines = formattedItem.split('\n');
            const firstLine = `${index + 1}) ${itemLines[0]}`;
            const otherLines = itemLines.slice(1).map(l => `   ${l}`).join('\n');

            return otherLines ? `${firstLine}\n${otherLines}` : firstLine;
        });

        return lines.join('\n');
    }

    if (typeof result === 'object') {
        // Should not happen for standard Redis commands via go-redis Do(), 
        // but maybe for some custom things or if go-redis returns maps for some commands.
        return JSON.stringify(result, null, 2);
    }

    return String(result);
}
