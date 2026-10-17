import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  MessageSquare,
  Sparkles,
  Bot,
  Folder,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
  ArrowUp,
  Square,
  Code2,
  UserRound,
  Settings,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Check,
  Copy,
  Sun,
  Moon,
  Pencil,
  Pin,
  Trash2,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react'
import './App.css'


function TrishulMark({ size = 23, strokeWidth = 1.8 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 29V9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M16 16C11.5 16 8.2 12.8 8.2 7.4C12.8 8.4 15.1 11.3 16 16Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16C20.5 16 23.8 12.8 23.8 7.4C19.2 8.4 16.9 11.3 16 16Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9C12.8 7 12.4 4.6 16 2C19.6 4.6 19.2 7 16 9Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 29H20.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}

const API_URL = 'http://127.0.0.1:8000/api/chat/stream'
const SIDEBAR_STORAGE_KEY = 'siva-ai-nav-expanded'
const THEME_STORAGE_KEY = 'siva-ai-theme'

const createChat = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'New chat',
  messages: [],
  updatedAt: Date.now(),
})

const NAV_ITEMS = [
  { label: 'Prompts', Icon: Sparkles },
  { label: 'Agents', Icon: Bot },
  { label: 'Files', Icon: Folder },
  { label: 'Teams', Icon: Users },
]

function getSavedSidebarState() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

