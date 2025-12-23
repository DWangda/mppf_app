import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'bt.ngn.ngayoe',
  appName: 'Nga Yoe',
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      launchFadeOutDuration: 1000,
      backgroundColor: '#5bd1d7',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999',
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
    },
    CustomURLScheme: {
      scheme: 'ngayoe', // this becomes "ngayoe://"
      host: 'open',
      androidScheme: 'ngayoe',
      iosScheme: 'ngayoe',
    },
  },
};

export default config;
