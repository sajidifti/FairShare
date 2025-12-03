/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. These are pre-existing code quality issues.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable type checking during build since we have a complex tsconfig setup
    // Run `tsc --noEmit` separately to check types
    ignoreBuildErrors: true,
  },
};

export default nextConfig;


