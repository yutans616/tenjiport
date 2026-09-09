import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// ファイルは非公開バケットに置き、認可チェック（can_access_file_asset）を通過した場合のみ
// 短期の署名付きURLへリダイレクトする。バケット自体への直接アクセスやRLSには頼らない。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileAssetId: string }> }) {
  const { fileAssetId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: allowed, error: authError } = await supabase.rpc("can_access_file_asset", {
    p_file_asset_id: fileAssetId,
  });
  if (authError || !allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const { data: fileAsset } = await serviceClient
    .from("file_assets")
    .select("storage_key, filename")
    .eq("id", fileAssetId)
    .single();
  if (!fileAsset) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Supabase-jsのcreateSignedUrlはdownloadオプションを二重にパーセントエンコードしてしまい、
  // 日本語ファイル名が文字化けする不具合があるため、downloadは指定せず自前で正しく付与する。
  const { data: signed, error: signError } = await serviceClient.storage.from("files").createSignedUrl(fileAsset.storage_key, 300);
  if (signError || !signed) {
    return NextResponse.json({ error: "failed to sign url" }, { status: 500 });
  }

  const downloadUrl = fileAsset.filename
    ? `${signed.signedUrl}&download=${encodeURIComponent(fileAsset.filename)}`
    : signed.signedUrl;

  return NextResponse.redirect(downloadUrl);
}
