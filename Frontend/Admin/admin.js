// Ensure admin session; redirect to admin login if absent
// Use cookie-based session to verify admin; do not rely on localStorage tokens.
(async function ensureAdmin(){
    try {
        const resp = await fetch('/api/admin/check', { credentials: 'include' });
        const data = await resp.json();
        if (!data.success) throw new Error('Not admin');
    } catch (err) {
        console.warn('Admin check failed in admin.js, redirecting', err);
        window.location.href = 'adminlogin.html';
    }
})();

// Admin page script to add products to localStorage
const ADMIN_PRODUCTS_KEY = 'eloncred_products_v1';

function loadProductsAdmin() {
    try { return JSON.parse(localStorage.getItem(ADMIN_PRODUCTS_KEY) || '[]'); }
    catch (e) { return []; }
}

function saveProductsAdmin(products) {
    localStorage.setItem(ADMIN_PRODUCTS_KEY, JSON.stringify(products));
}

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('adminForm');
    const msg = document.getElementById('adminMessage');
    const list = document.getElementById('adminList');

    function renderList() {
        const items = loadProductsAdmin();
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<p style="color:var(--text-light);">No items yet</p>';
            return;
        }
        items.forEach(i => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '12px';
            row.style.marginBottom = '12px';
            row.innerHTML = `
                <div style="width:60px;height:40px;background:#fafafa;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden;">${i.image?'<img src="'+i.image+'" style="width:100%;height:100%;object-fit:cover">':'<i class="fas fa-box"></i>'}</div>
                <div style="flex:1"><strong>${i.name}</strong><div style="font-size:0.9rem;color:#666">${i.category} • ${i.price}</div></div>
                <button data-id="${i.id}" class="btn-remove">Remove</button>
            `;
            list.appendChild(row);
        });
    }

    renderList();

    // Try to sync products from server; if server has no products, localStorage will be cleared to match DB
    async function syncFromServer() {
        try {
            const resp = await fetch('http://localhost:3000/api/products', { credentials: 'include' });
            if (!resp.ok) throw new Error('Network response not ok');
            const data = await resp.json();
            if (data && data.success && Array.isArray(data.products)) {
                // Map server products into the local format used by admin UI
                const serverItems = data.products.map(p => ({
                    id: Number(p.id),
                    name: p.name || '',
                    price: (p.price === undefined || p.price === null) ? '' : String(p.price),
                    category: p.category || '',
                    image: p.image || '',
                    stock_quantity: p.stock_quantity || 0
                }));

                // Save server state to localStorage so the admin UI reflects DB
                saveProductsAdmin(serverItems);
                renderList();
            }
        } catch (err) {
            // network or server error: keep localStorage as-is
            console.warn('Product sync from server failed:', err);
        }
    }

    // perform initial sync; this will clear local items if DB is empty
    syncFromServer();

    // Price formatting helper: add comma separators
    function formatPrice(value) {
        // Remove non-digits
        const numeric = value.replace(/\D/g, '');
        // Add commas every 3 digits from right
        return numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // Parse price: remove commas to get numeric value
    function parsePrice(value) {
        return value.replace(/,/g, '');
    }

    // Wire price input for live formatting
    const priceInput = document.querySelector('input[name="price"]');
    if (priceInput) {
        priceInput.addEventListener('input', function() {
            this.value = formatPrice(this.value);
        });
    }

    // helper: read file and resize to a reasonable max dimension, returning a dataURL
    function readAndResizeImage(file, maxWidth = 1000, maxHeight = 1000) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = () => {
                img.onload = () => {
                    // calculate new size
                    let { width, height } = img;
                    const aspect = width / height;
                    if (width > maxWidth) { width = maxWidth; height = Math.round(width / aspect); }
                    if (height > maxHeight) { height = maxHeight; width = Math.round(height * aspect); }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    try { resolve(canvas.toDataURL('image/jpeg', 0.85)); } catch (err) { resolve(reader.result); }
                };
                img.onerror = (err) => reject(err);
                img.src = reader.result;
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        });
    }

    // preview selected file in the small preview box
    const fileInput = document.getElementById('pimage');
    const previewBox = document.getElementById('pimagePreview');
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB in bytes
    
    if (fileInput && previewBox) {
        fileInput.addEventListener('change', function() {
            const f = fileInput.files && fileInput.files[0];
            if (!f) { previewBox.innerHTML = ''; return; }
            
            // Validate file size
            if (f.size > MAX_FILE_SIZE) {
                previewBox.innerHTML = `<p style="color:red;font-size:0.85rem;padding:8px;">File too large! Maximum size is 20MB. Your file is ${(f.size / (1024*1024)).toFixed(2)}MB.</p>`;
                fileInput.value = ''; // clear the input
                if (msg) {
                    msg.textContent = `Error: File exceeds 20MB limit (${(f.size / (1024*1024)).toFixed(2)}MB)`;
                    msg.className = 'message error';
                    msg.style.display = 'block';
                    setTimeout(()=> msg.style.display = 'none', 4000);
                }
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(ev) {
                previewBox.innerHTML = `<img src="${ev.target.result}" alt="preview">`;
            };
            reader.readAsDataURL(f);
        });
    }

    // submit handler: if a file was provided, convert to dataURL first
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(form);
        const name = formData.get('name');
        const priceWithCommas = formData.get('price');
        const price = parsePrice(priceWithCommas); // Remove commas before sending
        const category = formData.get('category');
        const quantity = Number(formData.get('quantity') || 0);
        const file = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;

        let image = '';
        if (file) {
            try {
                // resize and compress to a reasonable size to keep localStorage friendly
                image = await readAndResizeImage(file, 1000, 1000);
            } catch (err) {
                console.error('Image read/resize failed; falling back to raw file reader', err);
                // fallback - try reading as dataURL
                image = await new Promise((resolve) => {
                    const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file);
                });
            }
        }

        // Send to server API first
        try {
            // use stored bearer token when available, otherwise send cookie credentials
            const session = JSON.parse(localStorage.getItem('eloncred_session') || 'null');
            const headers = { 'Content-Type': 'application/json' };
            const fetchOpts = {
                method: 'POST',
                headers,
                body: JSON.stringify({ name, price: Number(price), category, image, stock_quantity: quantity })
            };
            if (session && session.token) {
                headers['Authorization'] = `Bearer ${session.token}`;
            } else {
                fetchOpts.credentials = 'include';
            }

            const response = await fetch('http://localhost:3000/api/products', fetchOpts);
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Failed to save to server');
            console.log('Product saved to database:', result.product);
        } catch (err) {
            console.error('Server save error (will save to localStorage only):', err);
        }


        const items = loadProductsAdmin();
        const id = items.length ? (Math.max(...items.map(i=>i.id)) + 1) : 1;
        const newItem = { id, name, price, category, image, stock_quantity: quantity };
        items.push(newItem);
        saveProductsAdmin(items);
        renderList();
        // Use SweetAlert2 when available, otherwise fallback to inline message
        if (window.Swal) {
            try {
                Swal.fire({
                    icon: 'success',
                    title: 'Product added',
                    showConfirmButton: false,
                    timer: 1800
                });
            } catch (e) {
                msg.textContent = 'Product added';
                msg.className = 'message success';
                msg.style.display = 'block';
                setTimeout(()=> msg.style.display = 'none', 3000);
            }
        } else {
            msg.textContent = 'Product added';
            msg.className = 'message success';
            msg.style.display = 'block';
            setTimeout(()=> msg.style.display = 'none', 3000);
        }
        form.reset();
        if (previewBox) previewBox.innerHTML = '';
        // inform main page to re-render if open
        try { window.opener && window.opener.postMessage({ type: 'products-updated' }, '*'); } catch(e){}
    });

    // Delegate click handler for remove only
    list.addEventListener('click', async function(e){
        const target = e.target;
        
        // Remove button clicked
        if (target.matches('.btn-remove')) {
            const id = Number(target.getAttribute('data-id'));
            
            // Confirm delete using SweetAlert if available
            const proceed = await (async () => {
                if (window.Swal) {
                    const r = await Swal.fire({
                        title: 'Delete product?',
                        text: 'This will remove the product for all users.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Delete',
                        cancelButtonText: 'Cancel'
                    });
                    return r.isConfirmed;
                } else {
                    return confirm('Are you sure you want to delete this product?');
                }
            })();
            if (!proceed) return;
            
            // Attempt server delete with better error handling
            try {
                console.log('Attempting to delete product ID:', id);

                // Prefer bearer-token delete (no credentials preflight issues). Fall back to cookie-based delete.
                const session = JSON.parse(localStorage.getItem('eloncred_session') || 'null');
                let response = null;

                if (session && session.token) {
                    try {
                        response = await fetch(`http://localhost:3000/api/products/${id}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` }
                        });
                        console.log('Bearer delete response status:', response.status);
                    } catch (err) {
                        console.warn('Bearer delete failed, will try cookie delete', err);
                        response = null;
                    }
                }

                // If bearer attempt didn't run or failed to produce a response, try cookie-based delete
                if (!response) {
                    response = await fetch(`http://localhost:3000/api/products/${id}`, {
                        method: 'DELETE',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    console.log('Cookie delete response status:', response.status);
                }

                if (!response.ok) {
                    // Try to get error message
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.message || errorMessage;
                    } catch (parseError) {
                        // If response is not JSON, get text
                        const errorText = await response.text();
                        errorMessage = errorText || errorMessage;
                    }
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                console.log('Deleted product on server:', id, 'Response:', result);
                
                // Also remove from localStorage
                let items = loadProductsAdmin();
                items = items.filter(i => i.id !== id);
                saveProductsAdmin(items);
                renderList();
                
                // Notify parent (works inside iframe) or opener window
                try { 
                    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'products-updated' }, '*');
                    if (window.opener) window.opener.postMessage({ type: 'products-updated' }, '*');
                } catch(e) {}

                // Show success alert
                if (window.Swal) {
                    Swal.fire({ icon: 'success', title: 'Deleted', text: 'Product removed successfully', timer: 1400, showConfirmButton: false });
                }
            } catch (err) { 
                console.error('Server delete failed:', err);
                alert('Failed to delete from server: ' + err.message);
            }
        }
    });

    // Clear local-only products button (does not affect DB)
    const clearBtn = document.getElementById('clearLocalBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async function() {
            const confirmed = window.Swal ? await Swal.fire({
                title: 'Clear local items?',
                text: 'This will remove locally-saved products from the admin panel (does not delete DB).',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Clear',
                cancelButtonText: 'Cancel'
            }).then(r => r.isConfirmed) : confirm('Clear local items? This will not delete database records.');

            if (!confirmed) return;
            saveProductsAdmin([]);
            renderList();
            if (window.Swal) Swal.fire({ icon: 'success', title: 'Cleared', text: 'Local items removed', timer: 1400, showConfirmButton: false });
        });
    }
});

