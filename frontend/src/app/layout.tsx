import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxEaseBD - Smart Business Compliance & Tax Platform for Bangladesh",
  description: "Bilingual (English & Bengali) digital platform for business registration, NBR tax calculation, RJSC form pre-filling, Mushak 6.3 & 9.1 ledgers, and compliance calendar alerts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
