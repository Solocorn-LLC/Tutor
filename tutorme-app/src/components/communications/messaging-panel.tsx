import { MessageSquare, Users, UserPlus, Heart, Settings, Search, Inbox } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
export type CommSection = 'chats' | 'contacts' | 'requests' | 'followers' | 'settings'

interface MessagingPanelProps {
  activeSection: CommSection
  onSectionChange: (section: CommSection) => void
}

const topItems: { id: CommSection; label: string; icon: React.ElementType }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'requests', label: 'Requests', icon: UserPlus },
  { id: 'followers', label: 'Followers', icon: Heart },
]

const emptyStates: Record<CommSection, { icon: React.ElementType; title: string; hint: string }> = {
  chats: {
    icon: MessageSquare,
    title: 'No conversations yet',
    hint: 'Start a chat to see it here',
  },
  contacts: { icon: Users, title: 'No contacts yet', hint: 'Your contacts will appear here' },
  requests: {
    icon: UserPlus,
    title: 'No requests yet',
    hint: 'Connection requests will appear here',
  },
  followers: { icon: Heart, title: 'No followers yet', hint: 'Your followers will appear here' },
  settings: {
    icon: Settings,
    title: 'Settings',
    hint: 'Communication preferences will appear here',
  },
}

export default function MessagingPanel({ activeSection, onSectionChange }: MessagingPanelProps) {
  const list = emptyStates[activeSection]
  const ListIcon = list.icon

  return (
    <Card className="flex h-full w-full flex-col overflow-hidden rounded-b-2xl border border-gray-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
      {/* Full-width Chat header */}
      <div className="relative flex h-12 shrink-0 items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white">
        Chat
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left menu rail - shorter */}
        <div className="flex w-40 flex-col items-center gap-2 border-r border-gray-200 py-2">
          {topItems.map(item => {
            const Icon = item.icon
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  'flex w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors',
                  active
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            )
          })}

          <button
            onClick={() => onSectionChange('settings')}
            className={cn(
              'mt-auto flex w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors',
              activeSection === 'settings'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>
        </div>

        {/* List column */}
        <div className="flex w-full flex-col overflow-hidden border-r border-gray-200 sm:w-72 lg:w-80">
          <div className="border-b border-gray-200 p-4">
            <h2 className="text-lg font-bold capitalize text-slate-800">{activeSection}</h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search"
                className="rounded-full border-slate-200 bg-slate-50/50 pl-9 text-sm"
              />
            </div>
          </div>

          <div className="scrollbar-hide flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <ListIcon className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">{list.title}</p>
            <p className="mt-1 text-xs text-slate-500">{list.hint}</p>
          </div>
        </div>

        {/* Detail / chat area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {/* Chat viewport */}
          <div className="scrollbar-hide flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
            <Inbox className="mb-3 h-16 w-16 text-slate-300" />
            <p className="text-lg font-bold text-slate-700">
              Select a {activeSection === 'settings' ? 'setting' : activeSection.slice(0, -1)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Choose an item from the {activeSection} list to view details
            </p>
          </div>

          {/* Message input */}
          <div className="shrink-0 border-t border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <textarea
                placeholder="Type a message..."
                className="min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={1}
              />
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
