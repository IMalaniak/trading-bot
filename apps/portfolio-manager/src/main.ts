import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { commonAppSetup } from '@trading-bot/common';
import {
  PORTFOLIO_MANAGER_PROTO,
  PROTO_FOLDER,
  PROTOBUF_SERVICES_PORTFOLIO_MANAGER_PACKAGE,
} from '@trading-bot/common/proto';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  // Create a short-lived application context to read configuration
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const configService = appContext.get(ConfigService);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      bufferLogs: true,
      transport: Transport.GRPC,
      options: {
        package: PROTOBUF_SERVICES_PORTFOLIO_MANAGER_PACKAGE,
        protoPath: join(process.cwd(), PORTFOLIO_MANAGER_PROTO),
        url: configService.getOrThrow<string>('PORTFOLIO_MANAGER_GRPC_URL'),
        loader: {
          includeDirs: [join(process.cwd(), PROTO_FOLDER)],
        },
      },
    },
  );

  commonAppSetup(app);

  await app.listen();

  // Close the temporary app context (the microservice has its own module
  // instance). Closing avoids leaking resources in some runtimes.
  await appContext.close();
}

void bootstrap();
