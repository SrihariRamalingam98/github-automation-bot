import js from '@eslint/js';
import ts from 'typescript-eslint';
import angular from 'angular-eslint';
export default ts.config(
    { ignores: ['**/dist/**', '**/node_modules/**', '**/.angular/**'] },
    {
        files: ['apps/**/*.ts'],
        extends: [js.configs.recommended, ...ts.configs.recommended],
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
    {
        files: ['apps/frontend/**/*.ts'],
        extends: [...angular.configs.tsRecommended],
    },
    {
        files: ['apps/frontend/**/*.html'],
        extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    },
);
