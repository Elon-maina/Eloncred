/* ================================
   PASSWORD VALIDATION & TOGGLE
================================ */

function validatePassword(password) {
    const feedback = [];
    if (!password) {
        feedback.push("Password cannot be empty");
        return { valid: false, feedback };
    }
    if (password.length < 8) feedback.push("At least 8 characters");
    if (!/[a-z]/.test(password)) feedback.push("One lowercase letter");
    if (!/[A-Z]/.test(password)) feedback.push("One uppercase letter");
    if (!/[0-9]/.test(password)) feedback.push("One number");
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push("One special character");
    return { valid: feedback.length === 0, feedback };
}

function setupPasswordToggle(passwordId, eyeId) {
    const input = document.getElementById(passwordId);
    const eye = document.getElementById(eyeId);
    if (!input || !eye) return;
    eye.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        eye.classList.toggle('fa-eye');
        eye.classList.toggle('fa-eye-slash');
    });
}

   // Account dropdown toggle for touch devices
    const navAccount = document.querySelector('.nav-account');
    if (navAccount) {
        // render account dropdown based on session state
        function updateAccountDropdown() {
            const dd = navAccount.querySelector('.account-dropdown');
            if (!dd) return;
            const session = getSession();
            if (session && session.user) {
                dd.innerHTML = `
                    <a href="#" id="accountProfile">Profile</a>
                    <a href="#" id="logoutBtn">Logout</a>
                `;
            } else {
                dd.innerHTML = `
                    <a href="login.html">Sign In</a>
                    <a href="signup.html">Sign Up</a>
                `;
            }
        }

        // initial render
        updateAccountDropdown();

        // open/close dropdown on click, but allow toggling programmatically
        navAccount.addEventListener('click', function(e) {
            e.stopPropagation();
            const dd = navAccount.querySelector('.account-dropdown');
            if (dd) dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
        });

        // hide dropdown when clicking outside
        document.addEventListener('click', function() {
            const dd = navAccount.querySelector('.account-dropdown');
            if (dd) dd.style.display = 'none';
        });

        // delegate clicks inside dropdown (for logout/profile)
        navAccount.addEventListener('click', function(e) {
            const logoutBtn = navAccount.querySelector('#logoutBtn');
            if (logoutBtn && e.target && e.target.id === 'logoutBtn') {
                e.preventDefault();
                performLogout();
            }
            const profileBtn = navAccount.querySelector('#accountProfile');
            if (profileBtn && e.target && e.target.id === 'accountProfile') {
                e.preventDefault();
                // if profile link is clicked, try to open profile page if session present
                const session = getSession();
                if (session && session.user && session.user.id) {
                    window.location.href = `#/profile/${session.user.id}`; // placeholder or implement actual profile page
                } else {
                    showMessage('No user session found', 'error');
                }
            }
        });

        // watch storage events so other tabs can update dropdown
        window.addEventListener('storage', function(evt) {
            if (evt.key === 'eloncred_session') updateAccountDropdown();
        });

        // listen for admin updates from admin window/tab
        window.addEventListener('message', function(e){
            try {
                if (e && e.data && e.data.type === 'products-updated') {
                    renderProducts();
                }
            } catch (err) { console.error('message handler error', err); }
        });
    }

/* ================================
   SWEETALERT HELPER
================================ */

function showAlert(message, type = 'info', title = '') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: type,
            title: title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : ''),
            text: message
        });
    } else {
        alert(message);
    }
}
/* ================================
   SESSION HELPERS
================================ */

function setSession(sessionObj) {
    localStorage.setItem('eloncred_session', JSON.stringify(sessionObj));
}

function getSession() {
    try {
        return JSON.parse(localStorage.getItem('eloncred_session'));
    } catch {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem('eloncred_session');
}



/* ================================
   LOGIN & SIGNUP
================================ */

async function handleLogin(e) {
    e.preventDefault();
    const form = new FormData(e.target);

    try {
        const res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: form.get('email'),
                password: form.get('password')
            })
        });

        const data = await res.json();
        Swal.fire({
            icon: data.success ? 'success' : 'error',
            title: data.success ? 'Success' : 'Error',
            text: data.message
        });

        if (data.success) {
            setSession({
                user: data.user,
                token: data.session.token,
                createdAt: Date.now()
            });
            window.location.href = 'home.html';
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Login Failed',
            text: 'An error occurred during login. Please try again.'
        });
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const password = form.get('password');
    const confirm = form.get('confirmPassword');

if (password !== confirm) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: 'Password Mismatch',
            text: 'Passwords do not match',
        });
    } 
    return;
}


