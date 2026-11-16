import { expect, it } from 'vitest';
import { buildRedisKeyTree } from '../src/lib/redisKeyTree';

it('handles keys named after JavaScript prototype properties', () => {
    const tree = buildRedisKeyTree(['__proto__:value', 'constructor:toString', 'toString']);
    expect(tree.__proto__.children.value.fullPath).toBe('__proto__:value');
    expect(tree.constructor.children.toString.isLeaf).toBe(true);
    expect(Object.getPrototypeOf(tree)).toBeNull();
});

it('preserves both a key and keys under the same prefix regardless of scan order', () => {
    for (const keys of [['a', 'a:b'], ['a:b', 'a']]) {
        const tree = buildRedisKeyTree(keys);
        expect(tree.a.isLeaf).toBe(true);
        expect(tree.a.children.b.isLeaf).toBe(true);
    }
});
