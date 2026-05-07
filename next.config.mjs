/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'rukminim1.flixcart.com' },
      { protocol: 'https', hostname: 'rukminim2.flixcart.com' },
      { protocol: 'https', hostname: 'www.flipkart.com' },
    ],
  },
};

export default nextConfig;
