/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hhopkins/agent-runtime-react', '@hhopkins/agent-runtime'],
  webpack: (config, { dev }) => {
    if (dev) {
      // Watch workspace package dist folders for changes
      config.snapshot = {
        ...config.snapshot,
        managedPaths: [],
      };
    }
    return config;
  },
}

module.exports = nextConfig
