import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter', // This defines the CSS variable name
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
    <html lang="en" className={`${inter.variable} h-full`}> {/* Apply inter.variable to html tag */}
      {/* Body uses font-sans, which will be configured in tailwind.config.ts to use --font-inter */}
      <body className="font-sans antialiased flex flex-col h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