function App() {
  const [chats, setChats] = useState(() => [createChat()])
  const [activeChatId, setActiveChatId] = useState(null)
  const [message, setMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isNavExpanded, setIsNavExpanded] = useState(getSavedSidebarState)
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [socialOpen, setSocialOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarTooltip, setSidebarTooltip] = useState(null)
  const [activeView, setActiveView] = useState('chat')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameChatId, setRenameChatId] = useState(null)
  const [deleteChatId, setDeleteChatId] = useState(null)
  const [openChatMenuId, setOpenChatMenuId] = useState(null)
  const [chatMenuPosition, setChatMenuPosition] = useState({ top: 0, right: 12 })

  const textareaRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const abortControllerRef = useRef(null)
  const requestInProgressRef = useRef(false)
  const shouldAutoScrollRef = useRef(true)
  const activeChatIdRef = useRef(null)
  const toastTimerRef = useRef(null)
  const sidebarRef = useRef(null)
  const socialPopoverRef = useRef(null)
  const accountPopoverRef = useRef(null)

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const messages = activeChat?.messages ?? []

  useEffect(() => {
    function closeMenusOnOutsideClick(event) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        setSocialOpen(false)
        setAccountOpen(false)
      }
      if (!event.target.closest?.('.chat-history-wrap')) {
        setOpenChatMenuId(null)
      }
    }
    document.addEventListener('pointerdown', closeMenusOnOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', closeMenusOnOutsideClick)
    }
  }, [])

  useEffect(() => {
    if (!activeChat) return
    if (activeChatId !== activeChat.id) {
      setActiveChatId(activeChat.id)
      activeChatIdRef.current = activeChat.id
    }
  }, [activeChat, activeChatId])

  // Close the small menus when the user clicks elsewhere.
  useEffect(() => {
    function closePopovers(event) {
      if (!event.target.closest('.sidebar-bottom')) {
        setSocialOpen(false)
        setAccountOpen(false)
      }
    }
    document.addEventListener('pointerdown', closePopovers)
    return () => document.removeEventListener('pointerdown', closePopovers)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.dataset.theme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Theme still works for this session if storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isNavExpanded))
    } catch {
      // Keep the UI usable if localStorage is unavailable.
    }
  }, [isNavExpanded])

  useEffect(() => {
    textareaRef.current?.focus()
    return () => {
      abortControllerRef.current?.abort()
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  const showComingSoon = useCallback((section) => {
    setToast(`${section} — Coming Soon`)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2500)
    setSocialOpen(false)
    setAccountOpen(false)
  }, [])

  const updateChatMessages = useCallback((chatId, updater) => {
    setChats((previousChats) =>
      previousChats.map((chat) => {
        if (chat.id !== chatId) return chat
        const nextMessages =
          typeof updater === 'function' ? updater(chat.messages) : updater
        return { ...chat, messages: nextMessages, updatedAt: Date.now() }
      }),
    )
  }, [])

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    const frame = window.requestAnimationFrame(() => scrollToBottom('auto'))
    return () => window.cancelAnimationFrame(frame)
  }, [messages, scrollToBottom])

  function handleMessagesScroll() {
    const container = messagesContainerRef.current
    if (!container) return
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distance < 100
  }

  async function copyText(text, successMessage = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text)
      setToast(successMessage)
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = window.setTimeout(() => setToast(''), 1800)
    } catch (error) {
      console.error('Clipboard copy failed:', error)
      showComingSoon('Copy unavailable — allow clipboard access')
    }
  }

  function openRenameDialog(chat = activeChat) {
    if (!chat) return
    setRenameChatId(chat.id)
    setRenameDraft(chat.title)
    setRenameOpen(true)
  }

  function saveChatRename(event) {
    event?.preventDefault()
    if (!renameChatId || !renameDraft.trim()) return
    setChats((previous) => previous.map((chat) =>
      chat.id === renameChatId
        ? { ...chat, title: renameDraft.trim(), updatedAt: Date.now() }
        : chat,
    ))
    setRenameOpen(false)
    setRenameChatId(null)
  }

  function togglePinnedChat(chatId) {
    setChats((previous) => previous.map((chat) =>
      chat.id === chatId ? { ...chat, pinned: !chat.pinned, updatedAt: Date.now() } : chat,
    ))
    setToast(chats.find((chat) => chat.id === chatId)?.pinned ? 'Chat unpinned' : 'Chat pinned')
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 1800)
  }

  function deleteChat(chatId) {
    const remaining = chats.filter((chat) => chat.id !== chatId)
    const nextChats = remaining.length ? remaining : [createChat()]
    setChats(nextChats)
    if (activeChatIdRef.current === chatId) {
      const nextChat = nextChats[0]
      setActiveChatId(nextChat.id)
      activeChatIdRef.current = nextChat.id
      setMessage('')
      setActiveView('chat')
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      requestInProgressRef.current = false
      setIsStreaming(false)
    }
    setDeleteChatId(null)
    setToast('Chat deleted')
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 1800)
  }

  function toggleNav() {
    setIsNavExpanded((previous) => !previous)
    setSocialOpen(false)
    setAccountOpen(false)
  }

  function handleNewChat() {
    setActiveView('chat')
    setRenameOpen(false)
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    requestInProgressRef.current = false
    setIsStreaming(false)
    setMessage('')

    const chat = createChat()
    setChats((previous) => [chat, ...previous])
    setActiveChatId(chat.id)
    activeChatIdRef.current = chat.id
    shouldAutoScrollRef.current = true
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function handleSelectChat(chatId) {
    setActiveView('chat')
    setRenameOpen(false)
    if (activeChatIdRef.current !== chatId) {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      requestInProgressRef.current = false
      setIsStreaming(false)
    }

    setMessage('')
    setActiveChatId(chatId)
    activeChatIdRef.current = chatId
    shouldAutoScrollRef.current = true

    window.requestAnimationFrame(() => {
      scrollToBottom('auto')
      textareaRef.current?.focus()
    })
  }

  async function sendMessage(textOverride) {
    setActiveView('chat')
    const userMessage = (
      typeof textOverride === 'string' ? textOverride : message
    ).trim()
    const chatId = activeChatIdRef.current ?? activeChat?.id

    if (!userMessage || requestInProgressRef.current || !chatId) return

    requestInProgressRef.current = true
    const controller = new AbortController()
    abortControllerRef.current = controller

    setMessage('')
    setIsStreaming(true)
    shouldAutoScrollRef.current = true

    if (textareaRef.current) textareaRef.current.style.height = '55px'

    updateChatMessages(chatId, (previous) => [
      ...previous,
      { sender: 'user', text: userMessage },
      { sender: 'ai', text: '' },
    ])

    setChats((previous) =>
      previous.map((chat) =>
        chat.id === chatId && chat.title === 'New chat'
          ? {
              ...chat,
              title:
                userMessage.length > 36
                  ? `${userMessage.slice(0, 36)}…`
                  : userMessage,
              updatedAt: Date.now(),
            }
          : chat,
      ),
    )

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const details = await response.text().catch(() => '')
        if (response.status === 429) {
          throw new Error(
            'API quota or rate limit reached. Check your provider quota and try again later.',
          )
        }
        throw new Error(
          `Request failed (${response.status}): ${details || response.statusText}`,
        )
      }

      if (!response.body) {
        throw new Error('The server did not return a streaming response.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let currentText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        currentText += decoder.decode(value, { stream: true })

        updateChatMessages(chatId, (previous) => {
          const next = [...previous]
          const lastIndex = next.length - 1
          if (lastIndex >= 0 && next[lastIndex].sender === 'ai') {
            next[lastIndex] = { ...next[lastIndex], text: currentText }
          }
          return next
        })
      }

      currentText += decoder.decode()
      updateChatMessages(chatId, (previous) => {
        const next = [...previous]
        const lastIndex = next.length - 1
        if (lastIndex >= 0 && next[lastIndex].sender === 'ai') {
          next[lastIndex] = { ...next[lastIndex], text: currentText }
        }
        return next
      })
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Chat request failed:', error)
        updateChatMessages(chatId, (previous) => {
          const next = [...previous]
          const lastIndex = next.length - 1
          if (lastIndex >= 0 && next[lastIndex].sender === 'ai') {
            next[lastIndex] = {
              ...next[lastIndex],
              text: `**Unable to get a response.**\n\n${error.message}`,
            }
          }
          return next
        })
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
        requestInProgressRef.current = false
        setIsStreaming(false)
      }
      window.requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort()
  }

  function handleChange(event) {
    const textarea = event.target
    setMessage(textarea.value)
    textarea.style.height = '55px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!isStreaming) sendMessage()
    }
  }

  const filteredChats = chats
    .filter((chat) => chat.messages.length > 0)
    .filter((chat) => chat.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)

  const showSidebarTooltip = (event, label) => {
    if (isNavExpanded || !label) return
    const rect = event.currentTarget.getBoundingClientRect()
    setSidebarTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 })
  }

  return (
    <div className={`app ${isNavExpanded ? 'sidebar-open' : 'sidebar-closed'} ${socialOpen ? 'social-popover-open' : ''} ${accountOpen ? 'account-popover-open' : ''}`}>
      <aside className="app-sidebar glass" aria-label="Siva AI sidebar" ref={sidebarRef}>
        <button
          type="button"
          className={`brand-header brand-toggle ${isNavExpanded ? 'expanded' : 'collapsed'}`}
          onClick={toggleNav}
          data-tooltip={isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onMouseEnter={(event) => showSidebarTooltip(event, isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
          onMouseLeave={() => setSidebarTooltip(null)}
          onFocus={(event) => showSidebarTooltip(event, isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
          onBlur={() => setSidebarTooltip(null)}
        >
          <span className="brand-logo" aria-label="Siva AI trishul logo">
            <TrishulMark size={25} strokeWidth={2} />
          </span>
          {isNavExpanded && (
            <>
              <span className="brand-copy">
                <span className="brand-name">Siva AI</span>
                <span className="brand-caption">Your AI workspace</span>
              </span>
              <PanelLeftClose className="brand-collapse-icon" size={17} />
            </>
          )}
        </button>

        <div className="sidebar-scroll-area">
          <div className="sidebar-top">
            <button type="button" className={`sidebar-new-chat ${activeView === 'chat' ? 'active' : ''}`} onClick={handleNewChat} data-tooltip="New chat" onMouseEnter={(event) => showSidebarTooltip(event, 'New chat')} onMouseLeave={() => setSidebarTooltip(null)} onFocus={(event) => showSidebarTooltip(event, 'New chat')} onBlur={() => setSidebarTooltip(null)}>
              <Plus size={18} />
              {isNavExpanded && <span>New chat</span>}
            </button>

            <div className="nav-menu" aria-label="Workspace">
              {NAV_ITEMS.map(({ label, Icon }) => (
                <button
                  type="button"
                  key={label}
                  className={`nav-rail-item ${label === 'Prompts' && activeView === 'prompts' ? 'active' : ''}`}
                  data-tooltip={label}
                  aria-label={label}
                  onMouseEnter={(event) => showSidebarTooltip(event, label)}
                  onMouseLeave={() => setSidebarTooltip(null)}
                  onFocus={(event) => showSidebarTooltip(event, label)}
                  onBlur={() => setSidebarTooltip(null)}
                  onClick={() => {
                    if (label === 'Prompts') {
                      setActiveView('prompts')
                      setSocialOpen(false)
                      setAccountOpen(false)
                    } else {
                      showComingSoon(label)
                    }
                  }}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  {isNavExpanded && <span className="nav-label">{label}</span>}
                </button>
              ))}
            </div>
          </div>

          <section className="history-section" aria-label="Recent chats">
          {isNavExpanded && (
            <>
              <div className="history-heading">
                <span>Recent chats</span>
                <MessageSquare size={15} />
              </div>
              <div className="history-search">
                <Search size={15} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search chats"
                  aria-label="Search recent chats"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                    <X size={13} />
                  </button>
                )}
              </div>
            </>
          )}

          <div className="history-list">
            {isNavExpanded &&
              (filteredChats.length === 0 ? (
                <p className="empty-history">No matching conversations</p>
              ) : (
                filteredChats.map((chat) => (
                  <div key={chat.id} className={`chat-history-wrap ${chat.id === activeChat?.id ? 'active' : ''} ${chat.pinned ? 'pinned' : ''}`}>
                    <button
                      type="button"
                      className={`chat-history ${chat.id === activeChat?.id ? 'active' : ''}`}
                      onClick={() => handleSelectChat(chat.id)}
                      data-tooltip={chat.title}
                    >
                      {chat.pinned ? <Pin size={14} strokeWidth={1.8} /> : <MessageSquare size={15} strokeWidth={1.7} />}
                      <span>{chat.title}</span>
                    </button>
                    <div className="chat-history-actions">
                      <button
                        type="button"
                        className={`chat-more-button ${openChatMenuId === chat.id ? 'open' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (openChatMenuId === chat.id) {
                            setOpenChatMenuId(null)
                          } else {
                            const rect = event.currentTarget.getBoundingClientRect()
                            const menuHeight = 132
                            const top = rect.bottom + menuHeight + 8 > window.innerHeight
                              ? Math.max(8, rect.top - menuHeight - 6)
                              : rect.bottom + 6
                            setChatMenuPosition({ top, right: Math.max(8, window.innerWidth - rect.right) })
                            setOpenChatMenuId(chat.id)
                          }
                        }}
                        data-tooltip="More options"
                        aria-label={`More options for ${chat.title}`}
                        aria-haspopup="menu"
                        aria-expanded={openChatMenuId === chat.id}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {openChatMenuId === chat.id && (
                        <div className="chat-options-menu" role="menu" aria-label={`Options for ${chat.title}`} style={{ top: chatMenuPosition.top, right: chatMenuPosition.right }}>
                          <button type="button" role="menuitem" onClick={() => { togglePinnedChat(chat.id); setOpenChatMenuId(null) }}>
                            <Pin size={14} /> {chat.pinned ? 'Unpin chat' : 'Pin chat'}
                          </button>
                          <button type="button" role="menuitem" onClick={() => { openRenameDialog(chat); setOpenChatMenuId(null) }}>
                            <Pencil size={14} /> Rename chat
                          </button>
                          <button type="button" role="menuitem" className="delete-option" onClick={() => { setDeleteChatId(chat.id); setOpenChatMenuId(null) }}>
                            <Trash2 size={14} /> Delete chat
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ))}
          </div>
          </section>
        </div>

        <div className="sidebar-bottom">
          <button
            type="button"
            className={`nav-rail-item social-trigger ${socialOpen ? 'active' : ''}`}
            onClick={() => {
              setSocialOpen((value) => !value)
              setAccountOpen(false)
            }}
            aria-expanded={socialOpen}
            data-tooltip={socialOpen ? undefined : "Connect with me"}
          >
            <ExternalLink size={18} />
            {isNavExpanded && <span className="nav-label">Connect with me</span>}
          </button>

          {socialOpen && (
            <div className="nav-popover social-popover" ref={socialPopoverRef}>
              <div className="popover-heading">Find me online</div>
              <a href="https://github.com/sachinydv0002" target="_blank" rel="noreferrer">
                <Code2 size={16} /><span>GitHub</span><ExternalLink size={12} />
              </a>
              <a href="https://www.linkedin.com/in/sachinydv0002/" target="_blank" rel="noreferrer">
                <Users size={16} /><span>LinkedIn</span><ExternalLink size={12} />
              </a>
              <a href="https://leetcode.com/sachinydv0002" target="_blank" rel="noreferrer">
                <Code2 size={16} /><span>LeetCode</span><ExternalLink size={12} />
              </a>
              <a href="https://www.youtube.com/@sachinydv0002-sde" target="_blank" rel="noreferrer">
                <Square size={16} /><span>YouTube</span><ExternalLink size={12} />
              </a>
            </div>
          )}

          <button
            type="button"
            className={`account-trigger ${accountOpen ? 'active' : ''}`}
            onClick={() => {
              setAccountOpen((value) => !value)
              setSocialOpen(false)
            }}
            aria-expanded={accountOpen}
            data-tooltip={accountOpen ? undefined : "Your account"}
          >
            <span className="account-avatar">S</span>
            {isNavExpanded && (
              <>
                <span className="account-copy">
                  <strong>Your account</strong>
                  <small>Personal workspace</small>
                </span>
                {accountOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </>
            )}
          </button>

          {accountOpen && (
            <div className="nav-popover account-popover" ref={accountPopoverRef}>
              <div className="account-popup-header">
                <span className="account-avatar large">S</span>
                <div>
                  <strong>Your account</strong>
                  <small>Siva AI workspace</small>
                </div>
              </div>
              <button type="button" onClick={() => showComingSoon('Profile')}>
                <UserRound size={16} /> Profile
              </button>
              <button type="button" onClick={() => showComingSoon('Settings')}>
                <Settings size={16} /> Settings
              </button>
              <button
                type="button"
                className="theme-toggle-option"
                onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                <span className={`theme-switch ${theme}`} aria-hidden="true"><span /></span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main-workspace">
        <section className="chat-box">
          <div
            className="messages-container"
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
          >
            <div className="messages-content">
            {messages.length === 0 || activeView === 'prompts' ? (
              <div className={`welcome ${activeView === 'prompts' ? 'prompts-welcome' : ''}`}>
                <div className="welcome-brand-mark" aria-hidden="true">
                  <TrishulMark size={25} strokeWidth={1.7} />
                </div>
                <h1>{activeView === 'prompts' ? 'Create with Prompts' : 'Welcome to Siva AI'}</h1>
                <p>{activeView === 'prompts' ? 'Choose a starting point and Siva AI will help you craft a useful prompt.' : 'Your ideas, questions, and code — let’s work on them together.'}</p>
                <div className="prompt-cards">
                  {activeView === 'prompts' ? (
                    <>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Mere liye ek reusable, detailed prompt banao jo kisi topic ko beginner-friendly Hinglish mein samjhaye, examples aur short summary ke saath.')}>
                        <Sparkles size={18} /><span><strong>Learning prompt</strong><small>Explain any topic clearly</small></span>
                      </button>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Mere liye ek reusable prompt likho jo kisi bhi topic ko simple Hinglish mein samjhaye, examples aur end mein short recap de. Topic placeholder bhi include karna.')}>
                        <MessageSquare size={18} /><span><strong>Explanation prompt</strong><small>Kisi bhi topic ko aasaan banao</small></span>
                      </button>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Mere liye ek professional writing prompt banao jo audience, tone, purpose aur length ke hisaab se polished content likhe. Reusable placeholders include karna.')}>
                        <Pencil size={18} /><span><strong>Writing prompt</strong><small>Professional content likhne ke liye</small></span>
                      </button>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Mere liye ek study prompt banao jo kisi topic ko step-by-step sikhaye, examples de, phir 5 practice questions pooche aur mere answers par feedback de.')}>
                        <Bot size={18} /><span><strong>Study prompt</strong><small>Step-by-step seekhne ke liye</small></span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Aaj ki date aur aaj ke din ki important historical events batao.')}>
                        <Sparkles size={18} /><span><strong>Today in focus</strong><small>Aaj ke din ke baare mein jaano</small></span>
                      </button>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Help me debug my code. Pehle mujhse code aur error message maango, phir step-by-step debug karo.')}>
                        <Code2 size={18} /><span><strong>Debug code</strong><small>Find and fix an issue</small></span>
                      </button>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Mujhe React ek beginner ki tarah step-by-step sikhao, simple examples ke saath.')}>
                        <Bot size={18} /><span><strong>Learn something</strong><small>Build a new skill step by step</small></span>
                      </button>
                      <button type="button" className="prompt-card" onClick={() => sendMessage('Mere liye aaj ka ek practical study and coding plan banao, breaks ke saath.')}>
                        <MessageSquare size={18} /><span><strong>Plan my day</strong><small>Make a focused study plan</small></span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((msg, index) => (
                  <div
                    className={`message-row ${msg.sender}`}
                    key={`${activeChat?.id}-${index}`}
                  >
                    <article className={`message ${msg.sender}`}>
                      <div className="message-body">
                        {msg.sender === 'ai' ? (
                          msg.text ? (
                            <ReactMarkdown
                              components={{
                                pre({ children, ...props }) {
                                  const codeText = String(children?.props?.children ?? children ?? '')
                                  return (
                                    <div className="code-block-wrap">
                                      <pre {...props}>{children}</pre>
                                      <button
                                        type="button"
                                        className="code-copy-btn"
                                        onClick={() => copyText(codeText, 'Code copied')}
                                        aria-label="Copy code"
                                        data-tooltip="Copy code"
                                      >
                                        <Copy size={15} />
                                      </button>
                                    </div>
                                  )
                                },
                              }}
                            >
                              {msg.text}
                            </ReactMarkdown>
                          ) : isStreaming && index === messages.length - 1 ? (
                            <span className="typing-indicator" aria-label="Thinking">
                              <span /><span /><span />
                            </span>
                          ) : null
                        ) : (
                          msg.text
                        )}
                      </div>
                    </article>
                    {msg.text && (
                      <div className="message-actions">
                        <button
                          type="button"
                          onClick={() => copyText(msg.text, 'Message copied')}
                          aria-label="Copy message"
                          data-tooltip="Copy message"
                        >
                          <Copy size={15} />
                        </button>
                        {msg.sender === 'user' && !isStreaming && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!activeChat?.id) return
                              setMessage(msg.text)
                              updateChatMessages(activeChat.id, (previous) => previous.slice(0, index))
                              requestAnimationFrame(() => textareaRef.current?.focus())
                            }}
                            aria-label="Edit message"
                            data-tooltip="Edit message"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {msg.sender === 'ai' && index === messages.length - 1 && !isStreaming && (
                          <button
                            type="button"
                            onClick={() => {
                              const lastUserIndex = messages
                                .slice(0, index)
                                .map((item) => item.sender)
                                .lastIndexOf('user')
                              if (lastUserIndex < 0 || !activeChat?.id) return
                              const retryText = messages[lastUserIndex].text
                              updateChatMessages(activeChat.id, (previous) => previous.slice(0, lastUserIndex))
                              sendMessage(retryText)
                            }}
                            aria-label="Try again"
                            data-tooltip="Try again"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          <form
            className="input-area"
            onSubmit={(event) => {
              event.preventDefault()
              sendMessage()
            }}
          >
            <textarea
              ref={textareaRef}
              placeholder="Ask Siva anything..."
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              rows={1}
              aria-label="Message Siva AI"
            />
            {isStreaming ? (
              <button
                type="button"
                className="stop-btn"
                onClick={stopGeneration}
                aria-label="Stop generating"
                data-tooltip="Stop generating"
              >
                <Square size={15} fill="currentColor" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!message.trim()}
                aria-label="Send message"
                data-tooltip="Send message"
              >
                <ArrowUp size={19} />
                <span>Send</span>
              </button>
            )}
          </form>
        </section>
      </main>

      {renameOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameOpen(false) }}>
          <form className="rename-dialog" onSubmit={saveChatRename} role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <div className="rename-dialog-heading">
              <div className="rename-dialog-icon"><Pencil size={18} /></div>
              <div><h2 id="rename-title">Rename conversation</h2><p>Choose a clear name for this chat.</p></div>
              <button type="button" className="rename-close" onClick={() => setRenameOpen(false)} aria-label="Close rename dialog"><X size={17} /></button>
            </div>
            <label className="rename-label" htmlFor="chat-rename-input">Chat name</label>
            <input id="chat-rename-input" autoFocus maxLength={80} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} placeholder="Enter chat name" />
            <div className="rename-dialog-actions"><button type="button" className="rename-cancel" onClick={() => setRenameOpen(false)}>Cancel</button><button type="submit" className="rename-save" disabled={!renameDraft.trim()}>Save changes</button></div>
          </form>
        </div>
      )}

      {deleteChatId && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteChatId(null) }}>
          <div className="rename-dialog delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="rename-dialog-heading">
              <div className="rename-dialog-icon delete-dialog-icon"><Trash2 size={18} /></div>
              <div><h2 id="delete-title">Delete this chat?</h2><p>This conversation will be removed from Recent Chats.</p></div>
              <button type="button" className="rename-close" onClick={() => setDeleteChatId(null)} aria-label="Close delete dialog"><X size={17} /></button>
            </div>
            <div className="rename-dialog-actions">
              <button type="button" className="rename-cancel" onClick={() => setDeleteChatId(null)}>Cancel</button>
              <button type="button" className="delete-confirm" onClick={() => deleteChat(deleteChatId)}>Delete chat</button>
            </div>
          </div>
        </div>
      )}

      {sidebarTooltip && !isNavExpanded && (
        <div className="siva-floating-tooltip" role="tooltip" style={{ top: sidebarTooltip.top, left: sidebarTooltip.left }}>
          {sidebarTooltip.label}
        </div>
      )}

      {toast && (
        <div className="toast-notification" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => {
              if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
              setToast('')
            }}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

export default App
