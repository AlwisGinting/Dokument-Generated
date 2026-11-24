import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/spj/generate": ["./public/templates/*.docx"],
  },
};

export default nextConfig;
