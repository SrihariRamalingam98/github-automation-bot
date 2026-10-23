module.exports = {
    testEnvironment: require.resolve('jest-environment-node'),
    testMatch: ['<rootDir>/test/**/*.spec.ts'],
    testTimeout: 15000,
    transform: {
        '^.+\\.ts$': [
            require.resolve('ts-jest'),
            { tsconfig: { rootDir: '.', noUnusedLocals: false } },
        ],
    },
};
