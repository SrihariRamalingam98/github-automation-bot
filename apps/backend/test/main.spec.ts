import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { bootstrap } from '../src/main';
import { configureHttp } from '../src/http';

jest.mock('../src/http', () => ({ configureHttp: jest.fn() }));

describe('Render production bootstrap', () => {
    afterEach(() => jest.restoreAllMocks());
    it('uses the configured port on all interfaces and enables graceful shutdown', async () => {
        const config = { port: 10000 };
        const app = {
            get: jest.fn().mockReturnValue(config),
            enableShutdownHooks: jest.fn(),
            listen: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(NestFactory, 'create').mockResolvedValue(
            app as unknown as NestExpressApplication,
        );
        await bootstrap();
        expect(configureHttp).toHaveBeenCalledWith(app, config);
        expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
        expect(app.listen).toHaveBeenCalledWith(10000, '0.0.0.0');
    });
});
