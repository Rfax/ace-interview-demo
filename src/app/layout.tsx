import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'AceInterview - Your AI Powered Interview Coach',
  description: 'Generate interview questions, record your answers, and get AI-powered feedback to ace your next interview.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} font-sans antialiased flex flex-col h-full`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
