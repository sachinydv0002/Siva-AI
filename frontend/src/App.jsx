import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth, useClerk, useUser, SignIn, SignUp } from '@clerk/react'
import {
  MessageSquare,
  Sparkles,
  Bot,
  Brain,
  GraduationCap,
  BriefcaseBusiness,
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
  LogIn,
  LogOut,
  LockKeyhole,
  Settings,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Check,
  Copy,
  Sun,
  Moon,
  Monitor,
  Pencil,
  Pin,
  Trash2,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react'
import './App.css'
import './AccountMenu.css'


function TrishulMark({ size = 23 }) {
  return (
    <span
      className="siva-trishul-emoji"
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden="true"
    >
      🔱
    </span>
  )
}

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api`
const API_URL = `${API_BASE}/chat/stream`


async function historyRequest(path, options = {}, getToken = null) {
  const token = getToken ? await getToken() : null
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`History API failed (${response.status}): ${details}`)
  }
  if (response.status === 204) return null
  return response.json()
}
const SIDEBAR_STORAGE_KEY = 'siva-ai-nav-expanded'
const THEME_STORAGE_KEY = 'siva-ai-theme'
const APP_STATE_STORAGE_KEY = 'siva-ai-workspace-state-v1'
const WORKSPACE_OWNER_STORAGE_KEY = 'siva-ai-workspace-owner-v1'

const createChat = (mode = 'chat') => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'New chat',
  mode: ['beu', 'interview'].includes(mode) ? mode : 'chat',
  messages: [],
  updatedAt: Date.now(),
})

const NAV_ITEMS = [
  { label: 'BEU Mode', Icon: GraduationCap },
  { label: 'Interview Mode', Icon: BriefcaseBusiness },
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

function loadSavedAppState() {
  try {
    const raw = window.sessionStorage.getItem(APP_STATE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.chats)) return null
    const chats = parsed.chats
      .filter((chat) => chat && typeof chat.id === 'string')
      .map((chat) => ({
        ...chat,
        mode: ['beu', 'interview'].includes(chat.mode) ? chat.mode : 'chat',
        messages: Array.isArray(chat.messages) ? chat.messages : [],
        title: typeof chat.title === 'string' ? chat.title : 'New chat',
        updatedAt: Number(chat.updatedAt) || Date.now(),
      }))
    if (!chats.length) chats.push(createChat('chat'))
    const activeChatId = chats.some((chat) => chat.id === parsed.activeChatId)
      ? parsed.activeChatId
      : chats[0].id
    const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0]
    const validViews = ['chat', 'beu', 'interview', 'files', 'teams']
    const savedView = validViews.includes(parsed.activeView)
      ? parsed.activeView
      : activeChat.mode
    const savedMode = ['chat', 'beu', 'interview'].includes(parsed.selectedMode)
      ? parsed.selectedMode
      : (['chat', 'beu', 'interview'].includes(savedView) ? savedView : activeChat.mode)
    const scrollTop = Number(parsed.scrollTop)
    return {
      chats,
      activeChatId,
      activeView: savedView,
      selectedMode: savedMode,
      scrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
    }
  } catch {
    return null
  }
}

function WorkspaceApp() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { signOut, openUserProfile } = useClerk()
  const { user } = useUser()
  const workspaceOwnerKey = isSignedIn && user?.id ? `user:${user.id}` : 'guest'
  const authenticatedHistoryRequest = useCallback(
    (path, options = {}) => historyRequest(path, options, isSignedIn ? getToken : null),
    [getToken, isSignedIn],
  )
  const [initialAppState] = useState(loadSavedAppState)
  const initialSavedChat = initialAppState?.chats?.find(
    (chat) => chat.id === initialAppState?.activeChatId
  )
  const initialPageWasWelcome = Boolean(
    initialSavedChat && (!Array.isArray(initialSavedChat.messages) || initialSavedChat.messages.length === 0)
  )
  const [chats, setChats] = useState(() => initialAppState?.chats ?? [createChat('chat')])
  const [activeChatId, setActiveChatId] = useState(() => initialAppState?.activeChatId ?? initialAppState?.chats?.[0]?.id ?? null)
  const [message, setMessage] = useState('')
  const [editingMessage, setEditingMessage] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isNavExpanded, setIsNavExpanded] = useState(getSavedSidebarState)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false)
  const touchStartRef = useRef(null)
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
      return ['light', 'dark', 'system'].includes(saved) ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
  })
  const effectiveTheme = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme
  const [searchQuery, setSearchQuery] = useState('')
  const [socialOpen, setSocialOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [memoriesOpen, setMemoriesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  const [savedMemories, setSavedMemories] = useState([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarTooltip, setSidebarTooltip] = useState(null)
  const [activeView, setActiveView] = useState(() => initialPageWasWelcome ? 'chat' : (initialAppState?.activeView ?? 'chat'))
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [selectedMode, setSelectedMode] = useState(() => initialPageWasWelcome ? 'chat' : (initialAppState?.selectedMode ?? 'chat'))
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
  const activeChatIdRef = useRef(initialAppState?.activeChatId ?? initialAppState?.chats?.[0]?.id ?? null)
  const chatsRef = useRef(initialAppState?.chats ?? [])

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])
  const toastTimerRef = useRef(null)
  const sidebarRef = useRef(null)
  const socialPopoverRef = useRef(null)
  const accountPopoverRef = useRef(null)
  const modelPickerRef = useRef(null)
  const scrollTopRef = useRef(initialAppState?.scrollTop ?? 0)
  const hasRestoredScrollRef = useRef(false)

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const accountDisplayName = (() => {
    const first = user?.firstName?.trim() || ''
    const last = user?.lastName?.trim() || ''
    const full = [first, last].filter(Boolean).join(' ')
    const metadataName = user?.publicMetadata?.name || user?.unsafeMetadata?.name
    const emailPrefix = user?.primaryEmailAddress?.emailAddress?.split('@')?.[0]?.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    return full || user?.fullName?.trim() || user?.username?.trim() || (typeof metadataName === 'string' ? metadataName.trim() : '') || emailPrefix || 'Siva AI User'
  })()
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
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target)) {
        setModelMenuOpen(false)
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

  // Load server history only for a verified, signed-in Clerk user.
  // Guest conversations remain temporary and are never migrated to an account.
  useEffect(() => {
    let cancelled = false

    if (!isLoaded) return () => { cancelled = true }

    if (!isSignedIn) {
      // A sessionStorage workspace is tab-scoped. Reset it whenever the prior
      // workspace belonged to an account (or has no trusted owner marker), so
      // signing out can never expose that account's chats to guest mode.
      let storedOwner = null
      try {
        storedOwner = window.sessionStorage.getItem(WORKSPACE_OWNER_STORAGE_KEY)
      } catch { /* continue with a fresh guest workspace */ }

      if (storedOwner !== 'guest') {
        const freshChat = createChat('chat')
        setChats([freshChat])
        setActiveChatId(freshChat.id)
        activeChatIdRef.current = freshChat.id
        setActiveView('chat')
        setSelectedMode('chat')
        try {
          window.sessionStorage.setItem(WORKSPACE_OWNER_STORAGE_KEY, 'guest')
        } catch { /* guest chat remains usable in memory */ }
      } else if (!activeChatIdRef.current || !chatsRef.current.some((chat) => chat.id === activeChatIdRef.current)) {
        const freshChat = createChat('chat')
        setChats([freshChat])
        setActiveChatId(freshChat.id)
        activeChatIdRef.current = freshChat.id
        setActiveView('chat')
        setSelectedMode('chat')
      }
      return () => { cancelled = true }
    }

    // Never merge guest/local chats into a signed-in account. A workspace is
    // scoped to the verified Clerk user ID and only that user's server history.
    const accountOwner = `user:${user?.id ?? 'unknown'}`
    let storedOwner = null
    try {
      storedOwner = window.sessionStorage.getItem(WORKSPACE_OWNER_STORAGE_KEY)
      if (storedOwner !== accountOwner) {
        const freshChat = createChat('chat')
        setChats([freshChat])
        setActiveChatId(freshChat.id)
        activeChatIdRef.current = freshChat.id
        setActiveView('chat')
        setSelectedMode('chat')
      }
      window.sessionStorage.setItem(WORKSPACE_OWNER_STORAGE_KEY, accountOwner)
    } catch { /* account history will still load from the server */ }

    async function loadServerHistory() {
      try {
        const result = await authenticatedHistoryRequest('/chats')
        const serverChats = Array.isArray(result?.chats) ? result.chats : []

        const completeChats = await Promise.all(
          serverChats.map(async (chat) => {
            const messageResult = await authenticatedHistoryRequest(
              `/chats/${encodeURIComponent(chat.id)}/messages`
            )
            return {
              ...chat,
              messages: Array.isArray(messageResult?.messages) ? messageResult.messages : [],
              mode: ['beu', 'interview'].includes(chat.mode) ? chat.mode : 'chat',
              updatedAt: Number(chat.updatedAt) || Date.now(),
              title: chat.title || 'New chat',
              pinned: Boolean(chat.pinned),
            }
          })
        )

        if (cancelled) return

        // Keep the workspace on a fresh welcome chat after the app opens or
        // authentication completes. Previous conversations remain available
        // in Recent Chats, but are never opened automatically.
        const welcomeChat = createChat('chat')
        setChats([welcomeChat, ...completeChats])
        setActiveChatId(welcomeChat.id)
        activeChatIdRef.current = welcomeChat.id
        setMessage('')
        setEditingMessage(null)
        setActiveView('chat')
        setSelectedMode('chat')
        scrollTopRef.current = 0
        hasRestoredScrollRef.current = true
      } catch (error) {
        console.error('Could not load MongoDB chat history:', error)
      }
    }

    loadServerHistory()
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, user?.id, authenticatedHistoryRequest])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemPrefersDark(media.matches)
    updateSystemTheme()
    media.addEventListener?.('change', updateSystemTheme)
    return () => media.removeEventListener?.('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
    document.body.dataset.theme = effectiveTheme
    document.documentElement.dataset.themePreference = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Theme still works for this session if storage is unavailable.
    }
  }, [theme, effectiveTheme])

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

  // Track the real mobile keyboard/visual viewport so welcome content stays visible.
  useEffect(() => {
    const root = document.querySelector('.app')
    const viewport = window.visualViewport
    const baselineHeight = { value: window.innerHeight }
    const updateKeyboardState = () => {
      const isMobile = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches
      const focusedComposer = document.activeElement === textareaRef.current
      const reducedViewport = viewport ? (baselineHeight.value - viewport.height) > 140 : false
      const open = isMobile && focusedComposer && reducedViewport
      setMobileKeyboardOpen(open)
      if (root && viewport) root.style.setProperty('--mobile-viewport-height', `${Math.round(viewport.height)}px`)
      if (!focusedComposer && root) root.style.removeProperty('--mobile-viewport-height')
    }
    const onFocusIn = (event) => { if (event.target === textareaRef.current) updateKeyboardState() }
    const onFocusOut = () => window.setTimeout(updateKeyboardState, 80)
    viewport?.addEventListener('resize', updateKeyboardState)
    window.addEventListener('resize', updateKeyboardState)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    updateKeyboardState()
    return () => {
      viewport?.removeEventListener('resize', updateKeyboardState)
      window.removeEventListener('resize', updateKeyboardState)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (root) root.style.removeProperty('--mobile-viewport-height')
    }
  }, [])

  // Route ordinary typing to the composer even when focus is elsewhere on the page.
  useEffect(() => {
    function focusComposerForTyping(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      const editable = target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      if (editable || target?.closest?.('button, a, [role="menu"], [role="dialog"]')) return
      if (event.key === 'Tab' || event.key === 'Escape' || event.key.startsWith('Arrow') || event.key === 'Shift') return
      if (event.key === 'Backspace') {
        event.preventDefault()
        textareaRef.current?.focus()
        setMessage((current) => current.slice(0, -1))
      } else if (event.key.length === 1) {
        event.preventDefault()
        textareaRef.current?.focus()
        setMessage((current) => current + event.key)
      }
    }
    document.addEventListener('keydown', focusComposerForTyping)
    return () => document.removeEventListener('keydown', focusComposerForTyping)
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
    const frame = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (!container) return
      if (!hasRestoredScrollRef.current) {
        if (initialAppState) {
          container.scrollTop = Math.min(scrollTopRef.current, Math.max(0, container.scrollHeight - container.clientHeight))
        } else {
          scrollToBottom('auto')
        }
        hasRestoredScrollRef.current = true
      } else {
        scrollToBottom('auto')
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, scrollToBottom, initialAppState])

  useEffect(() => {
    const saveWorkspace = () => {
      if (!isLoaded) return
      try {
        // sessionStorage is isolated per tab: refresh restores this tab, a new
        // tab starts with a fresh welcome chat. Server history remains in MongoDB.
        window.sessionStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
          chats,
          activeChatId,
          activeView,
          selectedMode,
          scrollTop: scrollTopRef.current,
        }))
      } catch {
        // Keep the app usable if browser storage is unavailable or full.
      }
    }
    saveWorkspace()
    window.addEventListener('pagehide', saveWorkspace)
    return () => window.removeEventListener('pagehide', saveWorkspace)
  }, [chats, activeChatId, activeView, selectedMode, isLoaded, isSignedIn])

  function handleMessagesScroll() {
    const container = messagesContainerRef.current
    if (!container) return
    scrollTopRef.current = container.scrollTop
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distance < 100
  }

  async function openSavedMemories() {
    setAccountOpen(false)
    if (!isSignedIn) {
      setToast('Log in to access saved memories')
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = window.setTimeout(() => setToast(''), 2500)
      return
    }
    setMemoriesOpen(true)
    setMemoriesLoading(true)
    try {
      const result = await authenticatedHistoryRequest('/memories')
      setSavedMemories(Array.isArray(result?.memories) ? result.memories : [])
    } catch (error) {
      console.error('Could not load saved memories:', error)
      setToast('Could not load saved memories')
    } finally {
      setMemoriesLoading(false)
    }
  }

  async function deleteSavedMemory(memoryId) {
    try {
      await authenticatedHistoryRequest(`/memories/${encodeURIComponent(memoryId)}`, {
        method: 'DELETE',
      })
      setSavedMemories((previous) => previous.filter((memory) => memory.id !== memoryId))
      setToast('Memory deleted')
    } catch (error) {
      console.error('Could not delete saved memory:', error)
      setToast('Could not delete memory')
    }
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
    if (!isSignedIn || !renameChatId || !renameDraft.trim()) return
    setChats((previous) => previous.map((chat) =>
      chat.id === renameChatId
        ? { ...chat, title: renameDraft.trim(), updatedAt: Date.now() }
        : chat,
    ))
    setRenameOpen(false)
    setRenameChatId(null)
    authenticatedHistoryRequest(`/chats/${encodeURIComponent(renameChatId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: renameDraft.trim() }),
    }).catch((error) => console.error('Could not save chat title:', error))
  }

  function togglePinnedChat(chatId) {
    if (!isSignedIn) return
    const nextPinned = !Boolean(chats.find((chat) => chat.id === chatId)?.pinned)
    setChats((previous) => previous.map((chat) =>
      chat.id === chatId ? { ...chat, pinned: nextPinned, updatedAt: Date.now() } : chat,
    ))
    authenticatedHistoryRequest(`/chats/${encodeURIComponent(chatId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: nextPinned }),
    }).catch((error) => console.error('Could not save pinned state:', error))
    setToast(nextPinned ? 'Chat pinned' : 'Chat unpinned')
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 1800)
  }

  function deleteChat(chatId) {
    if (!isSignedIn) return
    authenticatedHistoryRequest(`/chats/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    }).catch((error) => console.error('Could not delete server chat:', error))
    const remaining = chats.filter((chat) => chat.id !== chatId)
    const nextChats = remaining.length ? remaining : [createChat()]
    setChats(nextChats)
    if (activeChatIdRef.current === chatId) {
      const nextChat = nextChats[0]
      setActiveChatId(nextChat.id)
      activeChatIdRef.current = nextChat.id
      setMessage('')
      setActiveView(nextChat.mode ?? 'chat')
      setSelectedMode(nextChat.mode ?? 'chat')
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

  const handleSignOut = useCallback(async () => {
    setAccountOpen(false)
    try {
      await signOut({ redirectUrl: '/' })
    } catch (error) {
      console.error('Unable to sign out:', error)
      setToast('Could not sign out. Please try again.')
    }
  }, [signOut])

  function openSettings() {
    setDisplayNameDraft(accountDisplayName === 'Siva AI User' ? '' : accountDisplayName)
    setAccountOpen(false)
    setSettingsOpen(true)
  }

  async function saveDisplayName(event) {
    event.preventDefault()
    const cleanName = displayNameDraft.trim().replace(/\s+/g, ' ')
    if (!cleanName) {
      setToast('Please enter a display name')
      return
    }
    if (!user?.update) {
      setToast('Name editing is unavailable. Use Manage account instead.')
      return
    }
    setSavingDisplayName(true)
    try {
      const parts = cleanName.split(' ')
      await user.update({ firstName: parts[0], lastName: parts.slice(1).join('') ? parts.slice(1).join(' ') : '' })
      setToast('Display name updated')
    } catch (error) {
      console.error('Could not update display name:', error)
      setToast('Could not update name. Try Manage account.')
    } finally {
      setSavingDisplayName(false)
    }
  }

  function toggleNav() {
    setIsNavExpanded((previous) => !previous)
    setSocialOpen(false)
    setAccountOpen(false)
  }

  function handleModeChange(nextMode) {
    // Change the mode on the current conversation; do not create a new chat.
    setActiveView(nextMode)
    setSelectedMode(nextMode)
    if (activeChatId) {
      setChats((previous) => previous.map((chat) =>
        chat.id === activeChatId ? { ...chat, mode: nextMode, updatedAt: Date.now() } : chat,
      ))
    }
  }

  function handleNewChat(nextView = 'chat') {
    setActiveView(nextView)
    setSelectedMode(nextView)
    setRenameOpen(false)
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    requestInProgressRef.current = false
    setIsStreaming(false)
    setMessage('')
    setEditingMessage(null)

    const chat = createChat(nextView)
    setChats((previous) => [chat, ...previous])
    setActiveChatId(chat.id)
    activeChatIdRef.current = chat.id
    scrollTopRef.current = 0
    hasRestoredScrollRef.current = true
    shouldAutoScrollRef.current = true
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function handleSelectChat(chatId) {
    const selectedChat = chats.find((chat) => chat.id === chatId)
    const nextMode = selectedChat?.mode ?? 'chat'
    setActiveView(nextMode)
    setSelectedMode(nextMode)
    setRenameOpen(false)
    if (activeChatIdRef.current !== chatId) {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      requestInProgressRef.current = false
      setIsStreaming(false)
    }

    setMessage('')
    setEditingMessage(null)
    setActiveChatId(chatId)
    activeChatIdRef.current = chatId
    scrollTopRef.current = 0
    hasRestoredScrollRef.current = true
    shouldAutoScrollRef.current = true

    window.requestAnimationFrame(() => {
      scrollToBottom('auto')
      textareaRef.current?.focus()
    })
  }

  async function sendMessage(textOverride) {
    const userMessage = (
      typeof textOverride === 'string' ? textOverride : message
    ).trim()
    const chatId = activeChatIdRef.current ?? activeChat?.id

    if (!userMessage || requestInProgressRef.current || !chatId) return

    // Guests keep conversation context only in this tab's sessionStorage-backed
    // workspace. Send only the messages from the currently selected chat; the
    // backend never persists guest messages or accepts this history for accounts.
    const guestHistory = !isSignedIn
      ? (chatsRef.current.find((chat) => chat.id === chatId)?.messages ?? [])
        .filter((item) => (item.sender === 'user' || item.sender === 'ai') && typeof item.text === 'string' && item.text.trim())
        .slice(-20)
        .map((item) => ({ sender: item.sender, text: item.text.slice(0, 100000) }))
      : undefined

    requestInProgressRef.current = true
    const controller = new AbortController()
    abortControllerRef.current = controller

    setMessage('')
    setIsStreaming(true)
    shouldAutoScrollRef.current = true

    if (textareaRef.current) textareaRef.current.style.height = '26px'

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
      const token = isSignedIn ? await getToken() : null
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          chat_id: chatId,
          mode: chatsRef.current.find((chat) => chat.id === chatId)?.mode ?? 'chat',
          ...(!isSignedIn ? { guest_history: guestHistory ?? [] } : {}),
        }),
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

  function cancelMessageEdit() {
    setEditingMessage(null)
  }

  function submitEditedMessage(event) {
    event?.preventDefault()
    if (!editingMessage || isStreaming) return
    const text = editingMessage.draft?.trim()
    if (!text) return
    const { chatId, index } = editingMessage
    updateChatMessages(chatId, (previous) => previous.slice(0, index))
    setEditingMessage(null)
    setMessage('')
    sendMessage(text)
  }

  function submitComposer(event) {
    event?.preventDefault()
    const text = message.trim()
    if (!text || isStreaming) return
    sendMessage(text)
  }

  function stopGeneration() {
    abortControllerRef.current?.abort()
  }

  function handleChange(event) {
    const textarea = event.target
    setMessage(textarea.value)
    textarea.style.height = '26px'
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
    <div
      className={`app ${isNavExpanded ? 'sidebar-open' : 'sidebar-closed'} ${mobileNavOpen ? 'mobile-nav-visible' : ''} ${mobileKeyboardOpen ? 'mobile-keyboard-open' : ''} ${socialOpen ? 'social-popover-open' : ''} ${accountOpen ? 'account-popover-open' : ''}`}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY, atTop: messagesContainerRef.current?.scrollTop <= 0 }
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current
        const touch = event.changedTouches[0]
        if (!start || !touch) return
        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y
        const isMobile = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches
        if (isMobile && start.x <= 24 && dx > 70 && Math.abs(dy) < 70 && !mobileNavOpen) {
          setMobileNavOpen(true)
          setSocialOpen(false)
          setAccountOpen(false)
        } else if (isMobile && mobileNavOpen && dx < -70 && Math.abs(dy) < 70) {
          setMobileNavOpen(false)
          setSocialOpen(false)
          setAccountOpen(false)
        } else if (isMobile && start.atTop && dy > 110 && Math.abs(dx) < 60 && !mobileNavOpen && !mobileKeyboardOpen) {
          window.location.reload()
        }
        touchStartRef.current = null
      }}
    >
      <aside className="app-sidebar glass" aria-label="Siva AI sidebar" ref={sidebarRef}>
        <button
          type="button"
          className={`brand-header brand-toggle ${isNavExpanded ? 'expanded' : 'collapsed'}`}
          onClick={() => {
            if (mobileNavOpen) {
              setMobileNavOpen(false)
              setSocialOpen(false)
              setAccountOpen(false)
              return
            }
            toggleNav()
          }}
          data-tooltip={mobileNavOpen ? 'Close navigation' : isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onMouseEnter={(event) => showSidebarTooltip(event, isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
          onMouseLeave={() => setSidebarTooltip(null)}
          onFocus={(event) => showSidebarTooltip(event, isNavExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
          onBlur={() => setSidebarTooltip(null)}
        >
          {isNavExpanded ? (
            <>
              <span className="brand-logo" aria-label="Siva AI trishul logo">
                <TrishulMark size={25} strokeWidth={2} />
              </span>
              <span className="brand-copy">
                <span className="brand-name">Siva AI</span>
                <span className="brand-caption">Your AI workspace</span>
              </span>
              <PanelLeftClose className="brand-collapse-icon" size={17} />
            </>
          ) : (
            <PanelLeftOpen className="brand-expand-icon" size={20} aria-hidden="true" />
          )}
        </button>

        <div className="sidebar-scroll-area">
          <div className="sidebar-top">
            <button type="button" className={`sidebar-new-chat ${activeView === 'chat' ? 'active' : ''}`} onClick={() => { handleNewChat('chat'); setMobileNavOpen(false) }} data-tooltip="New chat" onMouseEnter={(event) => showSidebarTooltip(event, 'New chat')} onMouseLeave={() => setSidebarTooltip(null)} onFocus={(event) => showSidebarTooltip(event, 'New chat')} onBlur={() => setSidebarTooltip(null)}>
              <Plus size={18} />
              {(isNavExpanded || mobileNavOpen) && <span>New chat</span>}
            </button>

            <div className="nav-menu" aria-label="Workspace">
              {NAV_ITEMS.map(({ label, Icon }) => (
                <button
                  type="button"
                  key={label}
                  className={`nav-rail-item ${(label === 'BEU Mode' && activeView === 'beu') ||
                      (label === 'Interview Mode' && activeView === 'interview')
                      ? 'active'
                      : ''
                    }`}
                  data-tooltip={label}
                  aria-label={label}
                  onMouseEnter={(event) => showSidebarTooltip(event, label)}
                  onMouseLeave={() => setSidebarTooltip(null)}
                  onFocus={(event) => showSidebarTooltip(event, label)}
                  onBlur={() => setSidebarTooltip(null)}
                  onClick={() => {
                    if (label === 'BEU Mode' || label === 'Interview Mode') {
                      // Every mode gets its own fresh chat; never continue the previous conversation.
                      handleNewChat(label === 'BEU Mode' ? 'beu' : 'interview')
                      setMobileNavOpen(false)
                      setSocialOpen(false)
                      setAccountOpen(false)
                      setSidebarTooltip(null)
                    } else {
                      showComingSoon(label)
                    }
                  }}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  {(isNavExpanded || mobileNavOpen) && <span className="nav-label">{label}</span>}
                </button>
              ))}
            </div>
          </div>

          <section className="history-section" aria-label="Recent chats">
            {(isNavExpanded || mobileNavOpen) && (
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
              {(isNavExpanded || mobileNavOpen) && (!isLoaded || !isSignedIn) ? (
                <div className="history-auth-prompt">
                  <p>{isLoaded
                    ? 'Sign in to save and revisit your chats.'
                    : 'Sign in to save and revisit your chats.'}</p>
                  <a href="/sign-in" className="history-auth-button">Log in</a>
                  <a href="/sign-up" className="history-auth-button secondary">Sign up</a>
                </div>
              ) : (isNavExpanded || mobileNavOpen) && (
                filteredChats.length === 0 ? (
                  <p className="empty-history">No matching conversations</p>
                ) : (
                  filteredChats.map((chat) => (
                    <div key={chat.id} className={`chat-history-wrap ${chat.id === activeChat?.id ? 'active' : ''} ${chat.pinned ? 'pinned' : ''}`}>
                      <button
                        type="button"
                        className={`chat-history ${chat.id === activeChat?.id ? 'active' : ''}`}
                        onClick={() => { handleSelectChat(chat.id); setMobileNavOpen(false) }}
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
              // Clear any already-visible floating tooltip before opening the menu.
              setSidebarTooltip(null)
              setSocialOpen((value) => !value)
              setAccountOpen(false)
            }}
            aria-expanded={socialOpen}
            data-tooltip="Connect with me"
            onMouseEnter={(event) => {
              if (!isNavExpanded && !socialOpen) showSidebarTooltip(event, 'Connect with me')
            }}
            onMouseLeave={() => setSidebarTooltip(null)}
            onFocus={(event) => {
              if (!isNavExpanded && !socialOpen) showSidebarTooltip(event, 'Connect with me')
            }}
            onBlur={() => setSidebarTooltip(null)}
          >
            <ExternalLink size={18} />
            {(isNavExpanded || mobileNavOpen) && <span className="nav-label">Connect with me</span>}
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
            aria-label={isSignedIn ? 'Open account menu' : 'Open sign in menu'}
            data-tooltip={accountOpen ? undefined : (isSignedIn ? 'Your account' : 'Sign in')}
          >
            {isSignedIn && user?.imageUrl ? (
              <img className="account-avatar account-avatar-image" src={user.imageUrl} alt="" />
            ) : (
              <span className="account-avatar">{isSignedIn ? (accountDisplayName?.charAt(0)?.toUpperCase() || 'S') : <UserRound size={17} />}</span>
            )}
            {(isNavExpanded || mobileNavOpen) && (
              <>
                <span className="account-copy">
                  <strong>{isLoaded && isSignedIn ? accountDisplayName : 'Your account'}</strong>
                  <small>{!isLoaded ? 'Checking account…' : isSignedIn ? (user?.primaryEmailAddress?.emailAddress || 'Signed in') : 'Guest · Not signed in'}</small>
                </span>
                {accountOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </>
            )}
          </button>

          {accountOpen && (
            <div className="nav-popover account-popover" ref={accountPopoverRef}>
              <div className="account-popup-header">
                {isSignedIn && user?.imageUrl ? (
                  <img className="account-avatar large account-avatar-image" src={user.imageUrl} alt="" />
                ) : (
                  <span className="account-avatar large">{isSignedIn ? (accountDisplayName?.charAt(0)?.toUpperCase() || 'S') : <UserRound size={20} />}</span>
                )}
                <div className="account-popup-identity">
                  <strong>{!isLoaded ? 'Loading account…' : isSignedIn ? accountDisplayName : 'You’re using Siva AI'}</strong>
                  <small>{isSignedIn ? (user?.primaryEmailAddress?.emailAddress || 'Signed in with Clerk') : 'Sign in to sync your chats'}</small>
                </div>
              </div>

              {!isLoaded ? (
                <div className="account-menu-status">Checking your session…</div>
              ) : isSignedIn ? (
                <>
                  <button type="button" onClick={() => { setAccountOpen(false); openUserProfile() }}>
                    <UserRound size={16} /> Manage account
                  </button>
                  <button type="button" onClick={openSavedMemories}>
                    <Brain size={16} /> Saved memory
                  </button>
                  <button type="button" onClick={openSettings}>
                    <Settings size={16} /> Settings
                  </button>
                  <button
                    type="button"
                    className="account-signout-option"
                    onClick={handleSignOut}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="account-feature-locked" disabled title="Sign in to use this feature">
                    <UserRound size={16} /> Manage account <LockKeyhole size={14} />
                  </button>
                  <button type="button" className="account-feature-locked" disabled title="Sign in to use this feature">
                    <Brain size={16} /> Saved memory <LockKeyhole size={14} />
                  </button>
                  <button type="button" className="account-feature-locked" disabled title="Sign in to use this feature">
                    <Settings size={16} /> Settings <LockKeyhole size={14} />
                  </button>
                  <div className="account-guest-auth-actions">
                    <a href="/sign-in" className="account-auth-option" onClick={() => setAccountOpen(false)}>
                      <LogIn size={16} /> Sign in
                    </a>
                    <a href="/sign-up" className="account-auth-option secondary" onClick={() => setAccountOpen(false)}>
                      <UserRound size={16} /> Create account
                    </a>
                  </div>
                </>
              )}

              <button
                type="button"
                className="theme-toggle-option"
                onClick={() => setTheme((current) => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system')}
              >
                {theme === 'system' ? <Monitor size={16} /> : theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                {theme === 'system' ? 'System theme' : theme === 'dark' ? 'Light theme' : 'Dark theme'}
                <span className={`theme-switch ${theme}`} aria-hidden="true"><span /></span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main-workspace">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          <PanelLeftOpen size={20} />
        </button>
        {mobileNavOpen && (
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <section className="chat-box">
          <div
            className="messages-container"
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
          >
            <div className="messages-content">
              {messages.length === 0 ? (
                <div
                  className={`welcome ${activeView === 'beu'
                      ? 'beu-welcome'
                      : activeView === 'interview'
                        ? 'interview-welcome'
                        : ''
                    }`}
                >
                  <div className="welcome-brand-mark" aria-hidden="true">
                    <TrishulMark size={25} strokeWidth={1.7} />
                  </div>
                  <h1>
                    {activeView === 'beu'
                      ? 'BEU Study Mode'
                      : activeView === 'interview'
                        ? 'Interview Mode'
                        : 'Welcome to Siva AI'}
                  </h1>
                  <p>
                    {activeView === 'beu'
                      ? 'A dedicated study space for Bihar Engineering University syllabi, subjects, previous-year questions, and exam preparation.'
                      : activeView === 'interview'
                        ? 'Prepare for technical and HR interviews with structured practice, clear explanations, and actionable feedback.'
                        : 'Your ideas, questions, and code — let’s work on them together.'}
                  </p>
                  <div className="prompt-cards">
                    {activeView === 'beu' ? (
                      <>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Explain Bihar Engineering University (BEU), including its overview, academic system, semester structure, examination process, grading, and useful official student resources. Clearly flag any information that needs current verification, and ask me for my course and branch.')}>
                          <GraduationCap size={18} /><span><strong>Learn about BEU</strong><small>University, semesters, and exams</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me understand and organize my BEU syllabus. First ask for my course, branch, semester, and subject. Then list the syllabus unit by unit with learning outcomes and priorities. Do not present a syllabus as verified unless an official document is available.')}>
                          <MessageSquare size={18} /><span><strong>Syllabus and unit-wise topics</strong><small>Based on branch, semester, and subject</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me prepare for my BEU exams. First ask for my branch, semester, subjects, and exam date. Then create a realistic daily timetable with unit-wise targets, revision sessions, and mock tests.')}>
                          <Pencil size={18} /><span><strong>Exam preparation plan</strong><small>Timetable, revision, and priority topics</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me prepare using BEU previous-year questions (PYQs). First ask for my branch, semester, subject, and available exam years or papers. Organize questions by topic and identify recurring themes. If actual papers are unavailable, clearly label generated questions as practice questions, not real PYQs.')}>
                          <Bot size={18} /><span><strong>Previous-year question practice</strong><small>Past papers and topic-wise practice</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me practise writing marks-oriented answers for BEU exams. Ask for the subject, unit, marks (2, 5, 10, or 15), and question. Then structure the answer with a definition, headings, suggested diagrams, examples, and a conclusion.')}>
                          <Pencil size={18} /><span><strong>Answer-writing practice</strong><small>Answers for 2, 5, 10, or 15 marks</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me revise key concepts for BEU, subject by subject. First ask for my branch, semester, and subject, then provide unit-wise quick notes, key formulas and definitions, and a short recap. Do not guarantee that any topic will appear on an exam.')}>
                          <Sparkles size={18} /><span><strong>Quick notes and revision</strong><small>Definitions, formulas, and concise notes</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Test me on a BEU subject. First ask for my branch, semester, subject, and unit. Then ask multiple-choice, short-answer, and long-answer questions one at a time. After each response, explain the answer and track my score and weak areas.')}>
                          <Code2 size={18} /><span><strong>Practice test</strong><small>Quiz, score, and weak-area analysis</small></span>
                        </button>
                      </>
                    ) : activeView === 'interview' ? (
                      <>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Act as a technical interviewer for a CSE candidate. Ask my target role, experience level, and preferred topics, then conduct a realistic mock interview one question at a time. Give feedback after each answer.')}>
                          <BriefcaseBusiness size={18} /><span><strong>Mock interview</strong><small>Realistic interview practice</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me prepare for a DSA interview. Ask my target company or difficulty level, then give one problem at a time. Let me attempt it before revealing hints or a solution; review time and space complexity.')}>
                          <Code2 size={18} /><span><strong>DSA practice</strong><small>Problems, hints and complexity</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Conduct an HR interview practice session. Ask one common HR question at a time, let me answer, then critique clarity, structure, relevance, and authenticity and help me improve it.')}>
                          <Users size={18} /><span><strong>HR questions</strong><small>Build clear, authentic answers</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me prepare my project explanation for interviews. Ask me about the project, tech stack, my contribution, architecture, challenges, and outcomes, then help craft a concise and technically credible explanation.')}>
                          <MessageSquare size={18} /><span><strong>Explain my project</strong><small>Present your work confidently</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me prepare a strong self-introduction for a fresher software engineering interview. Ask about my education, skills, projects, and goals, then help me make a natural 60-90 second answer.')}>
                          <UserRound size={18} /><span><strong>Self introduction</strong><small>Build a clear fresher intro</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Quiz me on core computer science interview topics such as DBMS, operating systems, computer networks, and OOP. Ask which topic and difficulty I prefer, then ask one question at a time and explain my mistakes.')}>
                          <Bot size={18} /><span><strong>Core CS questions</strong><small>DBMS, OS, CN and OOP</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Review my resume for a fresher software developer role. Ask me to paste the resume and target job description, then suggest specific improvements without inventing experience or skills.')}>
                          <Folder size={18} /><span><strong>Resume review</strong><small>Improve resume for the role</small></span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="prompt-card" onClick={() => sendMessage("Tell me today's date and important historical events associated with this day.")}>
                          <Sparkles size={18} /><span><strong>Today in focus</strong><small>Learn about this day</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me debug my code. First ask me to share the code and error message, then troubleshoot it step by step.')}>
                          <Code2 size={18} /><span><strong>Debug code</strong><small>Find and fix an issue</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Teach me React step by step as a beginner, using simple examples.')}>
                          <Bot size={18} /><span><strong>Learn something</strong><small>Build a new skill step by step</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Create a practical study and coding plan for today, including breaks.')}>
                          <MessageSquare size={18} /><span><strong>Plan my day</strong><small>Make a focused study plan</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Explain a difficult topic in simple English with a small example, then ask me one question to check my understanding.')}>
                          <GraduationCap size={18} /><span><strong>Explain a topic</strong><small>Simple explanation with example</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me write, improve, or debug a Python program. First ask what I want the program to do, then explain the solution step by step.')}>
                          <Code2 size={18} /><span><strong>Python help</strong><small>Write, understand or debug code</small></span>
                        </button>
                        <button type="button" className="prompt-card" onClick={() => sendMessage('Help me prepare for an upcoming exam. Ask for my subject, exam date, syllabus progress, and daily available study time, then create a practical revision plan.')}>
                          <GraduationCap size={18} /><span><strong>Exam study plan</strong><small>Prepare with focused revision</small></span>
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
                          {editingMessage?.chatId === activeChat?.id && editingMessage?.index === index ? (
                            <form className="inline-message-editor" onSubmit={submitEditedMessage}>
                              <textarea
                                autoFocus
                                value={editingMessage.draft ?? editingMessage.originalText}
                                onChange={(event) => setEditingMessage((current) => current ? { ...current, draft: event.target.value } : current)}
                                aria-label="Edit original message"
                                rows={Math.min(8, Math.max(1, (editingMessage.draft ?? editingMessage.originalText).split('\n').length))}
                                onFocus={(event) => {
                                  const end = event.currentTarget.value.length
                                  event.currentTarget.setSelectionRange(end, end)
                                }}
                              />
                              <div className="inline-message-edit-actions">
                                <button type="button" className="inline-edit-cancel" onClick={cancelMessageEdit}>Cancel</button>
                                <button type="submit" className="inline-edit-save" disabled={!(editingMessage.draft ?? editingMessage.originalText).trim()}>send</button>
                              </div>
                            </form>
                          ) : msg.sender === 'ai' ? (
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
                      {msg.text && !(editingMessage?.chatId === activeChat?.id && editingMessage?.index === index) && (
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
                                setEditingMessage({ chatId: activeChat.id, index, originalText: msg.text, draft: msg.text })
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
            onSubmit={submitComposer}
          >
            <div className="composer-model-row" ref={modelPickerRef}>
              <button
                type="button"
                className={`composer-model-trigger ${modelMenuOpen ? 'open' : ''}`}
                onClick={() => setModelMenuOpen((open) => !open)}
                aria-expanded={modelMenuOpen}
                aria-haspopup="menu"
              >
                <span className="composer-model-spark"><Sparkles size={15} /></span>
                <span>{selectedMode === 'beu' ? 'BEU Study Mode' : selectedMode === 'interview' ? 'Interview Mode' : 'Normal Mode'}</span>
                <ChevronDown size={14} />
              </button>
              {modelMenuOpen && (
                <div className="composer-model-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setModelMenuOpen(false); handleModeChange('chat') }}>
                    <MessageSquare size={17} />
                    <span><strong>Normal Mode</strong><small>General chat and coding help</small></span>
                    {selectedMode === 'chat' && <Check size={15} />}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setModelMenuOpen(false); handleModeChange('beu') }}>
                    <GraduationCap size={17} />
                    <span><strong>BEU Study Mode</strong><small>Syllabus, PYQs & exams</small></span>
                    {selectedMode === 'beu' && <Check size={15} />}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setModelMenuOpen(false); handleModeChange('interview') }}>
                    <BriefcaseBusiness size={17} />
                    <span><strong>Interview Mode</strong><small>DSA, HR & mock interviews</small></span>
                    {selectedMode === 'interview' && <Check size={15} />}
                  </button>
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              placeholder="Ask Siva anything..."
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              rows={1}
              aria-label="Message Siva AI"
            />
            <button
              type="button"
              className="composer-plus-button"
              onClick={() => showComingSoon('Attachments')}
              aria-label="Add attachment — coming soon"
            // title="Add attachment (Coming Soon)"
            >
              <Plus size={19} />
            </button>
            {isStreaming ? (
              <button
                type="button"
                className="stop-btn composer-send-button"
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
                className="composer-send-button"
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

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
          <div className="rename-dialog account-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
            <div className="rename-dialog-heading">
              <div className="rename-dialog-icon"><Settings size={18} /></div>
              <div><h2 id="account-settings-title">Account settings</h2><p>Manage your Siva AI profile and appearance.</p></div>
              <button type="button" className="rename-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={17} /></button>
            </div>
            {isSignedIn ? (
              <form onSubmit={saveDisplayName} className="account-settings-form">
                <label htmlFor="account-display-name">Display name</label>
                <input id="account-display-name" value={displayNameDraft} onChange={(event) => setDisplayNameDraft(event.target.value)} maxLength={80} placeholder="Enter your name" />
                <p className="account-settings-help">This name appears in the account section. You can edit other profile details using Manage account.</p>
                <div className="rename-dialog-actions"><button type="button" className="rename-cancel" onClick={() => { setSettingsOpen(false); openUserProfile() }}>Manage account</button><button type="submit" className="rename-save" disabled={savingDisplayName || !displayNameDraft.trim()}>{savingDisplayName ? 'Saving…' : 'Save name'}</button></div>
              </form>
            ) : (
              <p>Sign in to manage your profile. You can still change the appearance below.</p>
            )}
            <div className="account-settings-row account-appearance-row">
              <div><strong>Appearance</strong><small>Choose Light, Dark, or follow your device setting.</small></div>
              <div className="theme-preference-options" role="group" aria-label="Appearance preference">
                <button type="button" className={theme === 'light' ? 'selected' : ''} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={15} /> Light</button>
                <button type="button" className={theme === 'dark' ? 'selected' : ''} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={15} /> Dark</button>
                <button type="button" className={theme === 'system' ? 'selected' : ''} aria-pressed={theme === 'system'} onClick={() => setTheme('system')}><Monitor size={15} /> System</button>
              </div>
            </div>
            <div className="rename-dialog-actions"><button type="button" className="rename-cancel" onClick={() => setSettingsOpen(false)}>Done</button></div>
          </div>
        </div>
      )}

      {memoriesOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMemoriesOpen(false)
          }}
        >
          <div className="rename-dialog saved-memory-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-memory-title">
            <div className="rename-dialog-heading">
              <div className="rename-dialog-icon"><Brain size={18} /></div>
              <div>
                <h2 id="saved-memory-title">Saved memory</h2>
                <p>Facts Siva may use in future conversations.</p>
              </div>
              <button type="button" className="rename-close" onClick={() => setMemoriesOpen(false)} aria-label="Close saved memory">×</button>
            </div>
            {memoriesLoading ? (
              <p>Loading saved memories…</p>
            ) : savedMemories.length === 0 ? (
              <p>No saved memories yet.</p>
            ) : (
              <div className="saved-memory-list">
                {savedMemories.map((memory) => (
                  <div className="saved-memory-item" key={memory.id}>
                    <div>
                      <p>{memory.fact}</p>
                      <small>{memory.category || 'profile'}</small>
                    </div>
                    <button
                      type="button"
                      className="delete-confirm"
                      onClick={() => deleteSavedMemory(memory.id)}
                      aria-label={`Delete memory: ${memory.fact}`}
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="rename-dialog-actions">
              <button type="button" className="rename-cancel" onClick={() => setMemoriesOpen(false)}>Close</button>
            </div>
          </div>
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

      {sidebarTooltip && !isNavExpanded && !socialOpen && !accountOpen && (
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

function App() {
  const path = window.location.pathname

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyAuthPageTheme = () => {
      let preference = 'system'
      try { preference = window.localStorage.getItem(THEME_STORAGE_KEY) || 'system' } catch { /* use system */ }
      const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
      document.documentElement.dataset.theme = resolved
      document.body.dataset.theme = resolved
      document.documentElement.dataset.themePreference = preference
    }
    applyAuthPageTheme()
    media.addEventListener?.('change', applyAuthPageTheme)
    window.addEventListener('storage', applyAuthPageTheme)
    return () => {
      media.removeEventListener?.('change', applyAuthPageTheme)
      window.removeEventListener('storage', applyAuthPageTheme)
    }
  }, [])


  if (path.startsWith('/sign-in')) {
    return (
      <div className="siva-auth-page">
        <div className="siva-auth-stack">
          <SignIn
            routing="hash"
            oauthFlow="redirect"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
            appearance={{
              variables: {
                colorPrimary: '#2563eb',
                colorBackground: 'var(--siva-auth-card, #ffffff)',
                colorText: 'var(--siva-auth-text, #172033)',
                colorTextSecondary: 'var(--siva-auth-muted, #64748b)',
                colorInputBackground: 'var(--siva-auth-card, #ffffff)',
                colorInputText: 'var(--siva-auth-text, #172033)',
                borderRadius: '12px',
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
              },
              elements: {
                card: 'siva-clerk-card',
                headerTitle: 'siva-clerk-title',
                formButtonPrimary: 'siva-clerk-primary-button',
                footerAction: 'siva-clerk-footer-action',
                footerActionLink: 'siva-clerk-footer-action-link',
                footerPages: 'siva-clerk-footer-pages',
              },
            }}
          />
          <p className="siva-auth-switch">
            Don’t have an account? <a href="/sign-up">Sign up</a>
          </p>
        </div>
      </div>
    )
  }

  if (path.startsWith('/sign-up')) {
    return (
      <div className="siva-auth-page">
        <div className="siva-auth-stack">
          <SignUp
            routing="hash"
            oauthFlow="redirect"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/"
            signInFallbackRedirectUrl="/"
            appearance={{
              variables: {
                colorPrimary: '#2563eb',
                colorBackground: 'var(--siva-auth-card, #ffffff)',
                colorText: 'var(--siva-auth-text, #172033)',
                colorTextSecondary: 'var(--siva-auth-muted, #64748b)',
                colorInputBackground: 'var(--siva-auth-card, #ffffff)',
                colorInputText: 'var(--siva-auth-text, #172033)',
                borderRadius: '12px',
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
              },
              elements: {
                card: 'siva-clerk-card',
                headerTitle: 'siva-clerk-title',
                formButtonPrimary: 'siva-clerk-primary-button',
                footerAction: 'siva-clerk-footer-action',
                footerActionLink: 'siva-clerk-footer-action-link',
                footerPages: 'siva-clerk-footer-pages',
              },
            }}
          />
          <p className="siva-auth-switch">
            Already have an account? <a href="/sign-in">Sign in</a>
          </p>
        </div>
      </div>
    )
  }

  return <WorkspaceApp />
}

export default App
