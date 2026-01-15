import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "LOE Validator - SOW vs LOE Validation",
  description:
    "Validate Statement of Work scope against Level of Effort estimates with AI-powered analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="glass sticky top-0 z-50 border-b border-brand-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                    style={{ 
                      background: "linear-gradient(to bottom right, #ef7b59, #e35a34)",
                      boxShadow: "0 10px 15px -3px rgba(239, 123, 89, 0.2)"
                    }}
                  >
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-terasky-800">
                      LOE Validator
                    </h1>
                    <p className="text-xs text-terasky-500">
                      SOW vs LOE Validation
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="120"
                    height="20"
                    viewBox="0 0 180.057 29.183"
                    className="opacity-90"
                  >
                    <g transform="translate(-756.565 -633.858)">
                      <path
                        d="M767.3,654.034H756.565v-4.02H782.72v4.02H771.987v19.933H767.3V654.034Z"
                        transform="translate(0 -11.476)"
                        fill="#ef7b59"
                        fillRule="evenodd"
                      />
                      <path
                        d="M850.653,650.015H872.28v4.02H855.363V659.6h14.562v4.02H855.363v6.326h17.315v4.02H850.653V650.015Z"
                        transform="translate(-66.832 -11.476)"
                        fill="#ef7b59"
                        fillRule="evenodd"
                      />
                      <path
                        d="M1126.566,655.1c-.755-2.158-2.692-4.017-8.373-4.017-3.152,0-6.337.8-6.337,3.021,0,1.029.591,2.125,5.352,2.722l5.648.863c5.352.83,8.5,2.922,8.5,6.971,0,5.71-5.385,7.834-11.755,7.834-10.245,0-12.74-5.112-13.3-6.938l4.5-1.427c.854,1.759,2.627,4.316,8.931,4.316,3.809,0,6.961-1.262,6.961-3.353,0-1.56-1.773-2.59-5.188-3.021l-5.714-.8c-5.517-.763-8.6-3.187-8.6-6.872,0-7.237,9.293-7.237,11.132-7.237,10.277,0,12.051,4.813,12.642,6.473l-4.4,1.461Z"
                        transform="translate(-248.426 -9.451)"
                        fill="#2d2d3f"
                        fillRule="evenodd"
                      />
                      <path
                        d="M1198.495,650.015h4.7v11.169l13.337-11.169h6.685l-11.484,9.489,12.642,14.464h-6.156l-9.9-11.7-5.13,4.25v7.446h-4.7V650.015Z"
                        transform="translate(-313.908 -11.476)"
                        fill="#2d2d3f"
                        fillRule="evenodd"
                      />
                      <path
                        d="M1292.043,664.38l-11.816-14.365h5.791l8.388,10.148,8.354-10.148h5.825L1296.77,664.38v9.588h-4.727V664.38Z"
                        transform="translate(-371.963 -11.476)"
                        fill="#2d2d3f"
                        fillRule="evenodd"
                      />
                      <path
                        d="M1077.487,690.169l-4.444-6.277V672.824l12.114,17.345"
                        transform="translate(-224.798 -27.678)"
                        fill="#ef7b59"
                        fillRule="evenodd"
                      />
                      <path
                        d="M936.078,649.1v-6.794H945.1c3.819,0,5.761.563,5.761,3.38,0,2.85-1.942,3.414-5.761,3.414Zm24.133,13.388,7.44-10.7,4.807-6.827v-11.1l-9.976,14.35-8.165,11.765-5.433-7.291a6.8,6.8,0,0,0,6.683-7.092c0-5.9-4.082-7.191-9.745-7.191H931.436v24.093h4.675v-9.478h7.408l6.947,9.478"
                        transform="translate(-124.213 0)"
                        fill="#ef7b59"
                        fillRule="evenodd"
                      />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="py-6 text-center text-sm text-terasky-400 border-t border-terasky-100">
            <p>LOE Validator &copy; 2026 TeraSky</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
