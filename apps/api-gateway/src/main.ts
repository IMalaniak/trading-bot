import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { setupApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  setupApp(app);

  const config = new DocumentBuilder()
    .setTitle('Trading Bot API')
    .setDescription('The Trading Bot API')
    .setVersion('1.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('openapi', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
