// ===== GLOBAL FUNCTIONS (HTML atanga koh theih tur) =====
window.hiwLang = function(lang, btn) {
  document.querySelectorAll('.hiw-lang-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('hiw-en').style.display = lang === 'en' ? '' : 'none';
  document.getElementById('hiw-mz').style.display = lang === 'mz' ? '' : 'none';
};

window.closeMobileMenu = function() { document.getElementById('mobile-menu').classList.remove('open'); };

const emojis = ['📱','💻','👗','🪑','📚','⚽','🧸','🏠','🎮','🚲','🎸','🛋️','👟','🎒','⌚'];
document.getElementById('emoji-picker').innerHTML = emojis.map(e=>`<span class="emoji-option" data-emoji="${e}">${e}</span>`).join('');


// ===== FIREBASE IMPORTS =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut as fbSignOut, onAuthStateChanged, updateProfile }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, push, set, get, remove, update, onValue }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6JN9Q9cGL7UoiEyaOI_4YVhKpViHimek",
  authDomain: "secondhanddawr-5eaec.firebaseapp.com",
  databaseURL: "https://secondhanddawr-5eaec-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "secondhanddawr-5eaec",
  storageBucket: "secondhanddawr-5eaec.firebasestorage.app",
  messagingSenderId: "137378383913",
  appId: "1:137378383913:web:9885f1c81ac07cd7783438",
  measurementId: "G-F0M2HQ26R4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const errMap = {
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/weak-password': 'Password must be at least 6 characters.',
};
function errMsg(code) { return errMap[code] || 'Something went wrong. Please try again.'; }

// ===== STATE =====
let currentUser = null;
let userData = null;
let allListings = [];
let cartItems = {};
let activeCategory = 'All';
let searchQuery = '';
let selectedEmoji = '📦';
let currentSort = 'newest';

// ===== TOAST =====
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type==='success'?'✓':type==='error'?'✕':'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ===== IMAGE COMPRESSION (Base64) =====
function compressImage(file, maxWidth=600, quality=0.6) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== MODAL HELPERS =====
function openModal(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
});

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

// ===== AUTH STATE =====
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    document.getElementById('auth-buttons').style.display = 'none';
    document.getElementById('user-menu').style.display = 'block';
    const initials = (user.displayName || user.email || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('user-avatar-btn').textContent = initials;
    try {
      const snap = await get(ref(db, `users/${user.uid}`));
      if (snap.exists()) userData = snap.val();
    } catch(e) {}
    loadCart();
    if (userData?.phone) document.getElementById('sell-contact').value = userData.phone;
  } else {
    document.getElementById('auth-buttons').style.display = 'flex';
    document.getElementById('user-menu').style.display = 'none';
    userData = null;
    cartItems = {};
    updateCartBadge();
  }
  if (listingsLoaded) renderListings();
});

function loadCart() {
  if (!currentUser) return;
  onValue(ref(db, `users/${currentUser.uid}/cart`), (snap) => {
    cartItems = snap.val() || {};
    updateCartBadge();
    if (document.getElementById('cart-section').style.display === 'block') {
      renderAmazonCart();
    }
  });
}

function updateCartBadge() {
  const count = Object.keys(cartItems).length;
  const badge = document.getElementById('cart-badge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
  if (count > 0) { badge.style.alignItems = 'center'; badge.style.justifyContent = 'center'; }
}

// ===== LISTINGS LOAD =====
let listingsLoaded = false;
onValue(ref(db, 'listings'), (snap) => {
  const data = snap.val() || {};
  allListings = Object.entries(data).map(([id, v]) => ({ id, ...v }));
  listingsLoaded = true;
  renderListings();
  if (document.getElementById('cart-section').style.display === 'block') renderAmazonCart();
});

function renderListings() {
  if (!listingsLoaded) return;
  const grid = document.getElementById('products-grid');
  let items = allListings.filter(item => {
    const isOwn = currentUser && item.sellerId === currentUser.uid;
    if (isOwn) return true;
    return item.status === 'approved' || item.status === 'pending_approval';
  });
  items = items.filter(item => {
    const isOwn = currentUser && item.sellerId === currentUser.uid;
    if (isOwn) return true;
    if (item.status === 'rejected') return false;
    if (item.available === false) return false;
    return true;
  });
  if (activeCategory !== 'All') items = items.filter(i => i.category === activeCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => i.title?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
  }
  
  if (currentSort === 'price-low') {
    items.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (currentSort === 'price-high') {
    items.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    items.sort((a, b) => b.createdAt - a.createdAt);
  }

  document.getElementById('listings-count').textContent = `${items.length} item${items.length !== 1 ? 's' : ''} found`;
  if (items.length === 0) {
    const isFiltered = activeCategory !== 'All' || searchQuery;
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-emoji">${isFiltered ? '🔍' : '🏪'}</div><h3>${isFiltered ? 'No results found' : 'No listings yet'}</h3><p>${isFiltered ? 'Try a different category or search term.' : 'Be the first to list an item!'}</p></div>`;
    return;
  }
  grid.innerHTML = items.map(item => renderCard(item)).join('');
  grid.querySelectorAll('.product-card[data-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn') || e.target.closest('.wishlist-btn')) return;
      openProductModal(card.dataset.id);
    });
  });
  grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); addToCart(btn.dataset.id); });
  });
}

