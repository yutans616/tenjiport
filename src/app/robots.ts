import type { MetadataRoute } from "next";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// 出展者向けの個別URL（/apply/[token]）はイベント・出展者ごとの一意なトークンを含む
// 実質的な非公開リンクのため、検索エンジンにインデックスさせてはいけない。
// 主催者側アプリ本体（/events以下等）も認証必須で、公開コンテンツとしての価値がない。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/apply/",
        "/events",
        "/onboard",
        "/plan",
        "/settings",
        "/team",
        "/audit-log",
        "/admin",
        "/contact",
        "/login",
        "/reset-password",
        "/demo/app",
        "/demo/exhibitor",
        "/health",
      ],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