const check = validatePassword(password);
if (!check.valid) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: 'Password Invalid',
            html: check.feedback.join('<br>'),
        });
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Password Invalid',
            html: check.feedback.join('<br>')
        });
    }
    return;
}


    try {
        const res = await fetch('http://localhost:3000/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullname: form.get('fullname'),
                email: form.get('email'),
                phone: form.get('phone'),
                password
            })
        });

        const data = await res.json();
        Swal.fire({
            icon: data.success ? 'success' : 'error',
            title: data.success ? 'Success' : 'Error',
            text: data.message
        });

        if (data.success) {
            window.location.href = 'login.html';
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Signup Failed',
            text: 'An error occurred during signup. Please try again.'
        });
    }
}

/* ================================
   LOGOUT
================================ */

async function performLogout() {
    const session = getSession();
    try {
        if (session && session.token) {
            await fetch('http://localhost:3000/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: session.token })
            });
        }
    } catch (e) {}

    clearSession();
    Swal.fire({
        icon: 'success',
        title: 'Logged Out',
        text: 'You have been successfully logged out.',
        timer: 4000
    });
    setTimeout(() => {
        window.location.href = 'home.html';
    }, 4000);
}

/* ================================
   FETCH PRODUCTS (BACKEND)
================================ */

async function fetchProducts() {
    try {
        const res = await fetch('http://localhost:3000/api/products');
        const data = await res.json();
        return data.success ? data.products : [];
    } catch (e) {
        return [];
    }
}

/* ================================
   RENDER PRODUCTS
================================ */

