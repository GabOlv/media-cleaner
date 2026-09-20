import { NativeModule, requireNativeModule } from "expo";

export type DustioMediaModuleEvents = {};

declare class DustioMediaModule extends NativeModule<DustioMediaModuleEvents> {
  canManageMedia(): boolean;
  deleteAsset(assetId: string, mediaKind: string): Promise<boolean>;
}

export default requireNativeModule<DustioMediaModule>("DustioMedia");