function renderCard(item) {
  const isOwn = currentUser && item.sellerId === currentUser.uid;
  const unavailable = item.available === false;
  let badge = '';
  if (isOwn && item.status === 'pending_approval') badge = `<span class="card-badge badge-pending">Pending</span>`;
  else if (isOwn && item.status === 'rejected') badge = `<span class="card-badge badge-rejected">Rejected</span>`;
  else if (item.orderStatus === 'ordered' || item.orderStatus === 'sold') badge = `<span class="card-badge badge-ordered">Sold</span>`;
  
  const imgHtml = item.image
    ? `<img class="card-image" src="${item.image}" alt="${item.title}" loading="lazy">`
    : `<div class="card-image-placeholder">${item.emoji || '📦'}</div>`;
  const inCart = cartItems[item.id];
  const isOrdered = item.orderStatus === 'ordered' || item.orderStatus === 'sold';
  const canCart = !isOwn && !isOrdered && item.available !== false && item.status !== 'rejected';
  return `<div class="product-card${unavailable && !isOwn ? ' unavailable' : ''}" data-id="${item.id}">
    ${imgHtml}
    ${badge}
    <div class="card-body">
      <div class="card-category">${item.category || 'Other'}</div>
      <div class="card-title">${item.title}</div>
      <div class="card-price">${formatINR(item.price)}</div>
      <div class="card-seller">by ${item.sellerName || 'Seller'}</div>
      <div class="card-actions">
        ${canCart
          ? `<button class="btn btn-primary btn-sm add-to-cart-btn" style="flex:1;font-size:0.72rem;padding:0.3rem 0.5rem" data-id="${item.id}">${inCart ? '✓ In Cart' : '+ Cart'}</button>`
          : `<span style="flex:1;font-size:0.7rem;color:var(--muted);text-align:center">${isOwn ? 'Your item' : isOrdered ? 'Sold' : 'Unavailable'}</span>`
        }
      </div>
    </div>
  </div>`;
}

// ===== FILTER & SEARCH & SORT =====
document.getElementById('sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderListings();
});

document.getElementById('filter-bar').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeCategory = chip.dataset.cat;
  
  document.getElementById('cart-section').style.display = 'none';
  document.getElementById('listings-section').style.display = 'block';
  renderListings();
});

document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  document.getElementById('cart-section').style.display = 'none';
  document.getElementById('listings-section').style.display = 'block';
  renderListings();
});

function showBrowse() {
  document.getElementById('cart-section').style.display = 'none';
  document.getElementById('listings-section').style.display = 'block';
  renderListings();
}
document.getElementById('nav-browse').addEventListener('click', showBrowse);
document.getElementById('mobile-nav-browse').addEventListener('click', showBrowse);

