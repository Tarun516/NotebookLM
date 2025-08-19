import "./globals.css";
import { Inter } from "next/font/google";
import Providers from "@/components/Provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "NotebookLM",
  description: "AI-powered notebook with sources and chat",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-[#2A2A2A] text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
