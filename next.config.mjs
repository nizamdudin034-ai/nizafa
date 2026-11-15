/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the build self-contained; no external image domains needed in v1.
  images: { remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }] },
};

export default nextConfig;