async function renderProducts() {
    const products = await fetchProducts();
    const categories = ['foodstuffs','babystuff','footwear','bicycles','books'];

    categories.forEach(cat => {
        const container = document.getElementById(`cat-${cat}`);
        if (!container) return;

        container.innerHTML = '';
        const items = products.filter(p => p.category === cat);

        if (!items.length) {
            container.innerHTML = '<p>No items yet</p>';
            return;
        }

items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
        <div class="product-media">
            ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '<i class="fas fa-box"></i>'}
        </div>
        <h3>${item.name}</h3>
        <p>Ksh ${item.price}</p>
        ${item.stock_quantity > 0 
            ? `<span class="in-stock">${item.stock_quantity} in stock</span>` 
            : `<span class="out-of-stock">Out of stock</span>`}
        <button class="add-to-cart" data-id="${item.id}" ${item.stock_quantity === 0 ? 'disabled' : ''}>Add to cart</button>
    `;
    container.appendChild(card);
});

    });
    
}



/* ================================
   SEARCH PRODUCTS
================================ */

async function searchProducts(query) {
    const products = await fetchProducts();
    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
    );
    renderSearchResults(filtered);
}

function renderSearchResults(products) {
    const categories = ['foodstuffs','babystuff','footwear','bicycles','books'];
    categories.forEach(cat => {
        const container = document.getElementById(`cat-${cat}`);
        if (!container) return;
        container.innerHTML = '';

        const items = products.filter(p => p.category === cat);
        if (!items.length) {
            container.innerHTML = '<p>No results</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';
            const inStock = Number(item.stock_quantity) > 0;
            card.innerHTML = `
                <div class="product-media">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '<i class="fas fa-box"></i>'}
                </div>
                <h3>${item.name}</h3>
                <p>Ksh ${item.price}</p>
                ${item.stock_quantity > 0 
                    ? `<span class="in-stock">${item.stock_quantity} in stock</span>` 
                    : `<span class="out-of-stock">Out of stock</span>`}
                <button class="add-to-cart" data-id="${item.id}" ${inStock ? '' : 'disabled'}>Add to cart</button>
            `;
            container.appendChild(card);
        });
    });
}

/* ================================
   ADD TO CART (LOGIN CHECK)
================================ */

document.addEventListener('click', e => {
    if (!e.target.classList.contains('add-to-cart')) return;

    const session = getSession();
    if (!session) {
        Swal.fire({
            icon: 'warning',
            title: 'Login Required',
            text: 'Please login first to add items to cart'
        }).then(() => {
            window.location.href = 'login.html';
        });
        return;
    }

    // call backend to add item to user cart and then refresh cart dropdown
(async () => {
    try {
        const btn = e.target;
        const productId = Number(btn.getAttribute('data-id'));
        const token = session && session.token ? session.token : null;

        if (!productId) throw new Error('Invalid product id');

        if (token) {
            // fetch current server cart to check if product already present
            const cartResp = await fetch('http://localhost:3000/api/cart', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const cartData = await cartResp.json();
            const already = cartData && cartData.success &&
                Array.isArray(cartData.cart) &&
                cartData.cart.some(r => Number(r.product_id) === productId);

            // always attempt to add (backend will upsert and return updated cart)
            const addResp = await fetch('http://localhost:3000/api/cart/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ product_id: productId, quantity: 1 })
            });

            const addData = await addResp.json();
            if (addData && addData.success) {
                if (addData.cart) renderServerCart(addData.cart);

                const navCart = document.getElementById('navCart');
                if (navCart) navCart.classList.add('open');

                // notify user whether new or already present
                const card = btn.closest('.product-card');
                const nameEl = card ? card.querySelector('h3') : null;
                const productName = nameEl
                    ? nameEl.textContent.trim()
                    : `Product ${productId}`;

                if (addData.addedNew) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Added to Cart',
                        text: `${productName} added to cart`,
                        timer: 1400,
                        showConfirmButton: false
                    });
                } else if (addData.already) {
                    Swal.fire({
                        icon: 'info',
                        title: 'Already in cart',
                        text: `${productName} is already in your cart.`,
                        timer: 1400,
                        showConfirmButton: false
                    });
                } else {
                    // fallback message
                    Swal.fire({
                        icon: 'info',
                        title: 'Cart Updated',
                        text: 'Cart updated.',
                        timer: 1400,
                        showConfirmButton: false
                    });
                }
            } else {
                throw new Error(addData && addData.message ? addData.message : 'Add failed');
            }
        }

        // ❌ duplicate success alert removed here

    } catch (err) {
        console.error('Add to cart failed', err);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to add to cart'
        });
    }
})();
});

// Render server cart into the nav dropdown
function renderServerCart(cartRows) {
    try {
        const cartCountEl = document.getElementById('cartCount');
        const cartItemsEl = document.getElementById('cartItems');
        const cartTotalEl = document.getElementById('cartTotal');
        if (!cartItemsEl) return;

        let total = 0;
        cartItemsEl.innerHTML = '';
        if (!cartRows || cartRows.length === 0) {
            cartItemsEl.innerHTML = '<p style="color:var(--text-light)">Your cart is empty</p>';
            if (cartCountEl) cartCountEl.textContent = '0';
            if (cartTotalEl) cartTotalEl.textContent = 'Total: 0';
            return;
        }

        cartRows.forEach(row => {
            const qty = row.quantity || 1;
            const price = Number(row.price) || 0;
            total += qty * price;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-inner">
                    ${row.image ? `<img src="${row.image}" alt="${row.name}">` : '<div style="width:50px;height:40px;background:#fafafa;border-radius:6px;display:flex;align-items:center;justify-content:center"><i class="fas fa-box"></i></div>'}
                    <div style="flex:1">
                        <div style="font-weight:600">${row.name}</div>
                        <div style="font-size:0.9rem;color:#666">Price: ${row.price}</div>
                    </div>
                    <div class="cart-qty" data-cart-id="${row.id}">
                        <button class="qty-decrease" data-cart-id="${row.id}">-</button>
                        <div class="qty">${qty}</div>
                        <button class="qty-increase" data-cart-id="${row.id}">+</button>
                    </div>
                    <button class="btn-remove" data-cart-id="${row.id}">Remove</button>
                </div>
            `;
            cartItemsEl.appendChild(div);
        });

        if (cartCountEl) cartCountEl.textContent = String(cartRows.reduce((s,r)=>s+(r.quantity||1),0));
        if (cartTotalEl) cartTotalEl.textContent = 'Total: ' + total;
    } catch (err) { console.error('Failed to render server cart', err); }
}

