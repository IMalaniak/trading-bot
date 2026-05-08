import { bootstrapGrpcHybridApplication } from '@trading-bot/common';
import {
  EXECUTION_ENGINE_PROTO,
  PROTOBUF_SERVICES_EXECUTION_ENGINE_PACKAGE,
} from '@trading-bot/common/proto';

import { AppModule } from './app/app.module';

void bootstrapGrpcHybridApplication({
  module: AppModule,
  packageName: PROTOBUF_SERVICES_EXECUTION_ENGINE_PACKAGE,
  protoPath: EXECUTION_ENGINE_PROTO,
  urlConfigKey: 'EXECUTION_ENGINE_GRPC_URL',
  httpPortConfigKey: 'EXECUTION_ENGINE_METRICS_PORT',
});
