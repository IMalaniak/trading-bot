import { AssetClass, OrderStatus, SignalSide } from '@trading-bot/common/proto';

import { AssetClassName } from '../dto/asset-class-name.enum';
import { OrderStatusName } from '../dto/order-status-name.enum';
import { SignalSideName } from '../dto/signal-side-name.enum';

export const assetClassNameToAssetClass: (
  name: AssetClassName,
) => AssetClass = (name: AssetClassName) => {
  switch (name) {
    case AssetClassName.ASSET_CLASS_UNSPECIFIED:
      return AssetClass.ASSET_CLASS_UNSPECIFIED;
    case AssetClassName.CRYPTO:
      return AssetClass.CRYPTO;
    case AssetClassName.STOCK:
      return AssetClass.STOCK;
    default:
      return AssetClass.ASSET_CLASS_UNSPECIFIED;
  }
};

export const assetClassToAssetClassName = (assetClass: AssetClass) => {
  switch (assetClass) {
    case AssetClass.ASSET_CLASS_UNSPECIFIED:
      return AssetClassName.ASSET_CLASS_UNSPECIFIED;
    case AssetClass.CRYPTO:
      return AssetClassName.CRYPTO;
    case AssetClass.STOCK:
      return AssetClassName.STOCK;
    default:
      return AssetClassName.ASSET_CLASS_UNSPECIFIED;
  }
};

export const signalSideToSignalSideName = (
  signalSide: SignalSide,
): SignalSideName => {
  switch (signalSide) {
    case SignalSide.BUY:
      return SignalSideName.BUY;
    case SignalSide.SELL:
      return SignalSideName.SELL;
    case SignalSide.SIGNAL_SIDE_UNSPECIFIED:
      return SignalSideName.SIGNAL_SIDE_UNSPECIFIED;
    default:
      return SignalSideName.SIGNAL_SIDE_UNSPECIFIED;
  }
};

export const orderStatusToOrderStatusName = (
  orderStatus: OrderStatus,
): OrderStatusName => {
  switch (orderStatus) {
    case OrderStatus.PLACED:
      return OrderStatusName.PLACED;
    case OrderStatus.PARTIALLY_FILLED:
      return OrderStatusName.PARTIALLY_FILLED;
    case OrderStatus.FILLED:
      return OrderStatusName.FILLED;
    case OrderStatus.ORDER_STATUS_UNSPECIFIED:
      return OrderStatusName.ORDER_STATUS_UNSPECIFIED;
    default:
      return OrderStatusName.ORDER_STATUS_UNSPECIFIED;
  }
};