// Orders functionality
document.addEventListener('DOMContentLoaded', function() {
    const ordersList = document.getElementById('ordersList');

    async function loadOrders() {
        try {
            const response = await fetch('http://localhost:3000/api/orders', { credentials: 'include' });
            if (!response.ok) throw new Error('Network response not ok');
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Failed to load orders');
            renderOrders(result.orders);
        } catch (error) {
            console.error('Failed to load orders:', error);
            ordersList.innerHTML = '<p style="color:#e74c3c;">Failed to load orders</p>';
        }
    }

    function renderOrders(orders) {
        if (!orders || orders.length === 0) {
            ordersList.innerHTML = '<p style="color:var(--text-light);">No orders yet</p>';
            return;
        }

        ordersList.innerHTML = '';
        orders.forEach(order => {
            const orderEl = document.createElement('div');
            orderEl.className = 'order-item';
            orderEl.innerHTML = `
                <div class="order-header">
                    <div class="order-info">
                        <strong>Order #${order.id}</strong>
                        <div class="order-meta">
                            ${order.fullname} (${order.email}) • ${new Date(order.created_at).toLocaleDateString()}
                        </div>
                    </div>
                    <div class="order-status">
                        <span class="status-${order.status}">${order.status}</span>
                        <div class="order-total">KSh ${order.total_amount}</div>
                    </div>
                </div>
            `;
            ordersList.appendChild(orderEl);
        });
    }

    // Load orders on page load
    loadOrders();

    // Update orders count in stats
    async function updateOrdersCount() {
        try {
            const response = await fetch('http://localhost:3000/api/orders', { credentials: 'include' });
            if (!response.ok) return;
            const result = await response.json();
            if (result.success) {
                const el = document.getElementById('totalOrders');
                if (el) el.textContent = result.orders.length;
            }
        } catch (error) {
            console.error('Failed to update orders count:', error);
        }
    }

    // Update orders count when dashboard stats are updated
    const originalUpdateStats = window.updateDashboardStats;
    window.updateDashboardStats = function() {
        if (originalUpdateStats) originalUpdateStats();
        updateOrdersCount();
    };
});