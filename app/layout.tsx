import "./globals.css";
import { Inter } from "next/font/google";
import Providers from "@/components/Provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "NotebookLM",
  description: "Document chat with RAG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-gray-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