// Delegate cart qty and remove actions to server endpoints
document.addEventListener('click', async function(e) {
    const target = e.target;
    const session = getSession();
    const token = session && session.token ? session.token : null;

    if (!token) return; // require auth for cart mutation

    try {
        if (target.matches('.qty-increase')) {
            const cartId = target.getAttribute('data-cart-id');
            // fetch current qty from DOM
            const parent = target.closest('.cart-item');
            const qtyEl = parent ? parent.querySelector('.qty') : null;
            const current = qtyEl ? Number(qtyEl.textContent) : 1;
            const newQty = current + 1;
            await fetch(`http://localhost:3000/api/cart/update/${cartId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ quantity: newQty })
            });
            const resp = await fetch('http://localhost:3000/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await resp.json(); if (data && data.success) renderServerCart(data.cart);
        }
        if (target.matches('.qty-decrease')) {
            const cartId = target.getAttribute('data-cart-id');
            const parent = target.closest('.cart-item');
            const qtyEl = parent ? parent.querySelector('.qty') : null;
            const current = qtyEl ? Number(qtyEl.textContent) : 1;
            const newQty = current - 1;
            if (newQty < 1) {
                // remove instead
                await fetch(`http://localhost:3000/api/cart/remove/${cartId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            } else {
                await fetch(`http://localhost:3000/api/cart/update/${cartId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ quantity: newQty }) });
            }
            const resp = await fetch('http://localhost:3000/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await resp.json(); if (data && data.success) renderServerCart(data.cart);
        }
        if (target.matches('.btn-remove')) {
            const cartId = target.getAttribute('data-cart-id');
            await fetch(`http://localhost:3000/api/cart/remove/${cartId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            const resp = await fetch('http://localhost:3000/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await resp.json(); if (data && data.success) renderServerCart(data.cart);
        }
    } catch (err) {
        console.error('Cart action failed', err);
    }
});

/* ================================
   INIT
================================ */

document.addEventListener('DOMContentLoaded', () => {
    setupPasswordToggle('password', 'loginEye');
    setupPasswordToggle('signupPassword', 'signupEye');
    setupPasswordToggle('confirmPassword', 'confirmEye');

    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);

    renderProducts();
    // initialize cart count and UI if logged in
    (async function initCartOnLoad(){
        try {
            const session = getSession();
            const token = session && session.token ? session.token : null;
            if (!token) return;
            const resp = await fetch('http://localhost:3000/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await resp.json();
            if (data && data.success) renderServerCart(data.cart);
        } catch (err) { console.warn('Init cart failed', err); }
    })();
    // Cart open/close: click cart to toggle, click outside to close
    (function() {
        const navCart = document.getElementById('navCart');
        if (!navCart) return;
        document.addEventListener('click', function(e) {
            // If click is inside navCart
            if (navCart.contains(e.target)) {
                // If clicked the cart icon area (not the dropdown), toggle
                const isCartIcon = e.target.closest('.nav-cart') && !e.target.closest('.cart-dropdown');
                if (isCartIcon) navCart.classList.toggle('open');
                else navCart.classList.add('open');
            } else {
                // Clicked outside -> close
                navCart.classList.remove('open');
            }
        });
    })();
    // Wire search icon and input to use searchProducts
    const searchIcon = document.querySelector('.search-icon');
    const searchInput = document.getElementById('searchInput');
    if (searchIcon && searchInput) {
        searchIcon.addEventListener('click', function() {
            searchInput.classList.toggle('active');
            if (searchInput.classList.contains('active')) {
                searchInput.focus();
            } else {
                searchInput.value = '';
                renderProducts();
            }
        });

        searchInput.addEventListener('input', function() {
            const q = this.value.trim();
            if (q) searchProducts(q);
            else renderProducts();
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.nav-search')) {
                searchInput.classList.remove('active');
                searchInput.value = '';
                renderProducts();
            }
        });
    }

    // Clear cart (only) — keep user on page
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async function() {
            try {
                const session = getSession();
                const token = session && session.token ? session.token : null;

                if (token) {
                    // fetch server cart
                    const resp = await fetch('http://localhost:3000/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
                    const data = await resp.json();
                    if (data && data.success && Array.isArray(data.cart) && data.cart.length > 0) {
                        // remove each item
                        for (const row of data.cart) {
                            try {
                                await fetch(`http://localhost:3000/api/cart/remove/${row.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                            } catch (err) { console.warn('Failed to remove server cart item', row.id, err); }
                        }
                    }
                }

                // clear any local cart copy
                try { localStorage.removeItem('eloncred_cart'); } catch (e) {}
                // refresh cart UI (server and local) so changes appear immediately
                try { renderServerCart([]); } catch (e) { /* ignore if not defined */ }
                try { renderCartUI(); } catch (e) { /* ignore if not defined */ }
                // show confirmation
                if (typeof Swal !== 'undefined') Swal.fire({ icon: 'success', title: 'Cart cleared', timer: 1200, showConfirmButton: false });
            } catch (err) {
                console.error('Checkout failed', err);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to proceed to payment' });
            }
        });
    }

    // Prepare cart and go to payment page (does NOT clear cart)
    const paymentBtn = document.getElementById('paymentBtn');
    if (paymentBtn) {
        paymentBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
                const session = getSession();
                const token = session && session.token ? session.token : null;

                if (token) {
                    // fetch server cart and save to localStorage so payment.html can read it
                    const resp = await fetch('http://localhost:3000/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
                    const data = await resp.json();
                    if (data && data.success) {
                        const localCart = data.cart.map(r => ({ id: r.product_id, name: r.name, price: r.price, image: r.image || '', qty: r.quantity }));
                        try { localStorage.setItem('eloncred_cart', JSON.stringify(localCart)); } catch (e) { console.warn(e); }
                    }
                }

                // navigate to payment page where the cart and total will be displayed
                window.location.href = 'payment.html';
            } catch (err) {
                console.error('Failed to prepare payment', err);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to open payment' });
            }
        });
    }
});
