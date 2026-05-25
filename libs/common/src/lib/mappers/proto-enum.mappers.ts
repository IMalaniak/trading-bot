import { AssetClass, OrderStatus, SignalSide } from '../../proto';
import { AssetClassName } from '../enums/asset-class-name.enum';
import { OrderStatusName } from '../enums/order-status-name.enum';
import { SignalSideName } from '../enums/signal-side-name.enum';

export const assetClassNameToAssetClass = (
  name: AssetClassName,
): AssetClass => {
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

export const assetClassToAssetClassName = (
  assetClass: AssetClass,
): AssetClassName => {
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

export const signalSideNameToSignalSide = (
  name: SignalSideName,
): SignalSide => {
  switch (name) {
    case SignalSideName.BUY:
      return SignalSide.BUY;
    case SignalSideName.SELL:
      return SignalSide.SELL;
    case SignalSideName.SIGNAL_SIDE_UNSPECIFIED:
      return SignalSide.SIGNAL_SIDE_UNSPECIFIED;
    default:
      return SignalSide.UNRECOGNIZED;
  }
};

export const orderStatusNameToOrderStatus = (
  name: OrderStatusName,
): OrderStatus => {
  switch (name) {
    case OrderStatusName.PLACED:
      return OrderStatus.PLACED;
    case OrderStatusName.PARTIALLY_FILLED:
      return OrderStatus.PARTIALLY_FILLED;
    case OrderStatusName.FILLED:
      return OrderStatus.FILLED;
    case OrderStatusName.ORDER_STATUS_UNSPECIFIED:
      return OrderStatus.ORDER_STATUS_UNSPECIFIED;
    default:
      return OrderStatus.UNRECOGNIZED;
  }
};
