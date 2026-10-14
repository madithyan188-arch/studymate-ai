import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Shield, Lock, Eye } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy Preview — StudyMate AI',
  description: 'StudyMate AI Privacy Policy frontend preview.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#202337] flex flex-col justify-between selection:bg-[#4f5bd5]/15">
      {/* Navigation Header */}
      <header className="sticky top-0 z-30 flex h-16 md:h-[72px] items-center justify-between border-b border-[#e7e6e1] bg-[#f8f8f6]/95 px-4 sm:px-6 md:px-10 backdrop-blur shrink-0">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group">
          <div className="flex size-8 sm:size-9 items-center justify-center rounded-xl bg-[#4f5bd5] text-white shadow-sm transition group-hover:scale-105">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-sm md:text-base leading-tight">
              StudyMate <span className="text-[#4f5bd5]">AI</span>
            </div>
            <div className="text-[10px] uppercase tracking-[.18em] text-[#8d8f9e] hidden sm:block">
              From reading to understanding
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/signup"
            className="flex items-center gap-1.5 rounded-xl border border-[#deded9] bg-white px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-[#4b4e60] shadow-sm transition hover:border-[#bfc3f1] hover:text-[#4f5bd5] shrink-0"
          >
            <ArrowLeft size={14} /> Back to Sign Up
          </Link>
          <Link
            href="/"
            className="hidden sm:inline-flex items-center rounded-xl bg-[#4f5bd5] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#434ec4]"
          >
            Workspace
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 md:py-12">
        <div className="rounded-2xl border border-[#e7e6e1] bg-white p-6 sm:p-9 md:p-10 shadow-[0_4px_20px_rgba(31,35,53,0.04)]">
          {/* Preview Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f9f4] border border-[#b8dfce] px-3 py-1 text-xs font-medium text-[#2e7d56] mb-4">
            <Shield size={13} />
            <span>Privacy Standards &bull; Effective 2026</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202337]">
            Privacy Policy
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-[#777989] leading-relaxed">
            Your learning materials, questions, and notes belong to you. Here is how StudyMate AI protects your data.
          </p>

          <div className="mt-6 rounded-xl border border-[#e7e6e1] bg-[#fbfbfa] p-4 text-xs leading-relaxed text-[#595c6e]">
            <strong>Note for Previewers:</strong> This is a frontend placeholder outlining StudyMate AI&apos;s privacy commitments.
          </div>

          <div className="mt-8 space-y-6 text-sm text-[#3f4254] leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <Lock size={16} className="text-[#4f5bd5]" />
                1. Information We Collect
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                We collect your name, email address, study preferences, and uploaded course materials (PDFs, notes, text snippets) necessary to provide personalized study guides and interactive quizzes.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <Eye size={16} className="text-[#4f5bd5]" />
                2. AI Processing & Model Boundaries
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                Your study materials and questions are used strictly to generate your personal summaries and quiz feedback. Your proprietary documents and course materials are never used to train public foundation models or shared with third parties.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <Shield size={16} className="text-[#4f5bd5]" />
                3. Data Storage & Security
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                All data is encrypted in transit using industry-standard TLS 1.3 and at rest using AES-256 via modern cloud infrastructure (Supabase Auth and storage).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <Sparkles size={16} className="text-[#4f5bd5]" />
                4. Student Rights & Control
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                You have the right to export your study materials and request total deletion of your profile and uploaded files at any time via Account Settings.
              </p>
            </section>
          </div>

          <div className="mt-8 pt-6 border-t border-[#efefec] flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#434ec4] transition"
            >
              Return to Create Account
            </Link>
            <Link
              href="/terms"
              className="text-xs font-semibold text-[#4f5bd5] hover:underline"
            >
              Read Terms of Service &rarr;
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs text-[#9a9ba8] border-t border-[#e7e6e1] bg-white">
        StudyMate AI &copy; 2026 &bull; Designed for focused learning.
      </footer>
    </div>
  )
}
