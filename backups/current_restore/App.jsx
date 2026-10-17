import { useRef, useState, useEffect } from 'react'
import './App.css'

function App() {

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [typingDots, setTypingDots] = useState(1)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const textareaRef = useRef(null)
  const abortControllerRef = useRef(null);
  const chatBoxRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isTyping) {
      setTypingDots(1)
      return
    }

    intervalRef.current = setInterval(() => {
      setTypingDots(prev => prev === 3 ? 1 : prev + 1)
    }, 500)

    return () => clearInterval(intervalRef.current)
  }, [isTyping])

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
    }
  }, [messages])

  function newChat() {
    setMessages([])
    setMessage('')

    textareaRef.current?.focus()
  }

  async function sendMessage() {
    if (isTyping) {
      return
    }

    if (message.trim() === '') {
      return
    }

    const userMessage = message.trim()

    setMessage('')
    setIsTyping(true)
    setIsStreaming(true)

    // User message + empty AI message
    setMessages(prevMessages => [
      ...prevMessages,
      {
        text: userMessage,
        sender: 'user'
      },
      {
        text: '',
        sender: 'ai'
      }
    ])

    // Request ko later stop karne ke liye
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/api/chat/stream',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            message: userMessage
          }),

          signal: controller.signal
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('Streaming response not available')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let currentText = ''

      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          break
        }

        const chunk = decoder.decode(value, {
          stream: true
        })

        currentText += chunk

        setMessages(prevMessages => {
          const updatedMessages = [...prevMessages]

          updatedMessages[updatedMessages.length - 1] = {
            text: currentText,
            sender: 'ai'
          }

          return updatedMessages
        })
      }

    } catch (error) {

      if (error.name === 'AbortError') {
        console.log('Generation stopped')
      } else {
        console.error('Chat error:', error)

        setMessages(prevMessages => {
          const updatedMessages = [...prevMessages]

          updatedMessages[updatedMessages.length - 1] = {
            text: 'Sorry, something went wrong.',
            sender: 'ai'
          }

          return updatedMessages
        })
      }

    } finally {

      setIsTyping(false)
      setIsStreaming(false)
      abortControllerRef.current = null
    }

    // Textarea height reset
    if (textareaRef.current) {
      textareaRef.current.style.height = '55px'
    }
  }



  function stopGeneration() {
    clearInterval(intervalRef.current)
    intervalRef.current = null
    setIsTyping(false)
    setIsStreaming(false)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }


  function handleChange(e) {

    setMessage(e.target.value)

    e.target.style.height = '55px'

    const maxHeight = 150

    e.target.style.height =
      Math.min(e.target.scrollHeight, maxHeight) + 'px'
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()

      if (isTyping) {
        return
      }

      sendMessage()
    }
  }

  return (
    <div className="app">

      {/* Header */}

      <header className="header">

        <div className="left-section">

          <button
            className="menu-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            ☰
          </button>

          <div className="logo">
            <span className="logo-icon">✦</span>

            <div>
              <h1>Siva AI</h1>
              <p>AI Assistant</p>
            </div>
          </div>

        </div>

        <div className="nav-actions">
          <button className="new-chat" onClick={newChat}>
            + New Chat
          </button>

          <button className="settings">
            ⚙
          </button>
          <button className="user-icon">👤</button>
        </div>

      </header>

      {isSidebarOpen && (
        <aside className="sidebar">

          <button className="sidebar-new-chat" onClick={newChat}>
            + New Chat
          </button>

          <div className="sidebar-section">
            <p className="section-title">Recent Chats</p>

            <button className="chat-history">
              👋 Hello
            </button>

            <button className="chat-history">
              🐍 Python discussion
            </button>

            <button className="chat-history">
              ⚛️ React basics
            </button>
          </div>
        </aside>
      )}

      {/* Chat */}

      <main
        className={`chat-box ${isSidebarOpen ? 'sidebar-open' : ''}`}
        ref={chatBoxRef}
      >
        {messages.length === 0 ? (

          <div className="welcome">
            <h2>Welcome to Siva AI 👋</h2>
            <p>How can I help you today?</p>
          </div>

        ) : (

          messages.map((msg, index) => (

            <div className={`message-row ${msg.sender}`} key={index}>

              <div className={`message ${msg.sender}`}>

                <div className="sender-name">
                  {msg.sender === 'ai' ? 'Siva' : 'Me'}
                </div>

                <div className="message-text">
                  {msg.text}

                  {isStreaming &&
                    msg.sender === 'ai' &&
                    index === messages.length - 1 && (
                      <span className="cursor">▋</span>
                    )}
                </div>

              </div>

            </div>

          ))

        )}

        {isTyping && !isStreaming && (
          <div className="message-row ai">
            <div className="message ai">
              <div className="sender-name">Siva</div>
              <div className="typing">
                {'● '.repeat(typingDots)}
              </div>
            </div>
          </div>
        )}

      </main>


      {/* Input */}

      <div className={`input-area ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <textarea
          ref={textareaRef}
          placeholder="Ask Siva anything..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows="1"
        />

        {isTyping ? (
          <button className="stop" onClick={stopGeneration}>
            Stop
          </button>
        ) : (
          <button onClick={sendMessage}>
            Send
          </button>
        )}

      </div>

    </div>
  )
}

export default App