import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, FileText, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { demoConfig } from "./config";
import { PricingSimulator } from "./PricingSimulator";
import { TimeRexBooking } from "./TimeRexBooking";
import { TrackedLink } from "./TrackedLink";
import { ViewTracker } from "./ViewTracker";

export const metadata: Metadata = {
  title: "登録不要デモ｜展示会・出展者管理クラウド テンジポート",
  description:
    "出展者情報の収集、資料配布、確認状況、入金確認をひとつの画面で。登録不要の操作デモで、主催者・出展者両方の画面を体験できます。",
  robots: { index: false, follow: false },
};

const NAV_LINKS = [
  { href: "#experience", label: "体験内容" },
  { href: "#pricing", label: "料金" },
  { href: "#docs", label: "資料" },
  { href: "#consult", label: "導入相談" },
];

const PROBLEMS = [
  {
    title: "メールとExcelを照合し、未提出の出展者を探す",
    body: "誰が提出済みで誰がまだなのか、都度メールを遡って確認していませんか。",
  },
  {
    title: "配布した搬入案内が確認されたか、個別に連絡する",
    body: "資料を送っただけでは、読んでもらえたかは分かりません。",
  },
  {
    title: "請求書と入金確認を、別々の表で管理する",
    body: "銀行振込の入金確認と請求状況が、別のファイルに分かれていませんか。",
  },
];

const EXPERIENCE_STEPS = [
  "一覧を見る",
  "案内を公開",
  "出展者が確認",
  "一覧に反映",
];

const FLOW_STEPS = [
  { title: "入力項目とイベントを設定", body: "主催者が、出展者に入力してほしい項目とイベント情報を設定します。" },
  { title: "出展者へ登録URLを案内", body: "出展者は、案内されたURLからログイン不要で入力を開始できます。" },
  { title: "情報と確認状況を管理", body: "集まった情報、配布資料の確認状況、入金状況をひとつの画面で管理します。" },
];

const FAQS = [
  { q: "デモには登録が必要ですか？", a: "不要です。架空データを使った操作体験です。" },
  { q: "デモからメールが送信されたり課金されたりしますか？", a: "ありません。通知は画面内で再現します。" },
  {
    q: "出展者はどこから使い始めますか？",
    a: "主催者から案内されたURLで情報を入力します。以後は登録済みのメールアドレスで再度アクセスできます。",
  },
  { q: "銀行振込の入金も自動で確認されますか？", a: "主催者が銀行への入金を確認し、手動で状態を更新します。" },
  { q: "Excelで使えますか？", a: "出展者一覧はCSV形式で出力できます（Excelでも開いて編集いただけます）。" },
  {
    q: "すでに募集が始まっていても利用できますか？",
    a: "現在の収集状況によって導入方法が変わるため、まずは導入相談でご相談ください。",
  },
  { q: "会議は必須ですか？", a: "現在はご検討内容の確認のため、導入相談を挟む形をご案内しています。" },
  { q: "年間プランの上限を超える場合は？", a: "個別見積もりへご案内します。" },
];

