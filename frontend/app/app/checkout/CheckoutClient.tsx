"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, RotateCcw } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiClientError,
  getBillingStatus,
  getCheckoutInfo,
  submitManualPayment,
} from "@/lib/api";
import type { BillingPaymentItem, PaymentMethod } from "@/types/plans";

const PURCHASABLE_PLANS = new Set(["starter", "pro", "business"]);

export function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const rawPlan = (searchParams.get("plan") || "pro").toLowerCase();
  const planId = PURCHASABLE_PLANS.has(rawPlan) ? rawPlan : "pro";
  const rawInterval = (searchParams.get("interval") || "monthly").toLowerCase();
  const [interval, setInterval] = React.useState<"monthly" | "annual">(
    rawInterval === "annual" ? "annual" : "monthly"
  );
  const [method, setMethod] = React.useState<PaymentMethod>("easypaisa");
  const [transactionId, setTransactionId] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submittedPayment, setSubmittedPayment] = React.useState<BillingPaymentItem | null>(null);

  const statusQuery = useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    staleTime: 0,
  });

  const checkoutQuery = useQuery({
    queryKey: ["checkout-info", planId, interval],
    queryFn: () => getCheckoutInfo(planId, interval),
    retry: false,
    staleTime: 0,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submitManualPayment({
        plan_id: planId,
        billing_interval: interval,
        method,
        transaction_id: transactionId,
      }),
    onSuccess: (data) => {
      setFormError(null);
      setSubmittedPayment(data);
      qc.invalidateQueries({ queryKey: ["billing-status"] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError("Could not submit your payment right now. Please try again.");
      }
    },
  });

  const handleIntervalChange = (next: "monthly" | "annual") => {
    setInterval(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("plan", planId);
    params.set("interval", next);
    router.replace(`/app/checkout?${params.toString()}`, { scroll: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = transactionId.trim();
    if (trimmed.length < 6 || trimmed.length > 30 || !/^[a-zA-Z0-9]+$/.test(trimmed)) {
      setFormError("Transaction ID must be 6 to 30 letters and numbers.");
      return;
    }
    submitMutation.mutate();
  };

  const activePending = submittedPayment || statusQuery.data?.pending_payment || null;

  if (statusQuery.isLoading || checkoutQuery.isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader title="Checkout" description="Complete your plan upgrade with Easypaisa or JazzCash." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="h-72 animate-pulse bg-muted/40" />
          <Card className="h-96 animate-pulse bg-muted/40" />
        </div>
      </div>
    );
  }

  if (checkoutQuery.isError || !checkoutQuery.data) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader title="Checkout" description="Complete your plan upgrade with Easypaisa or JazzCash." />
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load checkout details</AlertTitle>
          <AlertDescription className="mt-2 flex items-center justify-between gap-4">
            <span>We could not load live pricing right now. Please try again.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => checkoutQuery.refetch()}>
              <RotateCcw className="size-3.5 mr-1.5" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const info = checkoutQuery.data;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Checkout"
        description="Complete your plan upgrade with Easypaisa or JazzCash."
      />

      {activePending ? (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary shrink-0" />
              <CardTitle className="text-base">
                Payment submitted. We will activate your plan once it is verified.
              </CardTitle>
            </div>
            <CardDescription>
              Verification usually takes a short time. Your billing page updates automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">
                {activePending.plan_name} ({activePending.billing_interval})
              </span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium tabular-nums">
                Rs {activePending.amount_pkr.toLocaleString()} (${activePending.amount_usd.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Method</span>
              <span className="font-medium capitalize">{activePending.method}</span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-xs">{activePending.transaction_id}</span>
            </div>
            <div className="pt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/app/billing">Go to Billing</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left card: Order summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order summary</CardTitle>
              <CardDescription>{info.plan_name} plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Billing interval</Label>
                <Tabs value={interval} onValueChange={(v) => handleIntervalChange(v as "monthly" | "annual")}>
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="monthly">Monthly</TabsTrigger>
                    <TabsTrigger value="annual">
                      Annual <Badge variant="secondary" className="ml-1.5 text-[10px]">Save 5%</Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Amount in USD</span>
                  <span className="font-medium tabular-nums">${info.amount_usd.toFixed(2)}</span>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Amount to send</p>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums mt-0.5">
                    Rs {info.amount_pkr.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right card: Pay with QR */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pay with QR</CardTitle>
              <CardDescription>Scan with Easypaisa or JazzCash and submit your transaction ID.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Tabs value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="easypaisa">Easypaisa</TabsTrigger>
                  <TabsTrigger value="jazzcash">JazzCash</TabsTrigger>
                </TabsList>
                {(["easypaisa", "jazzcash"] as const).map((m) => (
                  <TabsContent key={m} value={m} className="mt-4 space-y-3">
                    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background p-4">
                      <img
                        src={`/payments/${m}-qr.jpeg`}
                        alt={`${m} QR code`}
                        className="w-[260px] max-w-full rounded-md object-contain"
                      />
                      <div className="mt-3 text-center space-y-0.5">
                        <p className="text-sm font-medium">{info.account_title}</p>
                        <p className="text-xs text-muted-foreground">
                          Account ending in {info.account_last4}
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open the Easypaisa or JazzCash app and scan the QR.</li>
                <li>Send exactly the PKR amount shown.</li>
                <li>Copy the transaction ID from the receipt.</li>
                <li>Paste it below.</li>
              </ol>

              <form onSubmit={handleSubmit} className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-id">Transaction ID</Label>
                  <Input
                    id="tx-id"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g. TX123456789"
                    disabled={submitMutation.isPending}
                  />
                </div>

                {formError && (
                  <p className="text-xs text-destructive font-medium">{formError}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Submitting...
                    </>
                  ) : (
                    "I have paid"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Muted coming soon section */}
      <div className="pt-2 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Payment gateways coming soon</h3>
          <p className="text-xs text-muted-foreground">Card payments will be added later.</p>
        </div>
        <Card className="max-w-sm opacity-60 cursor-not-allowed">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CreditCard className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Card payments</span>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
