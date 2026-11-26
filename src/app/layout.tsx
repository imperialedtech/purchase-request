import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Purchase Requests · Imperial EdTech", template: "%s · IPRAMS" },
  description: "Internal Purchase Request & Approval Management System",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f1e3d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
