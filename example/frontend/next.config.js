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
      // Add 'development' condition for conditional exports
      config.resolve.conditionNames = ['development', ...config.resolve.conditionNames];
    }
    return config;
  },
}

module.exports = nextConfig
