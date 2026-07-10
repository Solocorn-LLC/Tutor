'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PitchDeckPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-50 to-slate-100 py-8">
      <div className="w-full max-w-5xl px-4">
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-800">Solocorn Pitch Deck</h1>

        {/* PDF Viewer - centred with border, hidden scrollbar */}
        <div className="relative mx-auto max-w-4xl">
          <div className="scrollbar-hide h-[85vh] overflow-y-auto rounded-xl border-2 border-slate-300 shadow-2xl">
            <iframe
              src="/documents/solocorn-pitch-deck.pdf#toolbar=0&navpanes=0&scrollbar=0"
              className="block h-[3000px] w-full border-0"
              title="Solocorn Pitch Deck"
            />
          </div>
        </div>

        {/* Download button below PDF */}
        <div className="mt-8 flex justify-center">
          <a href="/documents/solocorn-pitch-deck.pdf" download="solocorn-pitch-deck.pdf">
            <Button variant="default" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Download Pitch Deck
            </Button>
          </a>
        </div>
      </div>
    </div>
  )
}
