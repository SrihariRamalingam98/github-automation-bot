import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';
import { configureHttp } from './http';

export async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
        logger: new ConsoleLogger('App', { json: true }),
    });
    const config = app.get(AppConfig);
    configureHttp(app, config);
    app.enableShutdownHooks();
    await app.listen(config.port, '0.0.0.0');
}
if (require.main === module)
    void bootstrap().catch(() => {
        process.stderr.write(
            '{"event":"startup_failed","message":"Check required configuration and database connectivity"}\n',
        );
        process.exitCode = 1;
    });
