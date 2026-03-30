import { useState, useRef, useEffect } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import { supabase } from '../../lib/supabaseClient';
import { socket } from '../../hooks/useMessageSubscription';
import './MessageThread.css';

/* ── Timestamp helper ── */
const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1) return 'Today';
  if (diff < 2) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ── Avatar ── */
const Avatar = ({ user, size = 36 }) => {
  const initials = (user?.full_name || user?.username || 'U').charAt(0).toUpperCase();
  return user?.avatar_url ? (
    <img className="wa-avatar" src={user.avatar_url} alt={initials} style={{ width: size, height: size }} />
  ) : (
    <div className="wa-avatar wa-avatar-fallback" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
};

/* ── File icon by type ── */
const fileIcon = (type = '') => {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.includes('pdf')) return '📄';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('word') || type.includes('document')) return '📝';
  return '📎';
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const MessageThread = ({ message, conversation, currentUser, onDelete, onBack, onSendReply, isGroup, fetchConversationMessages }) => {
  const [replyContent, setReplyContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [otherUserStatus, setOtherUserStatus] = useState({ is_online: false, last_seen: null });
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const { uploadFile, getFileUrl, getSignedUrl, uploading, progress, uploadError } = useFileUpload();

  /* ── Fetch full DM history between two users ── */
  const fetchDmHistory = async () => {
    if (isGroup || !message || !currentUser?.id) return;
    const otherUserId = message?.sender_id === currentUser?.id
      ? message?.receiver_id
      : message?.sender_id;
    if (!otherUserId) return;

    try {
      // Step 1: Fetch all messages between the two users
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('DM history fetch error:', error);
        return;
      }

      if (!data || data.length === 0) {
        setChatMessages([]);
        return;
      }

      // Step 2: Batch fetch profiles for all unique user IDs
      const userIds = [...new Set(data.flatMap(m => [m.sender_id, m.receiver_id]).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds);

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      // Step 3: Fetch attachments for all fetched messages
      const messageIds = data.map(m => m.id);
      let attachmentMap = {};
      if (messageIds.length > 0) {
        const { data: allAttachments } = await supabase
          .from('message_attachments')
          .select('*')
          .in('message_id', messageIds);
        
        (allAttachments || []).forEach(att => {
          if (!attachmentMap[att.message_id]) attachmentMap[att.message_id] = [];
          attachmentMap[att.message_id].push(att);
        });
      }

      // Step 4: Enrich messages with profile data and attachments
      const enriched = data.map(msg => ({
        ...msg,
        sender: profileMap[msg.sender_id] || { id: msg.sender_id, full_name: 'Unknown', username: 'unknown' },
        receiver: profileMap[msg.receiver_id] || { id: msg.receiver_id, full_name: 'Unknown', username: 'unknown' },
        attachments: attachmentMap[msg.id] || [],
      }));

      setChatMessages(enriched);
    } catch (err) {
      console.error('Error fetching DM history:', err);
    }
  };

  /* ── Load messages ── */
  useEffect(() => {
    if (isGroup && conversation?.id) {
      setLoadingChat(true);
      fetchConversationMessages(conversation.id).then(msgs => {
        setChatMessages(msgs);
        setLoadingChat(false);
      });
    } else if (message) {
      setLoadingChat(true);
      fetchDmHistory().then(() => setLoadingChat(false));
    }
  }, [isGroup, conversation?.id, message?.id]);

  /* ── WebSocket Real-time: live message arrival ── */
  useEffect(() => {
    if (!currentUser?.id) return;

    // Determine the other user's ID for DMs
    const otherUserId = message?.sender_id === currentUser?.id
      ? message?.receiver_id
      : message?.sender_id;

    if (!isGroup && !otherUserId) return;
    if (isGroup && !conversation?.id) return;

    if (isGroup && conversation?.id) {
      socket.emit('join_group', conversation.id);
    }

    const handleNewMessage = async (payload) => {
      // Check if message belongs to this thread
      if (isGroup && payload.isGroup && payload.conversation_id === conversation?.id) {
        // Group message matches
      } else if (!isGroup && !payload.isGroup) {
        // DM message matches if between these two users
        const involvesMe = payload.sender_id === currentUser.id || payload.receiver_id === currentUser.id;
        const involvesThem = payload.sender_id === otherUserId || payload.receiver_id === otherUserId;
        if (!(involvesMe && involvesThem)) return;
      } else {
        return; // Doesn't match
      }

      // 1. INSTANT UPDATE: Add the message to the UI immediately if it's not from us
      if (payload.sender_id !== currentUser?.id) {
        setChatMessages(prev => {
          if (prev.some(m => m.id === payload.id)) return prev;
          
          const newMsg = {
            ...payload,
            sender: payload.sender || { id: payload.sender_id }, // Basic fallback
            attachments: payload.attachments || []
          };
          return [...prev, newMsg];
        });
      }

      // 2. BACKGROUND SYNC: Slight delay to ensure attachments/metadata are fully written to DB
      setTimeout(async () => {
        if (isGroup && conversation?.id) {
          const msgs = await fetchConversationMessages(conversation.id);
          setChatMessages(msgs);
        } else {
          fetchDmHistory();
        }
      }, 1000); 
    };

    socket.on('receive_message', handleNewMessage);

    return () => {
      socket.off('receive_message', handleNewMessage);
      if (isGroup && conversation?.id) {
        socket.emit('leave_group', conversation.id);
      }
    };
  }, [currentUser?.id, message?.sender_id, message?.receiver_id, isGroup, conversation?.id]);

  /* ── Fetch other user's online status ── */
  useEffect(() => {
    if (isGroup || !message) return;

    const otherUserId = message?.sender_id === currentUser?.id
      ? message?.receiver_id
      : message?.sender_id;

    if (!otherUserId || otherUserId === 'system') {
      setOtherUserStatus({ is_online: false, last_seen: null });
      return;
    }

    const fetchStatus = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_online, last_seen')
        .eq('id', otherUserId)
        .maybeSingle();
      if (data) setOtherUserStatus(data);
    };

    fetchStatus();
    // Poll every 15 seconds
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [isGroup, message?.sender_id, message?.receiver_id, currentUser?.id]);

  /* ── Auto-scroll to bottom ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── File select ── */
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const uploaded = await uploadFile(file, currentUser.id);
        setAttachments(prev => [...prev, { ...uploaded, _new: true }]);
        // Clear the "new" flag after animation plays
        setTimeout(() => {
          setAttachments(prev => prev.map(a => ({ ...a, _new: false })));
        }, 600);
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Send ── */
  const handleSend = async () => {
    if (!replyContent.trim() && attachments.length === 0) return;
    if (sending) return;

    setSending(true);

    const msgData = isGroup
      ? { conversation_id: conversation?.id, content: replyContent, attachments }
      : {
        receiver_id: message?.sender_id === currentUser?.id ? message?.receiver_id : message?.sender_id,
        content: replyContent,
        parent_message_id: message?.id,
        attachments,
      };

    // 1. OPTIMISTIC UPDATE: Add the message to the UI instantly
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser?.id,
      receiver_id: isGroup ? null : (message?.sender_id === currentUser?.id ? message?.receiver_id : message?.sender_id),
      conversation_id: isGroup ? conversation?.id : null,
      content: replyContent,
      created_at: new Date().toISOString(),
      is_read: false,
      sending: true, // Special flag for UI
      sender: {
        id: currentUser?.id,
        full_name: currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0],
        username: currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0],
      },
      attachments: attachments.map(a => ({ file_name: a.name, file_type: a.type, file_size: a.size, storage_path: a.path })),
    };

    setChatMessages(prev => [...prev, optimisticMsg]);
    setReplyContent('');
    setAttachments([]);

    // 2. API CALL: Background save
    const result = await onSendReply(msgData);
    setSending(false);

    if (!result?.error) {
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 1200);

      // Update the optimistic message with the real ID from DB
      setChatMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, id: result.data.id, sending: false } : m
      ));
    } else {
      // If error, we could mark the message as "Failed"
      setChatMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, error: true, sending: false } : m
      ));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Download attachment ── */
  const downloadAttachment = async (attachment) => {
    try {
      const filePath = attachment.storage_path || attachment.path;
      // Try public URL first; fall back to signed URL (private bucket)
      let url = getFileUrl(filePath);
      if (!url) url = await getSignedUrl(filePath);
      if (!url) { console.error('Could not get download URL'); return; }
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name || attachment.name || 'download';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  /* ── Header info ── */
  const headerTitle = isGroup
    ? (conversation?.title || 'Group')
    : (message?.sender_id === currentUser?.id
      ? (message?.receiver?.full_name || message?.receiver?.username || 'Unknown')
      : (message?.sender?.full_name || message?.sender?.username || 'Unknown'));

  const fmtLastSeen = (ts) => {
    if (!ts) return 'Offline';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const headerSub = isGroup
    ? `${conversation?.participants?.length || 0} members`
    : otherUserStatus.is_online
      ? 'Online'
      : `Last seen ${fmtLastSeen(otherUserStatus.last_seen)}`;

  /* ── Render a single message bubble ── */
  const renderBubble = (msg, idx, arr) => {
    const isMine = msg.sender_id === currentUser?.id;
    const prevMsg = arr[idx - 1];
    const showDateDivider = !prevMsg || fmtDate(prevMsg.created_at) !== fmtDate(msg.created_at);
    const showAvatar = isGroup && !isMine && (idx === arr.length - 1 || arr[idx + 1]?.sender_id !== msg.sender_id);
    const isLast = idx === arr.length - 1;

    return (
      <div key={msg.id || idx}>
        {showDateDivider && (
          <div className="wa-date-divider">
            <span>{fmtDate(msg.created_at)}</span>
          </div>
        )}
        <div className={`wa-bubble-row ${isMine ? 'mine' : 'theirs'} ${isLast ? 'wa-bubble-enter' : ''}`}>
          {isGroup && !isMine && (
            <div className="wa-bubble-avatar">
              {showAvatar ? <Avatar user={msg.sender} size={32} /> : <div style={{ width: 32 }} />}
            </div>
          )}
          <div className={`wa-bubble ${isMine ? 'wa-bubble-mine' : 'wa-bubble-theirs'}`}>
            {isGroup && !isMine && showAvatar && (
              <div className="wa-bubble-sender">
                {msg.sender?.full_name || msg.sender?.username || 'Unknown'}
              </div>
            )}
            {msg.content && <div className="wa-bubble-text">{msg.content}</div>}

            {/* Attachments inside bubble */}
            {msg.attachments?.length > 0 && (
              <div className="wa-attachments">
                {msg.attachments.map((att, i) => (
                  <button
                    key={i}
                    className="wa-attachment-chip"
                    onClick={() => downloadAttachment(att)}
                  >
                    <span className="wa-att-icon">{fileIcon(att.file_type)}</span>
                    <span className="wa-att-name">{att.file_name || att.name}</span>
                    {att.file_size && (
                      <span className="wa-att-size">{(att.file_size / 1024).toFixed(0)} KB</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="wa-bubble-meta">
              <span className="wa-time">
                {msg.sending ? 'Sending...' : fmtTime(msg.created_at)}
              </span>
              {isMine && !msg.sending && (
                <span className="wa-tick">
                  {msg.error ? '⚠️' : (msg.is_read ? '✓✓' : '✓')}
                </span>
              )}
              {isMine && msg.sending && (
                <span className="wa-tick-sending">🕒</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── For DM: show single message as a bubble ── */
  const dmBubbles = message ? [message] : [];

  return (
    <div className="wa-thread">
      {/* Header */}
      <div className="wa-header">
        <button className="wa-back" onClick={onBack}>←</button>
        <div className="wa-header-avatar">
          {isGroup
            ? <div className="wa-avatar wa-avatar-group">👥</div>
            : <Avatar user={message?.sender_id === currentUser?.id ? message?.receiver : message?.sender} size={40} />}
        </div>
        <div className="wa-header-info">
          <div className="wa-header-name">{headerTitle}</div>
          <div className={`wa-header-sub ${!isGroup && otherUserStatus.is_online ? 'wa-online' : ''}`}>
            {!isGroup && otherUserStatus.is_online && <span className="wa-online-dot" />}
            {headerSub}
          </div>
        </div>
        {!isGroup && message && (
          <button className="wa-delete-btn" onClick={() => onDelete(message.id)} title="Delete">🗑️</button>
        )}
      </div>

      {/* Sent flash overlay */}
      {sentFlash && (
        <div className="wa-sent-flash">
          <div className="wa-sent-icon">✓</div>
          <span>Sent</span>
        </div>
      )}

      {/* Chat area */}
      <div className="wa-chat-area">
        {loadingChat ? (
          <div className="wa-loading"><div className="wa-spinner" /></div>
        ) : chatMessages.length === 0 ? (
          <div className="wa-empty">No messages yet. Say hello! 👋</div>
        ) : (
          chatMessages.map((msg, i, arr) => renderBubble(msg, i, arr))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="wa-upload-error">⚠️ Upload failed: {uploadError}</div>
      )}

      {/* Staged attachments */}
      {attachments.length > 0 && (
        <div className="wa-staged-attachments">
          {attachments.map((att, i) => (
            <div key={i} className={`wa-staged-chip ${att._new ? 'wa-chip-enter' : ''}`}>
              <span className="wa-staged-chip-icon">{fileIcon(att.type)}</span>
              <span className="wa-staged-chip-name">{att.name}</span>
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="wa-upload-bar">
          <div className="wa-upload-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Input bar */}
      <div className="wa-input-bar">
        <button className="wa-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
          📎
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          style={{ display: 'none' }}
        />
        <textarea
          className="wa-input"
          value={replyContent}
          onChange={e => setReplyContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
        />
        <button
          className={`wa-send-btn ${sending ? 'wa-send-sending' : ''}`}
          onClick={handleSend}
          disabled={(!replyContent.trim() && attachments.length === 0) || uploading || sending}
        >
          {sending ? <div className="wa-send-spinner" /> : '➤'}
        </button>
      </div>
    </div>
  );
};

export default MessageThread;