// ===== PRODUCT MODAL =====
function openProductModal(id) {
  const item = allListings.find(i => i.id === id);
  if (!item) return;
  const inCart = cartItems[id];
  const isOwn = currentUser && item.sellerId === currentUser.uid;
  const isOrdered = item.orderStatus === 'ordered' || item.orderStatus === 'sold';
  const canCart = !isOwn && !isOrdered && item.available !== false && item.status !== 'rejected';
  
  const imgHtml = item.image
    ? `<img class="product-detail-img" src="${item.image}" alt="${item.title}">`
    : `<div class="product-detail-emoji">${item.emoji || '📦'}</div>`;
    
  document.getElementById('product-modal-content').innerHTML = `
    ${imgHtml}
    <div class="product-detail-title">${item.title}</div>
    <div class="product-detail-price">${formatINR(item.price)}</div>
    <div class="product-meta-row">
      <span class="product-meta-badge badge-category">${item.category || 'Other'}</span>
      <span class="product-meta-badge badge-condition">${item.condition || 'Good'}</span>
    </div>
    ${item.description ? `<p class="product-description">${item.description}</p>` : ''}
    <div class="seller-info">
      <div class="seller-avatar">${(item.sellerName||'S')[0]}</div>
      <div>
        <div class="seller-name">${item.sellerName || 'Seller'}</div>
        ${item.contact ? `<div class="seller-contact">📞 ${item.contact}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:0.75rem">
      ${canCart ? `<button class="btn btn-primary btn-lg" style="flex:1" id="modal-cart-btn">${inCart ? '✓ In Cart' : 'Add to Cart'}</button>` : `<div style="flex:1;text-align:center;padding:0.75rem;background:var(--cream);border-radius:8px;font-size:0.875rem;color:var(--muted)">${isOwn?'Your Listing':'Not Available'}</div>`}
    </div>`;
    
  document.getElementById('modal-cart-btn')?.addEventListener('click', () => {
    addToCart(id);
    closeModal('product-modal');
  });
  openModal('product-modal');
}

// ===== CART CORE FUNCTIONS =====
async function addToCart(listingId) {
  if (!currentUser) { toast('Please sign in to add items to cart', 'error'); openModal('signin-modal'); return; }
  try {
    await set(ref(db, `users/${currentUser.uid}/cart/${listingId}`), { quantity: 1, addedAt: Date.now() });
    toast('Item added to cart ✓');
  } catch(e) { toast('Failed to add item', 'error'); }
}

async function removeFromCart(listingId) {
  if (!currentUser) return;
  try {
    await remove(ref(db, `users/${currentUser.uid}/cart/${listingId}`));
    toast('Item removed from cart', 'info');
  } catch(e) { toast('Failed to remove item', 'error'); }
}

// ===== AMAZON STYLE CART =====
document.getElementById('cart-btn').addEventListener('click', () => {
  document.getElementById('listings-section').style.display = 'none';
  document.getElementById('cart-section').style.display = 'block';
  renderAmazonCart();
});

document.getElementById('back-to-shop').addEventListener('click', () => {
  document.getElementById('cart-section').style.display = 'none';
  document.getElementById('listings-section').style.display = 'block';
});

async function renderAmazonCart() {
  const list = document.getElementById('amazon-cart-items');
  const footer = document.getElementById('amazon-cart-footer');
  
  if (!currentUser || Object.keys(cartItems).length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-emoji">🛒</div>
      <h3>Your Dawr Cart is empty</h3>
      <p style="margin-top:10px;"><button class="btn btn-primary" onclick="document.getElementById('back-to-shop').click()">Shop Now</button></p>
    </div>`;
    footer.style.display = 'none'; 
    return;
  }
  
  const ids = Object.keys(cartItems);
  const items = allListings.filter(i => ids.includes(i.id));
  
  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-emoji">🛒</div><h3>Your Dawr Cart is empty</h3></div>`;
    footer.style.display = 'none'; 
    return;
  }
  
  let total = 0;
  list.innerHTML = items.map(item => {
    total += Number(item.price);
    const imgHtml = item.image
      ? `<img class="amazon-cart-img" src="${item.image}" alt="${item.title}">`
      : `<div class="amazon-cart-emoji">${item.emoji||'📦'}</div>`;
      
    return `<div class="amazon-cart-item">
      ${imgHtml}
      <div style="flex:1; min-width:0;">
        <div class="card-title" style="font-size:1.1rem; margin-bottom:0.25rem;">${item.title}</div>
        <div style="font-size:0.875rem; color:var(--muted); margin-bottom:0.5rem;">Condition: ${item.condition}</div>
        <div class="card-price" style="font-size:1.2rem; margin-bottom:0.5rem;">${formatINR(item.price)}</div>
        <button class="cart-item-remove" data-id="${item.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  
  document.getElementById('amazon-cart-total-price').textContent = formatINR(total);
  footer.style.display = 'block';
  
  list.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', async () => { 
      await removeFromCart(btn.dataset.id); 
    });
  });
}

// ===== CHECKOUT =====
document.getElementById('amazon-checkout-btn').addEventListener('click', openCheckout);

async function openCheckout() {
  if (!currentUser) { toast('Please sign in', 'error'); return; }
  
  const ids = Object.keys(cartItems);
  const items = allListings.filter(i => ids.includes(i.id));
  if (items.length === 0) return;
  const total = items.reduce((s, i) => s + Number(i.price), 0);
  
  let addresses = {};
  try { const snap = await get(ref(db, `users/${currentUser.uid}/addresses`)); addresses = snap.val() || {}; } catch(e){}
  const addrEntries = Object.entries(addresses);
  const addrOptions = addrEntries.length
    ? addrEntries.map(([id, a]) => `<option value="${id}">${a.line1}, ${a.city}, ${a.district} - ${a.pincode}</option>`).join('')
    : '';
    
  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
  
  document.getElementById('checkout-content').innerHTML = `
    <div class="form-section-title">Order Summary</div>
    <div>${items.map(i=>`<div class="checkout-summary-item"><span>${i.title}</span><span style="font-weight:600;color:var(--dark)">${formatINR(i.price)}</span></div>`).join('')}</div>
    <div class="checkout-summary-item" style="border-top:1px dashed var(--border); padding-top:0.75rem;">
      <span>Delivery Fee <br><small style="color:var(--muted)">Calculated during pick-up based on item size.</small></span>
      <span style="font-weight:600;color:var(--terracotta);">Pay on Delivery</span>
    </div>
    <div class="checkout-total"><span>Total to Pay Now</span><span>${formatINR(total)}</span></div>
    
    <div class="form-section-title" style="margin-top:1.5rem">Delivery Address</div>
    ${addrEntries.length ? `<div class="form-group"><label>Select Address</label><select id="co-address-select">${addrOptions}<option value="new">+ Add New Address</option></select></div>` : ''}
    
    <div id="co-new-addr-form" style="${addrEntries.length?'display:none':''}">
      <div class="form-group"><label>House / Street *</label><input type="text" id="co-line1" placeholder="House No. 12, Mission Veng"></div>
      <div class="form-group"><label>Locality</label><input type="text" id="co-line2" placeholder="Near Market"></div>
      <div class="form-row">
        <div class="form-group"><label>City *</label><input type="text" id="co-city" placeholder="Aizawl"></div>
        <div class="form-group"><label>District *</label>
          <select id="co-district"><option value="">Select</option>
            <option>Aizawl</option><option>Lunglei</option><option>Champhai</option><option>Kolasib</option>
            <option>Lawngtlai</option><option>Mamit</option><option>Serchhip</option><option>Siaha</option>
            <option>Hnahthial</option><option>Khawzawl</option><option>Saitual</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Pincode *</label><input type="text" id="co-pincode" placeholder="796001" maxlength="6"></div>
    </div>
    
    <div class="payment-note">
      <strong>💳 Payment Instructions:</strong><br>
      <img src="YOUR_QR_CODE_IMAGE.jpg" alt="UPI QR Code" style="width: 200px; height: 200px; margin: 10px auto; display: block; border-radius: 8px; border: 1px solid var(--border);">
      Pay <strong>${formatINR(total)}</strong> to our UPI: <br>
      <strong style="font-size: 1.1rem; color: var(--terracotta);">xauz.mustaine@oksbi</strong><br><br>
      Include Order ID <strong>${orderId}</strong> in the UPI payment note.<br>
      Your order will be confirmed once payment is verified.
    </div>
    <div id="co-error" style="color:var(--terracotta);font-size:0.82rem;margin-bottom:0.75rem;display:none"></div>
    <button class="btn btn-primary btn-lg" style="width:100%" id="place-order-btn" data-orderid="${orderId}">Place Order</button>`;

  const addrSelect = document.getElementById('co-address-select');
  if (addrSelect) {
    addrSelect.addEventListener('change', () => {
      document.getElementById('co-new-addr-form').style.display = addrSelect.value === 'new' ? 'block' : 'none';
    });
  }
  
  document.getElementById('place-order-btn').addEventListener('click', () => placeOrder(items, total, addresses, addrEntries, orderId));
  openModal('checkout-modal');
}

async function placeOrder(items, total, addresses, addrEntries, orderId) {
  const btn = document.getElementById('place-order-btn');
  const errEl = document.getElementById('co-error');
  errEl.style.display = 'none';
  
  let deliveryAddress;
  const addrSelect = document.getElementById('co-address-select');
  
  if (addrSelect && addrSelect.value !== 'new') {
    deliveryAddress = addresses[addrSelect.value];
  } else {
    const line1 = document.getElementById('co-line1')?.value.trim();
    const city = document.getElementById('co-city')?.value.trim();
    const district = document.getElementById('co-district')?.value;
    const pincode = document.getElementById('co-pincode')?.value.trim();
    if (!line1 || !city || !district || !pincode) { errEl.textContent='Please fill all address fields.'; errEl.style.display='block'; return; }
    deliveryAddress = { line1, line2: document.getElementById('co-line2')?.value||'', city, district, state:'Mizoram', pincode };
    const aRef = push(ref(db, `users/${currentUser.uid}/addresses`));
    await set(aRef, { ...deliveryAddress, isDefault: addrEntries.length === 0 });
  }
  
  btn.disabled = true; btn.textContent = 'Placing Order...';
  
  try {
    const orderRef = ref(db, `orders/${orderId}`);
    await set(orderRef, {
      userId: currentUser.uid,
      userName: currentUser.displayName || '',
      userPhone: userData?.phone || '',
      items: items.map(i => ({ listingId:i.id, title:i.title, price:i.price, sellerId:i.sellerId, sellerName:i.sellerName, image:i.image||null, emoji:i.emoji||'📦' })),
      totalAmount: total,
      deliveryAddress,
      paymentStatus: 'pending',
      orderStatus: 'pending_approval',
      createdAt: Date.now(),
      deliveredAt: null,
      sellerCreditedAt: null
    });
    
    for (const item of items) {
      await update(ref(db, `listings/${item.id}`), { orderStatus: 'ordered' });
    }
    
    for (const id of Object.keys(cartItems)) {
      await remove(ref(db, `users/${currentUser.uid}/cart/${id}`));
    }
    
    document.getElementById('cart-section').style.display = 'none';
    document.getElementById('listings-section').style.display = 'block';
    
    toast(`Order placed! ID: ${orderId}`, 'success');
    document.getElementById('checkout-content').innerHTML = `<div style="text-align:center;padding:2rem"><div style="font-size:3rem;margin-bottom:1rem">🎉</div><h3 style="font-family:'Playfair Display',serif;margin-bottom:0.5rem">Order Placed!</h3><p style="color:var(--muted);margin-bottom:1rem">Order ID: <strong>${orderId}</strong></p><p style="font-size:0.875rem;color:var(--muted)">Pay ${formatINR(total)} to <strong>xauz.mustaine@oksbi</strong> with your Order ID.</p></div>`;
  } catch(e) { errEl.textContent = 'Failed to place order. Try again.'; errEl.style.display='block'; btn.disabled=false; btn.textContent='Place Order'; }
}

// ===== AUTH =====
document.getElementById('signin-btn').addEventListener('click', () => openModal('signin-modal'));
document.getElementById('signup-btn').addEventListener('click', () => openModal('signup-modal'));
document.getElementById('go-signup').addEventListener('click', () => { closeModal('signin-modal'); openModal('signup-modal'); });
document.getElementById('go-signin').addEventListener('click', () => { closeModal('signup-modal'); openModal('signin-modal'); });

document.getElementById('signin-submit').addEventListener('click', async () => {
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const errEl = document.getElementById('signin-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent='Please fill all fields.'; errEl.style.display='block'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    closeModal('signin-modal');
    toast('Welcome back!');
  } catch(e) { errEl.textContent = errMsg(e.code); errEl.style.display='block'; }
});

document.getElementById('signup-submit').addEventListener('click', async () => {
  const firstName = document.getElementById('su-firstName').value.trim();
  const lastName = document.getElementById('su-lastName').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const password = document.getElementById('su-password').value;
  const line1 = document.getElementById('su-line1').value.trim();
  const line2 = document.getElementById('su-line2').value.trim();
  const city = document.getElementById('su-city').value.trim();
  const district = document.getElementById('su-district').value;
  const pincode = document.getElementById('su-pincode').value.trim();
  
  const errEl = document.getElementById('signup-error');
  errEl.style.display = 'none';
  
  if (!firstName || !lastName || !email || !phone || !password || !line1 || !city || !district || !pincode) {
    errEl.textContent = 'Please fill all required fields.'; errEl.style.display='block'; return;
  }
  if (!/^[6-9]\d{9}$/.test(phone)) { errEl.textContent='Enter a valid 10-digit Indian mobile number.'; errEl.style.display='block'; return; }
  if (!/^\d{6}$/.test(pincode)) { errEl.textContent='Enter a valid 6-digit pincode.'; errEl.style.display='block'; return; }
  
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: `${firstName} ${lastName}` });
    const addressId = push(ref(db, `users/${cred.user.uid}/addresses`)).key;
    await set(ref(db, `users/${cred.user.uid}`), {
      firstName, lastName, email, phone,
      role: 'user', createdAt: Date.now(),
      cart: {}
    });
    await set(ref(db, `users/${cred.user.uid}/addresses/${addressId}`), {
      line1, line2, city, district, state: 'Mizoram', pincode, isDefault: true
    });
    closeModal('signup-modal');
    toast('Account created! Welcome to Second Hand Dawr 🎉');
  } catch(e) { errEl.textContent = errMsg(e.code); errEl.style.display='block'; }
});

document.getElementById('user-avatar-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('user-dropdown').classList.toggle('open');
});
document.addEventListener('click', () => document.getElementById('user-dropdown').classList.remove('open'));

document.getElementById('signout-btn').addEventListener('click', async () => {
  await fbSignOut(auth);
  toast('Signed out successfully', 'info');
});

// ===== SELL =====
let sellImageBase64 = null;

function openSellModal() {
  if (!currentUser) { toast('Please sign in to sell items', 'error'); openModal('signin-modal'); return; }
  if (userData?.phone) document.getElementById('sell-contact').value = userData.phone;
  openModal('sell-modal');
}
document.getElementById('sell-btn').addEventListener('click', openSellModal);
document.getElementById('mobile-sell-btn').addEventListener('click', () => { closeMobileMenu(); openSellModal(); });
document.getElementById('footer-sell-link').addEventListener('click', (e) => { e.preventDefault(); openSellModal(); });

document.querySelectorAll('.emoji-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedEmoji = opt.dataset.emoji;
  });
});

document.getElementById('sell-image-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const base64 = await compressImage(file);
  sellImageBase64 = base64;
  const preview = document.getElementById('sell-image-preview');
  preview.src = base64; preview.classList.add('visible');
  document.getElementById('upload-area').querySelector('div:first-child').textContent = '✓';
});

document.getElementById('sell-submit').addEventListener('click', async () => {
  const title = document.getElementById('sell-title').value.trim();
  const price = Number(document.getElementById('sell-price').value);
  const category = document.getElementById('sell-category').value;
  const condition = document.getElementById('sell-condition').value;
  const description = document.getElementById('sell-description').value.trim();
  const contact = document.getElementById('sell-contact').value.trim();
  const tncAccepted = document.getElementById('sell-tnc-checkbox').checked;
  const errEl = document.getElementById('sell-error');
  
  errEl.style.display = 'none';
  
  if (!title || !price || !category || !condition) { errEl.textContent='Please fill Title, Price, Category and Condition.'; errEl.style.display='block'; return; }
  if (!tncAccepted) { errEl.textContent='Please accept the Terms and Conditions to proceed.'; errEl.style.display='block'; return; }
  
  const btn = document.getElementById('sell-submit');
  btn.disabled = true; btn.textContent = 'Submitting...';
  
  try {
    const newRef = push(ref(db, 'listings'));
    await set(newRef, {
      title, price, category, condition, description,
      image: sellImageBase64 || null,
      emoji: selectedEmoji,
      contact,
      sellerId: currentUser.uid,
      sellerName: currentUser.displayName || userData?.firstName || 'Seller',
      createdAt: Date.now(),
      status: 'approved',
      orderStatus: null,
      available: true
    });
    
    closeModal('sell-modal');
    toast('Your listing is now live! ✓');
    
    document.getElementById('sell-title').value=''; document.getElementById('sell-price').value='';
    document.getElementById('sell-category').value=''; document.getElementById('sell-condition').value='';
    document.getElementById('sell-description').value=''; document.getElementById('sell-contact').value='';
    document.getElementById('sell-tnc-checkbox').checked = false;
    sellImageBase64=null; selectedEmoji='📦';
    document.getElementById('sell-image-preview').classList.remove('visible');
    document.getElementById('sell-image-input').value='';
    document.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
  } catch(e) { errEl.textContent='Failed to submit. Try again.'; errEl.style.display='block'; }
  btn.disabled=false; btn.textContent='Submit for Approval';
});

// ===== MY ORDERS =====
document.getElementById('my-orders-btn').addEventListener('click', async () => {
  document.getElementById('user-dropdown').classList.remove('open');
  document.getElementById('orders-panel').classList.add('open');
  document.body.style.overflow='hidden';
  const list = document.getElementById('orders-list');
  list.innerHTML = `<div class="flex-center" style="padding:2rem;color:var(--muted)">Loading...</div>`;
  
  try {
    const snap = await get(ref(db, 'orders'));
    const all = snap.val() || {};
    const myOrders = Object.entries(all).filter(([,o]) => o.userId === currentUser.uid).sort((a,b) => b[1].createdAt - a[1].createdAt);
    
    if (!myOrders.length) { list.innerHTML=`<div class="empty-state"><div class="empty-state-emoji">📋</div><h3>No orders yet</h3><p>Your orders will appear here.</p></div>`; return; }
    
    list.innerHTML = myOrders.map(([id, o]) => {
      const sMap = { 
        pending_approval:'status-pending', 
        confirmed:'status-confirmed', 
        delivered:'status-delivered', 
        completed:'status-completed', 
        return_requested:'status-pending',
        cancelled:'status-cancelled', 
        shipped:'status-confirmed' 
      };

      let returnBtnHtml = '';
      if (o.orderStatus === 'delivered' && o.deliveredAt) {
        const hoursPassed = (Date.now() - o.deliveredAt) / (1000 * 60 * 60);
        if (hoursPassed <= 48) {
          returnBtnHtml = `<button class="btn btn-outline btn-sm mt-1" style="border-color:var(--terracotta); color:var(--terracotta); width: 100%;" data-return="${id}">Request Return (48h limit)</button>`;
        }
      } else if (o.orderStatus === 'return_requested') {
        returnBtnHtml = `<div class="mt-1" style="font-size:0.8rem; color:var(--terracotta); font-weight:600; text-align: center;">Return Requested - We will contact you</div>`;
      }

      return `<div class="order-card">
        <div class="order-id">Order ID: ${id}</div>
        <span class="order-status-badge ${sMap[o.orderStatus]||'status-pending'}">${o.orderStatus?.replace(/_/g,' ').toUpperCase()||'PENDING'}</span>
        <div style="font-size:0.82rem;color:var(--muted);margin-bottom:0.75rem">${new Date(o.createdAt).toLocaleDateString('en-IN')}</div>
        ${(o.items||[]).map(i=>`<div style="font-size:0.875rem;padding:0.25rem 0;border-bottom:1px solid var(--border)">${i.title} — <strong>${formatINR(i.price)}</strong></div>`).join('')}
        <div style="font-size:0.875rem;font-weight:700;color:var(--dark);margin-top:0.75rem">Total: ${formatINR(o.totalAmount)}</div>
        ${returnBtnHtml}
      </div>`;
    }).join('');

    list.querySelectorAll('[data-return]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to return this item?')) return;
        const orderId = btn.dataset.return;
        try {
          await update(ref(db, `orders/${orderId}`), { 
            orderStatus: 'return_requested',
            returnRequestedAt: Date.now()
          });
          toast('Return requested successfully', 'success');
          document.getElementById('my-orders-btn').click(); 
        } catch(e) {
          toast('Failed to request return', 'error');
        }
      });
    });
    
  } catch(e) { list.innerHTML=`<div style="color:var(--terracotta);padding:1rem">Failed to load orders.</div>`; }
});

document.getElementById('close-orders').addEventListener('click', () => { document.getElementById('orders-panel').classList.remove('open'); document.body.style.overflow=''; });
document.getElementById('orders-panel').addEventListener('click', (e) => { if(e.target===document.getElementById('orders-panel')) { document.getElementById('orders-panel').classList.remove('open'); document.body.style.overflow=''; }});

// ===== MY LISTINGS =====
document.getElementById('my-listings-btn').addEventListener('click', async () => {
  document.getElementById('user-dropdown').classList.remove('open');
  document.getElementById('listings-panel').classList.add('open');
  document.body.style.overflow='hidden';
  const list = document.getElementById('my-listings-list');
  list.innerHTML='<div class="flex-center" style="padding:2rem;color:var(--muted)">Loading...</div>';
  try {
    const myItems = allListings.filter(i => i.sellerId === currentUser.uid).sort((a,b)=>b.createdAt-a.createdAt);
    if (!myItems.length) { list.innerHTML=`<div class="empty-state"><div class="empty-state-emoji">🏷️</div><h3>No listings yet</h3><p>List your first item!</p></div>`; return; }
    const sMap = { pending_approval:'status-pending badge-pending', approved:'badge-approved', rejected:'badge-rejected' };
    list.innerHTML = myItems.map(item => {
      const imgHtml = item.image
        ? `<img class="listing-small-img" src="${item.image}" alt="${item.title}">`
        : `<div class="listing-small-emoji">${item.emoji||'📦'}</div>`;
      return `<div class="listing-card-small">
        ${imgHtml}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.875rem;color:var(--dark)">${item.title}</div>
          <div style="font-size:0.875rem;color:var(--terracotta);font-weight:700">${formatINR(item.price)}</div>
          <span class="order-status-badge ${sMap[item.status]||'status-pending'}" style="margin-top:0.25rem">${item.status?.replace(/_/g,' ')||'pending'}</span>
          ${item.orderStatus==='ordered'?`<span class="order-status-badge status-confirmed" style="margin-left:0.25rem">Ordered</span>`:''}
          ${item.available===false&&item.status==='approved'?`<span class="order-status-badge" style="background:#94a3b822;color:#64748b;border:1px solid #94a3b844;margin-left:0.25rem">Hidden</span>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;align-self:flex-start">
          ${item.status==='approved' && !item.orderStatus ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--gold);border:1px solid var(--border);font-size:0.72rem" data-sold="${item.id}" title="Mark as sold outside this platform">
              ${item.available===false?'🟢 Re-list':'🔴 Sold Outside'}
            </button>` : ''}
          ${!item.orderStatus ? `<button class="btn btn-ghost btn-sm" style="color:var(--terracotta)" data-del="${item.id}">🗑 Delete</button>` : ''}
        </div>
      </div>`;
    }).join('');
    
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this listing?')) return;
        await remove(ref(db, `listings/${btn.dataset.del}`));
        toast('Listing deleted', 'info');
        btn.closest('.listing-card-small').remove();
      });
    });
    list.querySelectorAll('[data-sold]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.sold;
        const item = allListings.find(i => i.id === id);
        const isCurrHidden = item?.available === false;
        if (isCurrHidden) {
          await update(ref(db, `listings/${id}`), { available: true });
          toast('Item re-listed and visible to buyers ✓');
        } else {
          if (!confirm('Mark this item as sold outside the platform? It will be hidden from buyers but not deleted.')) return;
          await update(ref(db, `listings/${id}`), { available: false });
          toast('Item hidden — marked as sold outside', 'info');
        }
        document.getElementById('my-listings-btn').click();
      });
    });
  } catch(e) { list.innerHTML=`<div style="color:var(--terracotta);padding:1rem">Failed to load listings.</div>`; }
});
document.getElementById('close-listings').addEventListener('click', () => { document.getElementById('listings-panel').classList.remove('open'); document.body.style.overflow=''; });
document.getElementById('listings-panel').addEventListener('click', (e) => { if(e.target===document.getElementById('listings-panel')) { document.getElementById('listings-panel').classList.remove('open'); document.body.style.overflow=''; }});

// ===== ADDRESS BOOK =====
document.getElementById('address-book-btn').addEventListener('click', () => { document.getElementById('user-dropdown').classList.remove('open'); openAddressBook(); });
async function openAddressBook() {
  document.getElementById('address-panel').classList.add('open');
  document.body.style.overflow='hidden';
  renderAddressBook();
}
async function renderAddressBook() {
  const content = document.getElementById('address-book-content');
  try {
    const snap = await get(ref(db, `users/${currentUser.uid}/addresses`));
    const addresses = snap.val() || {};
    const entries = Object.entries(addresses);
    content.innerHTML = `
      <div style="margin-bottom:1rem">${entries.map(([id,a]) => `
        <div class="address-card ${a.isDefault?'default':''}">
          ${a.isDefault?'<div class="address-default-badge">Default</div>':''}
          <div class="address-text">${a.line1}${a.line2?', '+a.line2:''}, ${a.city}, ${a.district}, ${a.state} - ${a.pincode}</div>
          <div class="address-actions">
            ${!a.isDefault?`<button class="btn btn-ghost btn-sm" data-setdefault="${id}">Set Default</button>`:''}
            <button class="btn btn-ghost btn-sm" style="color:var(--terracotta)" data-deladdr="${id}">Delete</button>
          </div>
        </div>`).join('')}
      </div>
      <div style="border-top:1px solid var(--border);padding-top:1rem">
        <div style="font-weight:600;font-size:0.875rem;color:var(--dark);margin-bottom:0.75rem">Add New Address</div>
        <div class="form-group"><label>House / Street *</label><input type="text" id="ab-line1" placeholder="House No."></div>
        <div class="form-group"><label>Locality</label><input type="text" id="ab-line2" placeholder="Area"></div>
        <div class="form-row">
          <div class="form-group"><label>City *</label><input type="text" id="ab-city" placeholder="Aizawl"></div>
          <div class="form-group"><label>District *</label>
            <select id="ab-district"><option value="">Select</option>
              <option>Aizawl</option><option>Lunglei</option><option>Champhai</option><option>Kolasib</option>
              <option>Lawngtlai</option><option>Mamit</option><option>Serchhip</option><option>Siaha</option>
              <option>Hnahthial</option><option>Khawzawl</option><option>Saitual</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label>Pincode *</label><input type="text" id="ab-pincode" placeholder="796001" maxlength="6"></div>
        <button class="btn btn-primary" style="width:100%" id="ab-save-btn">Save Address</button>
      </div>`;
      
    content.querySelectorAll('[data-setdefault]').forEach(btn => {
      btn.addEventListener('click', async () => {
        for (const [id] of entries) await update(ref(db, `users/${currentUser.uid}/addresses/${id}`), { isDefault: false });
        await update(ref(db, `users/${currentUser.uid}/addresses/${btn.dataset.setdefault}`), { isDefault: true });
        toast('Default address updated', 'info'); renderAddressBook();
      });
    });
    
    content.querySelectorAll('[data-deladdr]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this address?')) return;
        await remove(ref(db, `users/${currentUser.uid}/addresses/${btn.dataset.deladdr}`));
        toast('Address deleted', 'info'); renderAddressBook();
      });
    });
    
    document.getElementById('ab-save-btn').addEventListener('click', async () => {
      const line1 = document.getElementById('ab-line1').value.trim();
      const city = document.getElementById('ab-city').value.trim();
      const district = document.getElementById('ab-district').value;
      const pincode = document.getElementById('ab-pincode').value.trim();
      if (!line1||!city||!district||!pincode) { toast('Fill all required fields','error'); return; }
      const aRef = push(ref(db, `users/${currentUser.uid}/addresses`));
      await set(aRef, { line1, line2:document.getElementById('ab-line2').value||'', city, district, state:'Mizoram', pincode, isDefault: entries.length===0 });
      toast('Address saved ✓'); renderAddressBook();
    });
  } catch(e) { content.innerHTML=`<div style="color:var(--terracotta);padding:1rem">Failed to load addresses.</div>`; }
}
document.getElementById('close-address').addEventListener('click', () => { document.getElementById('address-panel').classList.remove('open'); document.body.style.overflow=''; });
document.getElementById('address-panel').addEventListener('click', (e) => { if(e.target===document.getElementById('address-panel')) { document.getElementById('address-panel').classList.remove('open'); document.body.style.overflow=''; }});

// ===== HAMBURGER & SCROLL REVEAL =====
document.getElementById('hamburger-btn').addEventListener('click', () => document.getElementById('mobile-menu').classList.add('open'));
document.getElementById('mobile-menu-close').addEventListener('click', closeMobileMenu);
document.getElementById('mobile-menu').addEventListener('click', (e) => { if(e.target===document.getElementById('mobile-menu')) closeMobileMenu(); });

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }});
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));