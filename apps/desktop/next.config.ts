import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import { resolve } from "path"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const isProd = process.env.NODE_ENV === "production"

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist/next",
  assetPrefix: isProd ? "./" : undefined,
  images: { unoptimized: true },
  experimental: {
    outputFileTracingRoot: resolve(__dirname, "../../"),
  },
  transpilePackages: ["@biztrack/types", "@biztrack/utils", "@biztrack/ui"],
}

export default withNextIntl(nextConfig)