export default function DemoLandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#F5F8FC] text-[#102C50]">
      <ViewTracker />

      <header className="sticky top-0 z-10 border-b border-[#DCE5EF] bg-[#F5F8FC]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="relative h-8 w-32 shrink-0">
            <Image src="/tenjiport_logo.png" alt="TenjiPort" fill priority className="object-contain object-left" />
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#102C50]/80 md:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-[#0068C8]">
                {link.label}
              </a>
            ))}
          </nav>
          <TrackedLink
            href={demoConfig.demoAppPath}
            event="demo_start_click"
            eventProps={{ cta_location: "header" }}
          >
            <Button className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90">デモを試す</Button>
          </TrackedLink>
        </div>
      </header>

      {/* ファーストビュー */}
      <section className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-2 md:items-center md:py-24">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold tracking-wide text-[#0068C8]">展示会・出展者管理クラウド</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#102C50] sm:text-4xl">
            出展者情報も、資料の確認状況も。ひとつの画面で。
          </h1>
          <p className="text-base leading-[1.7] text-[#102C50]/80">
            情報収集、資料配布、確認状況、銀行振込の入金確認をまとめて管理。主催者と出展者、両方の画面を体験できます。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <TrackedLink href={demoConfig.demoAppPath} event="demo_start_click" eventProps={{ cta_location: "hero" }}>
              <Button size="lg" className="w-full bg-[#0068C8] text-white hover:bg-[#0068C8]/90 sm:w-auto">
                登録不要でデモを試す
              </Button>
            </TrackedLink>
          </div>
          <p className="text-xs text-[#102C50]/60">
            架空の展示会データで体験できます。実際のメール送信や課金は行われません。
          </p>
          <div className="flex gap-4 text-sm">
            <a href="#docs" className="text-[#0068C8] underline-offset-4 hover:underline">
              サービス資料を見る
            </a>
            <a href="#consult" className="text-[#0068C8] underline-offset-4 hover:underline">
              15分の導入相談を予約
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#DCE5EF] bg-white shadow-sm">
          <Image
            src="/demo/hero-exhibitors.png"
            alt="主催者側の出展者一覧画面（実際のデモ画面）"
            width={1280}
            height={800}
            className="h-auto w-full"
          />
        </div>
      </section>

      {/* 課題 */}
      <section className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          こんな確認作業に、時間を取られていませんか？
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <Card key={p.title} className="border-[#DCE5EF]">
              <CardContent className="flex flex-col gap-2 py-6">
                <h3 className="font-semibold text-[#102C50]">{p.title}</h3>
                <p className="text-sm text-[#102C50]/70">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 体験内容 */}
      <section id="experience" className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          主催者と出展者の操作を、ひと通り体験
        </h2>
        <ol className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row sm:justify-between">
          {EXPERIENCE_STEPS.map((step, i) => (
            <li key={step} className="flex flex-1 items-center gap-2 text-sm font-medium text-[#102C50]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0068C8] text-xs text-white">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        {demoConfig.videoUrl ? (
          <div className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-xl border border-[#DCE5EF] bg-white shadow-sm">
            <video controls preload="none" poster={demoConfig.videoPoster ?? undefined} className="w-full">
              <source src={demoConfig.videoUrl} type="video/webm" />
              {demoConfig.videoCaptionsUrl ? (
                <track kind="captions" srcLang="ja" label="日本語" src={demoConfig.videoCaptionsUrl} default />
              ) : null}
              お使いのブラウザは動画の再生に対応していません。上の「登録不要でデモを試す」から直接お試しください。
            </video>
          </div>
        ) : null}

        <div className="mt-8 flex justify-center">
          <TrackedLink href={demoConfig.demoAppPath} event="demo_start_click" eventProps={{ cta_location: "experience" }}>
            <Button size="lg" className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90">
              登録不要でデモを試す
            </Button>
          </TrackedLink>
        </div>

        <h3 className="mt-16 text-center text-xl font-semibold tracking-tight">
          最初の情報収集から、そのまま管理へ
        </h3>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FLOW_STEPS.map((step, i) => (
            <Card key={step.title} className="border-[#DCE5EF]">
              <CardContent className="flex flex-col gap-2 py-6">
                <span className="text-xs font-semibold text-[#0068C8]">STEP {i + 1}</span>
                <h4 className="font-semibold text-[#102C50]">{step.title}</h4>
                <p className="text-sm text-[#102C50]/70">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 料金 */}
      <section id="pricing" className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">料金</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="border-[#DCE5EF]">
            <CardHeader>
              <CardTitle className="text-base">開催ごと</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className="text-2xl font-semibold text-[#102C50]">
                ¥{demoConfig.standardFeeYen.toLocaleString("ja-JP")}
              </span>
              <span className="text-sm text-[#102C50]/70">
                1開催・{demoConfig.standardIncludedCompanies}社まで（{demoConfig.taxLabel}）
              </span>
              <span className="text-sm text-[#102C50]/70">
                31社目から1社¥{demoConfig.overageFeeYenPerCompany.toLocaleString("ja-JP")}
              </span>
            </CardContent>
          </Card>
          <Card className="border-[#0068C8]">
            <CardHeader>
              <CardTitle className="text-base">年間</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className="text-2xl font-semibold text-[#102C50]">
                ¥{demoConfig.annualPriceYen.toLocaleString("ja-JP")}
              </span>
              <span className="text-sm text-[#102C50]/70">
                年{demoConfig.annualEventCap}開催・各開催{demoConfig.annualParticipantCapPerEvent}社まで（{demoConfig.taxLabel}）
              </span>
            </CardContent>
          </Card>
          <Card className="border-[#DCE5EF]">
            <CardHeader>
              <CardTitle className="text-base">個別見積もり</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <span className="text-sm text-[#102C50]/70">
                年間7開催以上、または1開催301社以上をご利用の場合。主催法人・支援範囲等もあわせてご相談ください。
              </span>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6">
          <PricingSimulator />
        </div>
      </section>

      {/* 資料 */}
      <section id="docs" className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <Card className="border-[#DCE5EF]">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-6 w-6 shrink-0 text-[#0068C8]" />
              <div>
                <h2 className="text-lg font-semibold text-[#102C50]">社内でのご検討・共有に</h2>
                <p className="mt-1 text-sm text-[#102C50]/70">
                  機能、導入の流れ、料金をまとめたサービス資料をご覧いただけます。
                </p>
              </div>
            </div>
            {demoConfig.documentViewUrl ? (
              <div className="flex shrink-0 gap-2">
                <TrackedLink href={demoConfig.documentViewUrl} event="document_view_click" external>
                  <Button variant="outline">資料を読む</Button>
                </TrackedLink>
                {demoConfig.documentDownloadUrl ? (
                  <TrackedLink href={demoConfig.documentDownloadUrl} event="document_download_click" external>
                    <Button className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90">PDFをダウンロード</Button>
                  </TrackedLink>
                ) : null}
              </div>
            ) : (
              <p className="shrink-0 text-sm text-[#102C50]/60">
                資料は準備中です。<a href="#consult" className="text-[#0068C8] underline-offset-4 hover:underline">導入相談</a>にてご案内します。
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">よくあるご質問</h2>
        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4">
          {FAQS.map((faq) => (
            <Card key={faq.q} className="border-[#DCE5EF]">
              <CardContent className="flex flex-col gap-1 py-5">
                <p className="font-semibold text-[#102C50]">Q. {faq.q}</p>
                <p className="text-sm text-[#102C50]/70">A. {faq.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 導入相談 */}
      <section id="consult" className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <Card className="border-[#DCE5EF] bg-white">
          <CardContent className="flex flex-col gap-5 py-8">
            <div className="flex items-start gap-3">
              <MessagesSquare className="mt-0.5 h-6 w-6 shrink-0 text-[#0068C8]" />
              <div>
                <h2 className="text-lg font-semibold text-[#102C50]">自社の運用に合うか、15分で相談</h2>
                <p className="mt-1 text-sm text-[#102C50]/70">
                  現在のPDF・Excel運用、次回開催までの準備、開催規模に応じた料金をご相談いただけます。
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col items-start gap-2">
              {demoConfig.bookingUrl && demoConfig.bookingEmbedEnabled ? (
                <TimeRexBooking bookingUrl={demoConfig.bookingUrl} />
              ) : demoConfig.bookingUrl ? (
                <TrackedLink href={demoConfig.bookingUrl} event="booking_open_click" external>
                  <Button className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90">空き日時を確認する</Button>
                </TrackedLink>
              ) : (
                <TrackedLink href={`mailto:${demoConfig.contactEmail}`} event="booking_open_click">
                  <Button className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90">メールで相談する</Button>
                </TrackedLink>
              )}
              <span className="text-xs text-[#102C50]/60">{demoConfig.contactEmail}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 最終CTA */}
      <section className="mx-auto w-full max-w-[1200px] px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">まずは、次の開催で使うイメージを。</h2>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <TrackedLink href={demoConfig.demoAppPath} event="demo_start_click" eventProps={{ cta_location: "final" }}>
            <Button size="lg" className="bg-[#0068C8] text-white hover:bg-[#0068C8]/90">
              登録不要でデモを試す
            </Button>
          </TrackedLink>
          <a href="#consult" className="text-sm text-[#0068C8] underline-offset-4 hover:underline">
            導入相談を予約する
          </a>
          <a href="#docs" className="text-sm text-[#0068C8] underline-offset-4 hover:underline">
            資料を見る
          </a>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[#102C50]/50">
          <CheckCircle2 className="h-3.5 w-3.5" />
          登録不要・実際のメール送信や課金は発生しません
        </div>
      </section>

      <footer className="border-t border-[#DCE5EF] py-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 text-xs text-[#102C50]/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>運営：株式会社BlackishGear</span>
          <div className="flex gap-4">
            <span>お問い合わせ：{demoConfig.contactEmail}</span>
            <a href="/legal/tokushoho" className="underline-offset-4 hover:underline">
              特定商取引法に基づく表記
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
