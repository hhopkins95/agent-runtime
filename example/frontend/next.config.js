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
      const defaultConditions = config.resolve.conditionNames || ['import', 'module', 'require', 'node', 'default'];
      config.resolve.conditionNames = ['development', ...defaultConditions];
    }
    return config;
  },
}

module.exports = nextConfig
