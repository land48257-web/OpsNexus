export interface TreeNode {
    name: string;
    fullPath: string;
    isLeaf: boolean;
    children: Record<string, TreeNode>;
}

export function buildRedisKeyTree(keys: string[]): Record<string, TreeNode> {
    const root: Record<string, TreeNode> = Object.create(null);
    for (const key of keys) {
        const parts = key.split(':');
        let level = root;
        parts.forEach((part, index) => {
            const isLast = index === parts.length - 1;
            if (!level[part]) {
                level[part] = {
                    name: part,
                    fullPath: parts.slice(0, index + 1).join(':'),
                    isLeaf: false,
                    children: Object.create(null),
                };
            }
            if (isLast) level[part].isLeaf = true;
            level = level[part].children;
        });
    }
    return root;
}
