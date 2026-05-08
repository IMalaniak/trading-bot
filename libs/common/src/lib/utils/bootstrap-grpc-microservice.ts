import { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { join } from 'path';

import { PROTO_FOLDER } from '../../proto/index';
import { commonAppSetup } from './common-app-setup';
import { createGrpcValidationPipe } from './create-grpc-validation-pipe';

export interface BootstrapGrpcHybridApplicationOptions {
  module: Type<unknown>;
  packageName: string;
  protoPath: string;
  urlConfigKey: string;
  httpPortConfigKey: string;
  httpHost?: string;
  protoFolder?: string;
}

export async function bootstrapGrpcHybridApplication({
  module,
  packageName,
  protoPath,
  urlConfigKey,
  httpPortConfigKey,
  httpHost = '0.0.0.0',
  protoFolder = PROTO_FOLDER,
}: BootstrapGrpcHybridApplicationOptions): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    module,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  commonAppSetup(app);
  app.useGlobalPipes(createGrpcValidationPipe());

  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>(
    {
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
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();
  await app.listen(
    configService.getOrThrow<number>(httpPortConfigKey),
    httpHost,
  );
}
