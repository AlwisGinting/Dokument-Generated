import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "canvas"],
  outputFileTracingIncludes: {
    "/api/spj/generate": ["./public/templates/*.docx"],
  },
};

export default nextConfig;
