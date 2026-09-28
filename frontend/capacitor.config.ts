import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.rohly.app",
  appName: "Rohly",
  webDir: "dist",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
  android: {
    backgroundColor: "#0f172a",
  },
  ios: {
    backgroundColor: "#0f172a",
    contentInset: "automatic",
  },
};

export default config;
