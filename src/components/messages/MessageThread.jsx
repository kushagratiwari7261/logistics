import { useState, useRef, useEffect, useCallback } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import { supabase } from '../../lib/supabaseClient';
import { socket } from '../../hooks/useMessageSubscription';
import './MessageThread.css';

/* ── Timestamp helpers ── */
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
   DELETE CONFIRMATION DIALOG
═══════════════════════════════════════════════════════════ */
const DeleteDialog = ({ title, body, confirmLabel = 'Delete', onConfirm, onCancel, danger = true }) => (
  <div className="wa-dialog-overlay" onClick={onCancel}>
    <div className="wa-dialog" onClick={e => e.stopPropagation()}>
      <div className="wa-dialog-title">{title}</div>
      <div className="wa-dialog-body">{body}</div>
      <div className="wa-dialog-actions">
        <button className="wa-dialog-cancel" onClick={onCancel}>Cancel</button>
        <button className={`wa-dialog-confirm ${danger ? 'danger' : ''}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const MessageThread = ({ message, conversation, currentUser, onDelete, onBack, onSendReply, isGroup, fetchConversationMessages }) => {
  const [replyContent, setReplyContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherUserStatus, setOtherUserStatus] = useState({ is_online: false, last_seen: null });

  // ── WhatsApp-style UI state ──
  const [contextMenu, setContextMenu] = useState(null); // { msgId, x, y }
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConv, setShowDeleteConv] = useState(false);   // header dustbin dialog
  const [showDeleteMsgs, setShowDeleteMsgs] = useState(false);   // selected msgs delete dialog
  const [deletingMsgs, setDeletingMsgs] = useState(false);

  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const contextMenuRef = useRef(null);
  const longPressTimer = useRef(null);
  const { uploadFile, getFileUrl, getSignedUrl, uploading, progress, uploadError } = useFileUpload();

  /* ── Fetch full DM history ── */
  const fetchDmHistory = async () => {
    if (isGroup || !message || !currentUser?.id) return;
    const otherUserId = message?.sender_id === currentUser?.id
      ? message?.receiver_id
      : message?.sender_id;
    if (!otherUserId) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) { console.error('DM history fetch error:', error); return; }
      if (!data || data.length === 0) { setChatMessages([]); return; }

      const userIds = [...new Set(data.flatMap(m => [m.sender_id, m.receiver_id]).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds);

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

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
    const loadData = async () => {
      const shouldShowSpinner = chatMessages.length === 0;
      if (shouldShowSpinner) setLoadingChat(true);
      try {
        if (isGroup && conversation?.id) {
          const msgs = await fetchConversationMessages(conversation.id);
          setChatMessages(msgs);
        } else if (message) {
          await fetchDmHistory();
        }
      } finally {
        if (shouldShowSpinner) setLoadingChat(false);
      }
    };
    loadData();
    // Reset selection when conversation changes
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [isGroup, conversation?.id, message?.id]);

  /* ── WebSocket Real-time ── */
  useEffect(() => {
    if (!currentUser?.id) return;

    const otherUserId = message?.sender_id === currentUser?.id
      ? message?.receiver_id
      : message?.sender_id;

    if (!isGroup && !otherUserId) return;
    if (isGroup && !conversation?.id) return;

    if (isGroup && conversation?.id) socket.emit('join_group', conversation.id);

    const handleNewMessage = (payload) => {
      const currentOtherId = isGroup ? null : (message?.sender_id === currentUser?.id ? message?.receiver_id : message?.sender_id);

      if (isGroup && payload.isGroup && payload.conversation_id === conversation?.id) {
        // ok
      } else if (!isGroup && !payload.isGroup) {
        const involvesMe = payload.sender_id === currentUser.id || payload.receiver_id === currentUser.id;
        const involvesThem = payload.sender_id === currentOtherId || payload.receiver_id === currentOtherId;
        if (!(involvesMe && involvesThem)) return;
      } else {
        return;
      }

      setChatMessages(prev => {
        if (prev.some(m => m.id === payload.id)) return prev;
        return [...prev, {
          ...payload,
          sender: payload.sender || { id: payload.sender_id },
          attachments: payload.attachments || []
        }];
      });

      setTimeout(() => {
        if (isGroup && conversation?.id) {
          fetchConversationMessages(conversation.id).then(setChatMessages);
        } else {
          fetchDmHistory();
        }
      }, 2000);
    };

    socket.on('receive_message', handleNewMessage);
    return () => {
      socket.off('receive_message', handleNewMessage);
      if (isGroup && conversation?.id) socket.emit('leave_group', conversation.id);
    };
  }, [currentUser?.id, message?.sender_id, message?.receiver_id, isGroup, conversation?.id]);

  /* ── Other user's online status (DM only) ── */
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
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [isGroup, message?.sender_id, message?.receiver_id, currentUser?.id]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── Close context menu on outside click ── */
  useEffect(() => {
    const close = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  /* ── Context menu open ── */
  const openContextMenu = (e, msgId) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setContextMenu({ msgId, x, y });
  };

  /* ── Long press for mobile ── */
  const handleTouchStart = (e, msgId) => {
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches[0];
      const x = Math.min(touch.clientX, window.innerWidth - 180);
      const y = Math.min(touch.clientY, window.innerHeight - 160);
      setContextMenu({ msgId, x, y });
    }, 500);
  };
  const handleTouchEnd = () => clearTimeout(longPressTimer.current);

  /* ── Select mode toggle ── */
  const toggleSelectMode = () => {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
    setContextMenu(null);
  };

  const toggleSelectMsg = (msgId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  /* ── Context menu actions ── */
  const ctxCopy = () => {
    const msg = chatMessages.find(m => m.id === contextMenu?.msgId);
    if (msg?.content) navigator.clipboard.writeText(msg.content).catch(() => {});
    setContextMenu(null);
  };

  const ctxSelect = () => {
    setSelectMode(true);
    if (contextMenu?.msgId) {
      setSelectedIds(new Set([contextMenu.msgId]));
    }
    setContextMenu(null);
  };

  const ctxDeleteOne = () => {
    setSelectedIds(new Set([contextMenu.msgId]));
    setShowDeleteMsgs(true);
    setContextMenu(null);
  };

  /* ── Batch delete selected messages ── */
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeletingMsgs(true);
    try {
      const ids = [...selectedIds];
      // Soft-delete (set deleted_at)
      const { error } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

      if (error) console.error('Batch delete error:', error);

      // Remove from local state
      setChatMessages(prev => prev.filter(m => !ids.includes(m.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (err) {
      console.error('Error deleting messages:', err);
    } finally {
      setDeletingMsgs(false);
      setShowDeleteMsgs(false);
    }
  };

  /* ── Delete entire conversation ── */
  const handleDeleteConversation = async () => {
    try {
      if (isGroup && conversation?.id) {
        // Soft-delete all messages in the group conversation
        await supabase
          .from('messages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('conversation_id', conversation.id);
      } else if (message) {
        const otherUserId = message?.sender_id === currentUser?.id
          ? message?.receiver_id
          : message?.sender_id;
        // Soft-delete all messages in this DM thread
        await supabase
          .from('messages')
          .update({ deleted_at: new Date().toISOString() })
          .or(
            `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`
          );
        // Also hard-delete the parent message record so the thread disappears from the list
        if (message?.id) onDelete(message.id);
      }
      setShowDeleteConv(false);
      onBack();
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  /* ── File select ── */
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const uploaded = await uploadFile(file, currentUser.id);
        setAttachments(prev => [...prev, { ...uploaded, _new: true }]);
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

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser?.id,
      receiver_id: isGroup ? null : (message?.sender_id === currentUser?.id ? message?.receiver_id : message?.sender_id),
      conversation_id: isGroup ? conversation?.id : null,
      content: replyContent,
      created_at: new Date().toISOString(),
      is_read: false,
      sending: true,
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

    const result = await onSendReply(msgData);
    setSending(false);

    if (!result?.error) {
      setChatMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: result.data.id, sending: false } : m
      ));
    } else {
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
    const diffMin = Math.floor((new Date() - d) / 60000);
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
    const isSelected = selectedIds.has(msg.id);

    return (
      <div key={msg.id || idx} className={`wa-msg-wrapper ${isSelected ? 'wa-msg-selected' : ''}`}>
        {showDateDivider && (
          <div className="wa-date-divider">
            <span>{fmtDate(msg.created_at)}</span>
          </div>
        )}

        <div
          className={`wa-bubble-row ${isMine ? 'mine' : 'theirs'} ${isLast ? 'wa-bubble-enter' : ''} ${selectMode ? 'selectable' : ''}`}
          onContextMenu={msg.sending ? undefined : (e) => openContextMenu(e, msg.id)}
          onTouchStart={msg.sending ? undefined : (e) => handleTouchStart(e, msg.id)}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          onClick={selectMode && !msg.sending ? () => toggleSelectMsg(msg.id) : undefined}
        >
          {/* Select checkbox */}
          {selectMode && !msg.sending && (
            <div className={`wa-select-checkbox ${isMine ? 'right' : 'left'}`}>
              <div className={`wa-checkbox ${isSelected ? 'checked' : ''}`}>
                {isSelected && <span>✓</span>}
              </div>
            </div>
          )}

          {isGroup && !isMine && (
            <div className="wa-bubble-avatar">
              {showAvatar ? <Avatar user={msg.sender} size={32} /> : <div style={{ width: 32 }} />}
            </div>
          )}

          <div className={`wa-bubble ${isMine ? 'wa-bubble-mine' : 'wa-bubble-theirs'} ${msg.error ? 'wa-bubble-error' : ''}`}>
            {isGroup && !isMine && showAvatar && (
              <div className="wa-bubble-sender">
                {msg.sender?.full_name || msg.sender?.username || 'Unknown'}
              </div>
            )}
            {msg.content && <div className="wa-bubble-text">{msg.content}</div>}

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
                {msg.sending ? 'Sending…' : msg.error ? 'Failed' : fmtTime(msg.created_at)}
              </span>
              {isMine && !msg.sending && (
                <span className="wa-tick">
                  {msg.error ? '⚠️' : (msg.is_read ? '✓✓' : '✓')}
                </span>
              )}
              {isMine && msg.sending && <span className="wa-tick-sending">🕒</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════════════ RENDER ══════════════════ */
  return (
    <div className="wa-thread" onClick={() => contextMenu && setContextMenu(null)}>

      {/* ── Header ── */}
      <div className="wa-header">
        {selectMode ? (
          /* Select mode header */
          <>
            <button className="wa-back" onClick={toggleSelectMode}>✕</button>
            <div className="wa-header-info">
              <div className="wa-header-name">{selectedIds.size} selected</div>
            </div>
            <button
              className="wa-header-icon-btn danger"
              onClick={() => selectedIds.size > 0 && setShowDeleteMsgs(true)}
              title="Delete selected"
              disabled={selectedIds.size === 0}
            >
              🗑️
            </button>
          </>
        ) : (
          /* Normal header */
          <>
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
            {/* Header actions */}
            <div className="wa-header-actions">
              <button
                className="wa-header-icon-btn"
                onClick={toggleSelectMode}
                title="Select messages"
              >
                ☑️
              </button>
              {!isGroup && message && (
                <button
                  className="wa-header-icon-btn danger"
                  onClick={() => setShowDeleteConv(true)}
                  title="Delete conversation"
                >
                  🗑️
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Chat area ── */}
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

      {/* ── Upload error ── */}
      {uploadError && (
        <div className="wa-upload-error">⚠️ Upload failed: {uploadError}</div>
      )}

      {/* ── Staged attachments ── */}
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

      {/* ── Upload progress ── */}
      {uploading && (
        <div className="wa-upload-bar">
          <div className="wa-upload-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* ── Input bar (hidden in select mode) ── */}
      {!selectMode && (
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
            className="wa-send-btn"
            onClick={handleSend}
            disabled={(!replyContent.trim() && attachments.length === 0) || uploading || sending}
          >
            ➤
          </button>
        </div>
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="wa-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className="wa-ctx-item" onClick={ctxCopy}>
            <span>📋</span> Copy
          </button>
          <button className="wa-ctx-item" onClick={ctxSelect}>
            <span>☑️</span> Select
          </button>
          <div className="wa-ctx-divider" />
          <button className="wa-ctx-item danger" onClick={ctxDeleteOne}>
            <span>🗑️</span> Delete
          </button>
        </div>
      )}

      {/* ── Delete selected messages dialog ── */}
      {showDeleteMsgs && (
        <DeleteDialog
          title="Delete messages?"
          body={`Delete ${selectedIds.size} message${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`}
          confirmLabel={deletingMsgs ? 'Deleting…' : 'Delete'}
          onConfirm={handleDeleteSelected}
          onCancel={() => setShowDeleteMsgs(false)}
        />
      )}

      {/* ── Delete entire conversation dialog ── */}
      {showDeleteConv && (
        <DeleteDialog
          title="Delete conversation?"
          body="This will permanently delete all messages in this conversation. This cannot be undone."
          confirmLabel="Delete All"
          onConfirm={handleDeleteConversation}
          onCancel={() => setShowDeleteConv(false)}
        />
      )}
    </div>
  );
};

export default MessageThread;