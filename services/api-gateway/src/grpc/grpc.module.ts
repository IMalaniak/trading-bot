import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

import {
  PORTFOLIO_CLIENT,
  PORTFOLIO_PACKAGE,
  PORTFOLIO_PROTO,
  SIGNALS_CLIENT,
  SIGNALS_PACKAGE,
  SIGNALS_PROTO,
} from './grpc.constants';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SIGNALS_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: SIGNALS_PACKAGE,
          protoPath: join(process.cwd(), SIGNALS_PROTO),
        },
      },
      {
        name: PORTFOLIO_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: PORTFOLIO_PACKAGE,
          protoPath: join(process.cwd(), PORTFOLIO_PROTO),
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientsModule {}
