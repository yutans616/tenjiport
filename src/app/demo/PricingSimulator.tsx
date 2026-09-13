"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demoConfig } from "./config";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function clampPositiveInt(raw: string, fallback: number): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function PricingSimulator() {
  const [companies, setCompanies] = useState(30);
  const [events, setEvents] = useState(1);

  const { perEventTotal, grandTotal, showAnnualComparison } = useMemo(() => {
    const overCount = Math.max(0, companies - demoConfig.standardIncludedCompanies);
    const perEvent = demoConfig.standardFeeYen + overCount * demoConfig.overageFeeYenPerCompany;
    return {
      perEventTotal: perEvent,
      grandTotal: perEvent * events,
      showAnnualComparison:
        demoConfig.annualPriceApproved &&
        events <= demoConfig.annualEventCap &&
        companies <= demoConfig.annualParticipantCapPerEvent,
    };
  }, [companies, events]);

  return (
    <Card className="border-[#DCE5EF]">
      <CardHeader>
        <CardTitle className="text-base">料金シミュレーター</CardTitle>
        <p className="text-sm text-muted-foreground">
          各開催の出展者数が同じ場合の概算です。実請求額を確定するものではありません。
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-companies">1開催あたりの出展者数</Label>
            <Input
              id="sim-companies"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={companies}
              onChange={(e) => setCompanies(clampPositiveInt(e.target.value, 0))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-events">年間の開催数</Label>
            <Input
              id="sim-events"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={events}
              onChange={(e) => setEvents(clampPositiveInt(e.target.value, 1))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg bg-[#F5F8FC] p-4">
          <span className="text-sm text-muted-foreground">1開催あたりの目安（{demoConfig.taxLabel}）</span>
          <span className="text-2xl font-semibold text-[#102C50]">{yen(perEventTotal)}</span>
          <span className="text-sm text-muted-foreground">
            {events}開催合計の目安：{yen(grandTotal)}
          </span>
        </div>

        {showAnnualComparison ? (
          <div className="flex flex-col gap-1 rounded-lg border border-[#DCE5EF] p-4">
            <span className="text-sm text-muted-foreground">
              年間プラン（6開催・1開催300社まで）との比較目安
            </span>
            <span className="text-lg font-semibold text-[#102C50]">
              {yen(demoConfig.annualPriceYen)} / 年（{demoConfig.taxLabel}）
            </span>
            <span className="text-xs text-muted-foreground">
              年間7開催以上、1開催301社以上をご利用の場合は個別見積もりとなります。
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            年間7開催以上、または1開催301社以上をご利用の場合は個別見積もりとなります。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
