/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Erzeugt .next/standalone mit minimalem Node-Server (für das Docker-Image)
  output: "standalone",
};
export default nextConfig;
