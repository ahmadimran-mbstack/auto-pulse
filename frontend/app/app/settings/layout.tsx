import * as React from "react";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] w-full flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="my-auto mx-auto w-full max-w-3xl min-w-0">
        {children}
      </div>
    </div>
  );
}
