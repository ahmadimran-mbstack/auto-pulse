"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LockedFeatureCardProps {
  title: string;
  description: string;
  requiredPlan: "Starter" | "Pro" | "Business";
}

export function LockedFeatureCard({ title, description, requiredPlan }: LockedFeatureCardProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          <Badge variant="secondary">{requiredPlan}</Badge>
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button asChild size="sm" variant="outline">
          <Link href="/app/billing">Upgrade to {requiredPlan}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
