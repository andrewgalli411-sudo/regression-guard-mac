import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CABBAGE OS — Fleet profit engine",
  description:
    "Per-vehicle profit and loss for multi-car rideshare fleets. Know which car is making money and which one is quietly eating it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base antialiased">
        <div className="flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
