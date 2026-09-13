const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api-proxy/:path*',
        destination: 'https://ancline-api-staging.onrender.com/api/:path*'
      }
    ];
  }
};

export default nextConfig;
