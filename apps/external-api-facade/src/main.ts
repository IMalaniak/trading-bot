import { bootstrapGrpcHybridApplication } from '@trading-bot/common';
import {
  EXTERNAL_API_FACADE_PROTO,
  PROTOBUF_SERVICES_EXTERNAL_API_FACADE_PACKAGE,
} from '@trading-bot/common/proto';

import { AppModule } from './app.module';

void bootstrapGrpcHybridApplication({
  module: AppModule,
  packageName: PROTOBUF_SERVICES_EXTERNAL_API_FACADE_PACKAGE,
  protoPath: EXTERNAL_API_FACADE_PROTO,
  urlConfigKey: 'EXTERNAL_API_FACADE_GRPC_URL',
  httpPortConfigKey: 'EXTERNAL_API_FACADE_METRICS_PORT',
});
