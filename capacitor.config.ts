import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL || 'https://fintrack.vistaenvision.com';
const isLocal = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.sukhjot.fintrack',
  appName: 'FinTrack',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: isLocal,
    allowNavigation: [
      'fintrack.vistaenvision.com',
      '*.vistaenvision.com',
      ...(isLocal ? ['localhost', '127.0.0.1', '10.*', '192.168.*'] : []),
    ],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#09090b',
    preferredContentMode: 'mobile',
    scheme: 'FinTrack',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#09090b',
    },
  },
};

export default config;
