import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  // Create a short-lived application context to read configuration
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const configService = appContext.get(ConfigService);

  const url = configService.get<string>(
    'RISK_PORTFOLIO_GRPC_URL',
    '0.0.0.0:50052',
  );

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'tradingbot.risk',
        protoPath: join(
          __dirname,
          '../../../proto/services/risk_manager.proto',
        ),
        url,
        loader: {
          includeDirs: [join(__dirname, '../../../proto')],
        },
      },
    },
  );

  await app.listen();

  // Close the temporary app context (the microservice has its own module
  // instance). Closing avoids leaking resources in some runtimes.
  await appContext.close();
}

void bootstrap();
