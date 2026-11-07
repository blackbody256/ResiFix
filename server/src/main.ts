import './instrument';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { requestLogger } from './common/middleware/request-logger';
import { APP_CONFIG, type AppConfig } from './config/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // behind Nginx
  app.disable('x-powered-by');
  app.use(requestLogger);
  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(
    `ResiFix API on http://localhost:${config.port}/api (${config.nodeEnv}, worker ${
      config.worker.inline ? 'inline' : 'separate'
    })`,
    'Bootstrap',
  );
}

void bootstrap();
