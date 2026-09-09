import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 添付・ロゴ等のファイルアップロードはServer Actionsで受け取るため、
  // デフォルトの1MB上限だとアプリ側の20MBチェックに届く前に失敗する。
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
