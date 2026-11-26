"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import {
  CopyButton,
  ErrorState,
  MethodBadge,
  PageHeader,
  PlanBadge,
  StatusBadge,
} from "@/components/admin/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiClientError,
  getBillingStatus,
  getCheckoutInfo,
  submitManualPayment,
} from "@/lib/api";
import { usePublicPlans } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { BillingPaymentItem, PaymentMethod } from "@/types/plans";

const STEPS = ["Plan", "Payment method", "Pay", "Confirm"] as const;

export function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const publicPlansQuery = usePublicPlans();
  const purchasablePlans = React.useMemo(
    () =>
      (publicPlansQuery.data?.plans || []).filter(
        (p) => p.is_purchasable ?? (!p.is_system && (p.monthly_price_usd ?? 0) > 0)
      ),
    [publicPlansQuery.data]
  );

  const rawPlan = (searchParams.get("plan") || "pro").toLowerCase();
  const planId = React.useMemo(() => {
    if (purchasablePlans.length === 0) return rawPlan;
    if (purchasablePlans.some((p) => p.id === rawPlan)) return rawPlan;
    return purchasablePlans[0].id;
  }, [purchasablePlans, rawPlan]);

  const selectedPlanObj = React.useMemo(
    () => purchasablePlans.find((p) => p.id === planId) || null,
    [purchasablePlans, planId]
  );

  const annualDiscountPct = Math.round((publicPlansQuery.data?.annual_discount ?? 0.05) * 100);
  const rawInterval = (searchParams.get("interval") || "monthly").toLowerCase();
  const [interval, setInterval] = React.useState<"monthly" | "annual">(
    rawInterval === "annual" ? "annual" : "monthly"
  );
  const [method, setMethod] = React.useState<PaymentMethod>("easypaisa");
  const [transactionId, setTransactionId] = React.useState("");
  const [inlineError, setInlineError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<{
    message: string;
    isPriceChanged?: boolean;
  } | null>(null);
  const [submittedPayment, setSubmittedPayment] = React.useState<BillingPaymentItem | null>(null);
  const [mobileSummaryOpen, setMobileSummaryOpen] = React.useState(false);

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
    enabled: publicPlansQuery.isSuccess || publicPlansQuery.isError,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submitManualPayment({
        plan_id: planId,
        billing_interval: interval,
        method: method as "easypaisa" | "jazzcash",
        transaction_id: transactionId,
        expected_amount_usd_cents: checkoutQuery.data?.amount_usd_cents,
      }),
    onSuccess: (data) => {
      setFormError(null);
      setInlineError(null);
      setSubmittedPayment(data);
      qc.invalidateQueries({ queryKey: ["billing-status"] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        if (err.status === 409 && err.code === "price_changed") {
          setFormError({
            message: err.message,
            isPriceChanged: true,
          });
          qc.invalidateQueries({ queryKey: ["public", "plans"] });
          checkoutQuery.refetch();
          return;
        }
        setFormError({ message: err.message });
      } else {
        setFormError({
          message: "Could not submit your payment right now. Please try again.",
        });
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
    setInlineError(null);
    setFormError(null);
    const trimmed = transactionId.trim();
    if (trimmed.length < 6 || trimmed.length > 30 || !/^[a-zA-Z0-9]+$/.test(trimmed)) {
      setInlineError("Transaction ID must be 6 to 30 letters and numbers (no spaces or symbols).");
      return;
    }
    submitMutation.mutate();
  };

  const activePending = submittedPayment || statusQuery.data?.pending_payment || null;
  const activeStep = activePending ? 3 : transactionId.trim().length >= 6 ? 2 : 1;

  if (statusQuery.isLoading || checkoutQuery.isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Checkout"
          description="Complete your plan upgrade with Easypaisa or JazzCash."
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <Skeleton className="h-36 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <Skeleton className="lg:col-span-5 h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (checkoutQuery.isError || !checkoutQuery.data) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Checkout"
          description="Complete your plan upgrade with Easypaisa or JazzCash."
        />
        <ErrorState
          title="Could not load checkout details"
          message="We could not load live pricing right now. Please try again."
          onRetry={() => checkoutQuery.refetch()}
        />
      </div>
    );
  }

  const info = checkoutQuery.data;
  const annualSavingUsd =
    interval === "annual" &&
      selectedPlanObj?.monthly_price_usd &&
      selectedPlanObj?.annual_price_usd
      ? Math.max(0, selectedPlanObj.monthly_price_usd * 12 - selectedPlanObj.annual_price_usd)
      : null;

  const orderSummaryContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlanBadge planId={info.plan_id} planName={info.plan_name} />
          <Badge variant="outline" className="capitalize text-[11px]">
            {info.billing_interval}
          </Badge>
        </div>
        <span className="text-sm font-medium tabular-nums">${info.amount_usd.toFixed(2)}</span>
      </div>

      {annualSavingUsd !== null && annualSavingUsd > 0 && (
        <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
          <span>Annual discount ({annualDiscountPct}% off)</span>
          <span className="font-medium tabular-nums">-${annualSavingUsd.toFixed(2)}</span>
        </div>
      )}

      <div className="border-t border-border pt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Total in USD</span>
          <span className="tabular-nums font-medium text-foreground">
            ${info.amount_usd.toFixed(2)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-foreground">Total in PKR</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            Rs {info.amount_pkr.toLocaleString()}
          </span>
        </div>
      </div>

      {selectedPlanObj && (
        <div className="border-t border-border pt-3 space-y-2 text-xs">
          <p className="font-medium text-foreground">Included with {info.plan_name}</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {selectedPlanObj.limits.scheduled_posts === null
                ? "Unlimited scheduled posts"
                : `${selectedPlanObj.limits.scheduled_posts} scheduled posts / month`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {selectedPlanObj.limits.playground_runs === null
                ? "Unlimited Playground runs"
                : `${selectedPlanObj.limits.playground_runs} Playground runs / month`}
            </span>
          </div>
          {selectedPlanObj.features.approval_slack && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Slack + email approval workflow</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Analytics: {selectedPlanObj.features.analytics_level}</span>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
        <ShieldCheck className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <span>
          Payments are checked manually by our team. You will receive an email confirmation as soon
          as your payment is reviewed.
        </span>
      </div>
    </div>
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Checkout"
        description="Complete your plan upgrade with Easypaisa or JazzCash."
      />

      {/* Stepper */}
      <nav aria-label="Checkout progress" className="rounded-lg border border-border bg-card px-4 py-3">
        <ol className="grid grid-cols-4 gap-2 text-xs">
          {STEPS.map((label, idx) => {
            const done = idx < activeStep;
            const current = idx === activeStep;
            return (
              <li key={label} className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums border",
                    done
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : current
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-muted border-border text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : idx + 1}
                </span>
                <span
                  className={cn(
                    "truncate font-medium",
                    current || done ? "text-foreground" : "text-muted-foreground hidden sm:inline"
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {activePending ? (
        <Card className="max-w-xl mx-auto rounded-lg border-border bg-card shadow-xs motion-safe:animate-in motion-safe:fade-in-0 duration-200">
          <CardHeader className="text-center pb-4 border-b border-border/70 space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="flex justify-center">
              <StatusBadge kind="payment" value="pending" labelOverride="Under review" />
            </div>
            <CardTitle className="text-lg font-semibold">Payment submitted</CardTitle>
            <CardDescription className="text-xs">
              We have received your transaction details. Your billing page and email will update as
              soon as verification finishes.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-5 space-y-5 text-sm">
            <div className="rounded-md border border-border divide-y divide-border text-xs">
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-muted-foreground">Plan</span>
                <div className="flex items-center gap-1.5">
                  <PlanBadge planId={activePending.plan_id} planName={activePending.plan_name} />
                  <span className="capitalize text-muted-foreground">
                    ({activePending.billing_interval})
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold tabular-nums">
                  Rs {activePending.amount_pkr.toLocaleString()} ($
                  {activePending.amount_usd.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-muted-foreground">Method</span>
                <MethodBadge method={activePending.method} />
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-muted-foreground">Transaction ID</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-medium">{activePending.transaction_id}</span>
                  <CopyButton
                    value={activePending.transaction_id}
                    label="Copy transaction ID"
                    toastLabel="Transaction ID copied"
                    className="size-6"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">What happens next</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Our team checks the transaction ID against the received payment.</li>
                <li>Once approved, your new plan limits activate immediately.</li>
                <li>We send a confirmation receipt to your account email.</li>
              </ol>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild className="flex-1">
                <Link href="/app/billing">Go to Billing</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/app">Back to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Mobile Collapsible Order Summary */}
          <Card className="lg:hidden rounded-lg border-border bg-card shadow-xs">
            <button
              type="button"
              aria-expanded={mobileSummaryOpen}
              onClick={() => setMobileSummaryOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Order summary</div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>{info.plan_name}</span>
                  <span className="text-muted-foreground font-normal capitalize">
                    ({info.billing_interval})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold tabular-nums">
                  Rs {info.amount_pkr.toLocaleString()}
                </span>
                {mobileSummaryOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </div>
            </button>
            {mobileSummaryOpen && (
              <CardContent className="pt-0 pb-4 border-t border-border/70 mt-1">
                <div className="pt-3">{orderSummaryContent}</div>
              </CardContent>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left column (60% -> 7/12) */}
            <div className="lg:col-span-7 space-y-5">
              {formError && (
                <Alert
                  variant={formError.isPriceChanged ? "default" : "destructive"}
                  className={
                    formError.isPriceChanged
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200"
                      : undefined
                  }
                >
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-sm font-semibold">
                    {formError.isPriceChanged ? "Plan price updated" : "Could not submit payment"}
                  </AlertTitle>
                  <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span>
                      {formError.message}{" "}
                      {formError.isPriceChanged &&
                        `Latest price: $${info.amount_usd.toFixed(2)} (Rs ${info.amount_pkr.toLocaleString()}).`}
                    </span>
                    {formError.isPriceChanged && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormError(null)}
                      >
                        Confirm new price
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Step 1: Selected plan + billing cycle */}
              <Card className="rounded-lg border-border bg-card shadow-xs">
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">1. Selected plan</CardTitle>
                    <CardDescription>Choose monthly or annual billing</CardDescription>
                  </div>
                  <Link href="/pricing" className="text-xs underline text-muted-foreground hover:text-foreground">
                    Change plan
                  </Link>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3.5 py-2.5">
                    <PlanBadge planId={info.plan_id} planName={info.plan_name} />
                    <span className="text-sm font-semibold tabular-nums">
                      ${info.amount_usd.toFixed(2)} ({interval})
                    </span>
                  </div>

                  <Tabs
                    value={interval}
                    onValueChange={(v) => handleIntervalChange(v as "monthly" | "annual")}
                  >
                    <TabsList className="w-full grid grid-cols-2">
                      <TabsTrigger value="monthly">Monthly</TabsTrigger>
                      <TabsTrigger value="annual" className="gap-1.5">
                        <span>Annual</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 h-5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0"
                        >
                          Save {annualDiscountPct}%
                        </Badge>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Step 2: Selectable Payment Method Cards */}
              <Card className="rounded-lg border-border bg-card shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">2. Payment method</CardTitle>
                  <CardDescription>Select your wallet app to reveal QR instructions.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={method === "easypaisa"}
                      onClick={() => setMethod("easypaisa")}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        method === "easypaisa"
                          ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20"
                          : "border-border bg-card hover:border-border-hover"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          <Wallet className="size-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">Easypaisa</div>
                          <div className="text-xs text-muted-foreground">Mobile wallet QR</div>
                        </div>
                      </div>
                      {method === "easypaisa" && (
                        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={method === "jazzcash"}
                      onClick={() => setMethod("jazzcash")}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        method === "jazzcash"
                          ? "border-orange-500 bg-orange-500/5 ring-2 ring-orange-500/20"
                          : "border-border bg-card hover:border-border-hover"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/15 text-orange-700 dark:text-orange-300">
                          <Smartphone className="size-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">JazzCash</div>
                          <div className="text-xs text-muted-foreground">Mobile wallet QR</div>
                        </div>
                      </div>
                      {method === "jazzcash" && (
                        <span className="flex size-5 items-center justify-center rounded-full bg-orange-600 text-white">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Step 3: Payment Instructions */}
              <Card className="rounded-lg border-border bg-card shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <QrCode className="size-4" />
                    3. Scan &amp; send exact amount
                  </CardTitle>
                  <CardDescription>
                    Send the exact PKR amount shown below using {method === "easypaisa" ? "Easypaisa" : "JazzCash"}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-center rounded-lg border border-border bg-card p-3">
                      <Image
                        src={`/payments/${method}-qr.jpeg`}
                        alt={`${method} QR code`}
                        width={208}
                        height={208}
                        className="w-52 max-w-full h-auto rounded object-contain"
                      />
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="rounded-md border border-border bg-card p-3 space-y-1">
                        <span className="text-[11px] text-muted-foreground block">Exact PKR amount</span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                            Rs {info.amount_pkr.toLocaleString()}
                          </span>
                          <CopyButton
                            value={String(info.amount_pkr)}
                            label="Copy PKR amount"
                            toastLabel="Amount copied"
                          />
                        </div>
                      </div>

                      <div className="rounded-md border border-border bg-card p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[11px] text-muted-foreground block">Account title</span>
                          <span className="font-medium text-foreground truncate block">
                            {info.account_title}
                          </span>
                        </div>
                        <CopyButton
                          value={info.account_title}
                          label="Copy account title"
                          toastLabel="Account title copied"
                        />
                      </div>

                      <div className="rounded-md border border-border bg-card p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[11px] text-muted-foreground block">Account ending in</span>
                          <span className="font-mono font-medium text-foreground">
                            •••• {info.account_last4}
                          </span>
                        </div>
                        <CopyButton
                          value={info.account_last4}
                          label="Copy account digits"
                          toastLabel="Account digits copied"
                        />
                      </div>
                    </div>
                  </div>

                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Open the {method === "easypaisa" ? "Easypaisa" : "JazzCash"} app and scan the QR code.</li>
                    <li>Enter the exact PKR total shown above (Rs {info.amount_pkr.toLocaleString()}).</li>
                    <li>Confirm transfer and copy the transaction ID from your receipt screen.</li>
                    <li>Paste the transaction ID below to submit for verification.</li>
                  </ol>
                </CardContent>
              </Card>

              {/* Step 4: Transaction ID Form */}
              <Card className="rounded-lg border-border bg-card shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">4. Enter transaction ID</CardTitle>
                  <CardDescription>
                    Paste the alphanumeric reference ID shown on your payment receipt.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="tx-id">Transaction ID</Label>
                      <Input
                        id="tx-id"
                        value={transactionId}
                        onChange={(e) => {
                          setTransactionId(e.target.value);
                          if (inlineError) setInlineError(null);
                        }}
                        placeholder="e.g. TX123456789"
                        className="font-mono"
                        disabled={submitMutation.isPending}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        6 to 30 letters and numbers only.
                      </p>
                      {inlineError && (
                        <p className="text-xs text-destructive font-medium">{inlineError}</p>
                      )}
                    </div>

                    <div className="sticky bottom-3 z-10 lg:static">
                      <Button
                        type="submit"
                        className="w-full h-10 shadow-sm lg:shadow-none"
                        disabled={submitMutation.isPending}
                      >
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin mr-2" />
                            Submitting payment...
                          </>
                        ) : (
                          "I have paid"
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Right column (40% -> 5/12 Sticky Order Summary) */}
            <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-20 space-y-4">
              <Card className="rounded-lg border-border bg-card shadow-xs">
                <CardHeader className="pb-3 border-b border-border/70">
                  <CardTitle className="text-base font-semibold">Order summary</CardTitle>
                  <CardDescription>Server-verified checkout total</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">{orderSummaryContent}</CardContent>
              </Card>

              <Card className="rounded-lg border-border bg-card opacity-65">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="size-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs font-medium text-foreground">Card payments</div>
                      <div className="text-[11px] text-muted-foreground">Debit &amp; credit cards</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    Coming soon
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
