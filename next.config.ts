import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 添付・ロゴ等のファイルアップロードはServer Actionsで受け取るため、
  // デフォルトの1MB上限だとアプリ側の20MBチェックに届く前に失敗する。
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // 請求書PDF自動生成が読み込む日本語フォントは実行時にfs.readFileSyncで動的パス
  // 読み込みするため、標準のトレースでは検出されない。デプロイ時に確実に含める。
  outputFileTracingIncludes: {
    "/events/[eventId]/invoices/**": ["./src/lib/pdf/fonts/**"],
  },
};

export default nextConfig;
