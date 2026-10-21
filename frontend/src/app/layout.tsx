import type { Metadata } from "next";
import type { ReactNode } from "react";

// @ts-expect-error Next.js processes global CSS imports.
import "./globals.css";

export const metadata: Metadata = {
  title: "Storefront | Order Management",
  description: "Manage multi-store orders, menus, and order status in one place.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
