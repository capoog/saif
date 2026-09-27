import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["bcryptjs", "@sparticuz/chromium", "puppeteer-core"],
  // ملفات بتتقري وقت التشغيل ولازم تتنشر مع الـ route
  outputFileTracingIncludes: {
    "/quotes/[id]/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-{400,700}-normal.woff2",
      "./node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-{400,700}-normal.woff2",
    ],
    "/quotes/[id]/print": ["./node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-*-{400,700}-normal.woff2"],
  },
};

export default nextConfig;
