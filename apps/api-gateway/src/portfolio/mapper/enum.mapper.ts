import { AssetClass } from '@trading-bot/common/proto';

import { AssetClassName } from '../dto/asset-class-name.enum';

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
