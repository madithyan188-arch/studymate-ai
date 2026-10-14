import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Shield, BookOpen, CheckCircle } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service Preview — StudyMate AI',
  description: 'StudyMate AI Terms of Service frontend preview.',
}

export default function TermsPage() {
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
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f2fd] border border-[#d6daf8] px-3 py-1 text-xs font-medium text-[#4f5bd5] mb-4">
            <Shield size={13} />
            <span>Policy Preview &bull; Effective 2026</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202337]">
            Terms of Service
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-[#777989] leading-relaxed">
            Welcome to StudyMate AI. These Terms govern your access to and use of our intelligent study companion platform.
          </p>

          <div className="mt-6 rounded-xl border border-[#e7e6e1] bg-[#fbfbfa] p-4 text-xs leading-relaxed text-[#595c6e]">
            <strong>Note for Previewers:</strong> This is a frontend placeholder representing the planned terms for the StudyMate AI educational service.
          </div>

          <div className="mt-8 space-y-6 text-sm text-[#3f4254] leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <BookOpen size={16} className="text-[#4f5bd5]" />
                1. Acceptance of Terms
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                By registering for an account or using StudyMate AI, you agree to comply with and be bound by these Terms. If you are using StudyMate AI on behalf of an educational institution, you represent that you have authority to bind that entity.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <CheckCircle size={16} className="text-[#4f5bd5]" />
                2. Educational Purpose & Permitted Use
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                StudyMate AI is designed as a learning aid to help students comprehend textbooks, synthesize lecture slides, generate flashcards, and test recall. It is not intended to replace formal instruction or violate academic integrity policies of your institution.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <Shield size={16} className="text-[#4f5bd5]" />
                3. User Content & Study Materials
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                You retain ownership of all lecture notes, PDFs, syllabus files, and documents you upload to StudyMate AI. You grant StudyMate AI a limited license solely to process and analyze your materials to generate study guides, summaries, and quiz questions for your account.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-[#202337] flex items-center gap-2">
                <Sparkles size={16} className="text-[#4f5bd5]" />
                4. Account Security & Responsibilities
              </h2>
              <p className="text-xs sm:text-sm text-[#5d6074]">
                You are responsible for maintaining the confidentiality of your login credentials and for all activities occurring under your account. Notify us immediately if you suspect unauthorized access.
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
              href="/privacy"
              className="text-xs font-semibold text-[#4f5bd5] hover:underline"
            >
              Read Privacy Policy &rarr;
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
