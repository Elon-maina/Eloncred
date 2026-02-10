// Admin messages UI: fetch messages, render table, respond to messages
(function(){
    async function fetchMessages() {
        // quick admin check: redirect if not admin
        try {
            const session = JSON.parse(localStorage.getItem('eloncred_session') || 'null');
            const token = session && session.token ? session.token : null;
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const chk = await fetch('/api/admin/check', { headers, credentials: 'include' });
            const chkData = await chk.json().catch(()=>({ success:false }));
            if (!chkData.success) { window.location.href = 'adminlogin.html'; return { success: false, messages: [] }; }
        } catch (err) { console.warn('Admin check failed in messages.js', err); window.location.href = 'adminlogin.html'; return { success: false, messages: [] }; }

        
        // Prefer bearer token from localStorage (works cross-origin), fall back to cookie session
        const session = JSON.parse(localStorage.getItem('eloncred_session') || 'null');
        if (session && session.token) {
            try {
                const res = await fetch('http://localhost:3000/api/messages', {
                    headers: { 'Authorization': `Bearer ${session.token}` }
                });
                return res.json().catch(()=>({ success: false, message: 'Invalid response' }));
            } catch (e) {
                console.warn('Bearer fetch failed, falling back to cookie fetch', e);
            }
        }

        // Fallback: try cookie-based session
        try {
            const res = await fetch('http://localhost:3000/api/messages', { credentials: 'include' });
            return res.json().catch(()=>({ success: false, message: 'Invalid response' }));
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    }

    function renderMessages(messages) {
        const tbody = document.getElementById('messagesTbody');
        const countEl = document.getElementById('messagesCount');
        const badge = document.getElementById('messageBadge');
        tbody.innerHTML = '';
        if (!messages || messages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="color:#666">No messages found</td></tr>';
        } else {
            messages.forEach(m => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${m.id}</td>
                    <td>${escapeHtml(m.name||'')}</td>
                    <td>${escapeHtml(m.email||'')}</td>
                    <td>${escapeHtml(m.subject||'')}</td>
                    <td style="max-width:300px">${escapeHtml(m.message||'')}</td>
                    <td>${escapeHtml(m.status||'new')}</td>
                    <td>${escapeHtml(m.admin_response||'')}</td>
                    <td>
                        <button class="btn btn-respond" data-id="${m.id}">Respond</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        const total = messages ? messages.length : 0;
        if (countEl) countEl.textContent = total;
        if (badge) badge.textContent = total;
    }

    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]); }

    async function respondToMessage(id, responseText) {
        // Prefer bearer token from localStorage, fall back to cookie-based session
        const session = JSON.parse(localStorage.getItem('eloncred_session') || 'null');
        if (session && session.token) {
            try {
                const res = await fetch(`http://localhost:3000/api/messages/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
                    body: JSON.stringify({ admin_response: responseText })
                });
                return res.json().catch(()=>({ success: false, message: 'Invalid response' }));
            } catch (e) {
                console.warn('Bearer respond failed, falling back to cookie respond', e);
            }
        }

        // Fallback: try cookie-based session
        try {
            const res = await fetch(`http://localhost:3000/api/messages/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_response: responseText })
            });
            return res.json().catch(()=>({ success: false, message: 'Invalid response' }));
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    }

    document.addEventListener('DOMContentLoaded', function(){
        const refreshBtn = document.getElementById('refreshMessages');

        async function loadAndRender() {
            try {
                const result = await fetchMessages();
                if (!result.success) throw new Error(result.message || 'Failed');
                renderMessages(result.messages || []);
            } catch (err) {
                console.error('Failed to load messages', err);
            }
        }

        // Delegate respond button with SweetAlert UI
        document.getElementById('messagesContainer').addEventListener('click', async function(e){
            if (e.target && e.target.matches('.btn-respond')) {
                const id = e.target.getAttribute('data-id');
                // Use SweetAlert textarea when available
                if (window.Swal) {
                    const { value: reply } = await Swal.fire({
                        title: `Respond to message #${id}`,
                        input: 'textarea',
                        inputPlaceholder: 'Type your response here...',
                        showCancelButton: true,
                        inputAttributes: { 'aria-label': 'Response' }
                    });
                    if (!reply) return; // cancelled or empty
                    e.target.disabled = true;
                    try {
                        Swal.showLoading();
                        const res = await respondToMessage(id, reply);
                        Swal.close();
                        if (!res.success) throw new Error(res.message || 'Failed to respond');
                        Swal.fire({ icon: 'success', title: 'Sent', showConfirmButton: false, timer: 1400 });
                        loadAndRender();
                    } catch (err) {
                        console.error('Respond error', err);
                        Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to send response' });
                    } finally { e.target.disabled = false; }
                } else {
                    const reply = prompt('Type your response to message ID ' + id + ':');
                    if (reply === null) return; // cancelled
                    e.target.disabled = true;
                    try {
                        const res = await respondToMessage(id, reply);
                        if (!res.success) throw new Error(res.message || 'Failed to respond');
                        alert('Response sent');
                        loadAndRender();
                    } catch (err) {
                        console.error('Respond error', err);
                        alert('Failed to send response: ' + (err.message||err));
                    } finally { e.target.disabled = false; }
                }
            }
        });

        refreshBtn && refreshBtn.addEventListener('click', loadAndRender);

        // initial load
        loadAndRender();
    });
})();
