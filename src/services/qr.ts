import * as FileSystem from 'expo-file-system/legacy';

export type QrType = 'link' | 'text' | 'wifi' | 'phone';
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export type QrInput = {
  type: QrType;
  text: string;
  link: string;
  phone: string;
  wifi: { ssid: string; password: string; security: WifiSecurity; hidden: boolean };
};

// Wi-Fi QR format needs these characters escaped
const escapeWifi = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

/** Turns the form into the text stored inside the QR code */
export function buildQrValue(input: QrInput): string {
  switch (input.type) {
    case 'text':
      return input.text.trim();

    case 'link': {
      const link = input.link.trim();
      if (!link) return '';
      return /^[a-z]+:\/\//i.test(link) ? link : `https://${link}`;
    }

    case 'phone': {
      const phone = input.phone.replace(/[^\d+]/g, '');
      return phone ? `tel:${phone}` : '';
    }

    case 'wifi': {
      const { ssid, password, security, hidden } = input.wifi;
      if (!ssid.trim()) return '';
      let value = `WIFI:T:${security};S:${escapeWifi(ssid)};`;
      if (security !== 'nopass') value += `P:${escapeWifi(password)};`;
      if (hidden) value += 'H:true;';
      return value + ';';
    }
  }
}

/** Converts the rendered QR into a PNG file and returns its path */
export async function qrToPngFile(qrRef: any): Promise<string> {
  const data: string = await new Promise((resolve) => qrRef.toDataURL(resolve));
  const base64 = data.replace(/^data:image\/\w+;base64,/, '');
  const uri = `${FileSystem.cacheDirectory}qr_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}