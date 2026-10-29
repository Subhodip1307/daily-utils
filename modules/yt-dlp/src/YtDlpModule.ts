import { NativeModule, requireNativeModule } from 'expo';

declare class YtDlpModule extends NativeModule<{}> {}

export default requireNativeModule<YtDlpModule>('YtDlp');
