import { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { PROTO_FOLDER } from '../../proto/index';
import { commonAppSetup } from './common-app-setup';
import { createGrpcValidationPipe } from './create-grpc-validation-pipe';

export interface BootstrapGrpcMicroserviceOptions {
  module: Type<unknown>;
  packageName: string;
  protoPath: string;
  urlConfigKey: string;
  protoFolder?: string;
}

export async function bootstrapGrpcMicroservice({
  module,
  packageName,
  protoPath,
  urlConfigKey,
  protoFolder = PROTO_FOLDER,
}: BootstrapGrpcMicroserviceOptions): Promise<void> {
  // Create a short-lived application context to read configuration
  const appContext = await NestFactory.createApplicationContext(module);

  try {
    const configService = appContext.get(ConfigService);

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
      module,
      {
        bufferLogs: true,
        transport: Transport.GRPC,
        options: {
          package: packageName,
          protoPath: join(process.cwd(), protoPath),
          url: configService.getOrThrow<string>(urlConfigKey),
          loader: {
            includeDirs: [join(process.cwd(), protoFolder)],
          },
        },
      },
    );

    commonAppSetup(app);
    app.useGlobalPipes(createGrpcValidationPipe());

    await app.listen();
  } finally {
    // Close the temporary app context (the microservice has its own module
    // instance). Closing avoids leaking resources in some runtimes.
    await appContext.close();
  }
}
