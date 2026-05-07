import { bootstrapGrpcMicroservice } from '@trading-bot/common';
import {
  PORTFOLIO_MANAGER_PROTO,
  PROTOBUF_SERVICES_PORTFOLIO_MANAGER_PACKAGE,
} from '@trading-bot/common/proto';

import { AppModule } from './app.module';

void bootstrapGrpcMicroservice({
  module: AppModule,
  packageName: PROTOBUF_SERVICES_PORTFOLIO_MANAGER_PACKAGE,
  protoPath: PORTFOLIO_MANAGER_PROTO,
  urlConfigKey: 'PORTFOLIO_MANAGER_GRPC_URL',
});
