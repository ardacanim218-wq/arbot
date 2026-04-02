const state = {
  restaurant: null,
  activeCategory: null,
  cart: []
};

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0
});

const params = new URLSearchParams(window.location.search);
const restaurantSlug = params.get("restaurant") || "demo-bistro";
const initialTable = params.get("table") || "M1";

const restaurantNameEl = document.getElementById("restaurant-name");
const tableLabelEl = document.getElementById("table-label");
const categoryTabsEl = document.getElementById("category-tabs");
const menuGridEl = document.getElementById("menu-grid");
const cartItemsEl = document.getElementById("cart-items");
const cartCountEl = document.getElementById("cart-count");
const cartTotalEl = document.getElementById("cart-total");
const tableSelectEl = document.getElementById("table-select");
const orderFeedbackEl = document.getElementById("order-feedback");
const submitOrderBtn = document.getElementById("submit-order");
const customerNoteEl = document.getElementById("customer-note");

function formatPrice(value) {
  return currencyFormatter.format(value);
}

function renderCategories() {
  categoryTabsEl.innerHTML = "";

  state.restaurant.categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = `tab-btn ${state.activeCategory === category.id ? "active" : ""}`;
    button.textContent = category.name;
    button.addEventListener("click", () => {
      state.activeCategory = category.id;
      renderCategories();
      renderMenu();
    });
    categoryTabsEl.appendChild(button);
  });
}

function renderMenu() {
  const items = state.restaurant.menuItems.filter(
    (item) => item.categoryId === state.activeCategory
  );

  menuGridEl.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";
    card.innerHTML = `
      <img src="${item.image}" alt="${item.name}" />
      <div class="menu-card-content">
        <h3>${item.name}</h3>
        <p class="muted">${item.description}</p>
        <div class="price-row">
          <span class="price">${formatPrice(item.price)}</span>
          <button class="secondary-btn" data-item-id="${item.id}">Sepete ekle</button>
        </div>
      </div>
    `;

    card.querySelector("button").addEventListener("click", () => addToCart(item));
    menuGridEl.appendChild(card);
  });
}

function addToCart(item) {
  const existing = state.cart.find((cartItem) => cartItem.id === item.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      note: ""
    });
  }

  renderCart();
}

function updateCartItem(id, change) {
  const item = state.cart.find((cartItem) => cartItem.id === id);
  if (!item) {
    return;
  }

  item.quantity += change;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((cartItem) => cartItem.id !== id);
  }

  renderCart();
}

function updateCartNote(id, value) {
  const item = state.cart.find((cartItem) => cartItem.id === id);
  if (!item) {
    return;
  }

  item.note = value;
}

function renderCart() {
  if (!state.cart.length) {
    cartItemsEl.className = "cart-items empty-state";
    cartItemsEl.textContent = "Sepetiniz simdilik bos.";
  } else {
    cartItemsEl.className = "cart-items";
    cartItemsEl.innerHTML = "";

    state.cart.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div class="order-line">
          <strong>${item.name}</strong>
          <span>${item.quantity} x ${formatPrice(item.unitPrice)}</span>
        </div>
        <label class="field">
          <span>Urun notu</span>
          <textarea rows="2" placeholder="Ornek: Acisiz olsun">${item.note}</textarea>
        </label>
        <div class="cart-controls">
          <button class="secondary-btn decrease-btn">Azalt</button>
          <button class="secondary-btn increase-btn">Arttir</button>
        </div>
      `;

      row.querySelector("textarea").addEventListener("input", (event) => {
        updateCartNote(item.id, event.target.value);
      });
      row.querySelector(".decrease-btn").addEventListener("click", () => updateCartItem(item.id, -1));
      row.querySelector(".increase-btn").addEventListener("click", () => updateCartItem(item.id, 1));
      cartItemsEl.appendChild(row);
    });
  }

  const totalQuantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = state.cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  cartCountEl.textContent = `${totalQuantity} urun`;
  cartTotalEl.textContent = formatPrice(totalPrice);
}

function populateTableOptions() {
  tableSelectEl.innerHTML = "";
  state.restaurant.tables.forEach((table) => {
    const option = document.createElement("option");
    option.value = table;
    option.textContent = table;
    if (table === initialTable) {
      option.selected = true;
    }
    tableSelectEl.appendChild(option);
  });

  tableLabelEl.textContent = tableSelectEl.value;
  tableSelectEl.addEventListener("change", () => {
    tableLabelEl.textContent = tableSelectEl.value;
  });
}

async function submitOrder() {
  if (!state.cart.length) {
    orderFeedbackEl.textContent = "Once sepete urun ekleyin.";
    return;
  }

  submitOrderBtn.disabled = true;
  orderFeedbackEl.textContent = "Siparisiniz gonderiliyor...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        restaurantSlug,
        table: tableSelectEl.value,
        customerNote: customerNoteEl.value,
        items: state.cart
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Siparis gonderilemedi.");
    }

    orderFeedbackEl.textContent = `${data.order.orderNumber} numarali siparis alindi.`;
    state.cart = [];
    customerNoteEl.value = "";
    renderCart();
  } catch (error) {
    orderFeedbackEl.textContent = error.message;
  } finally {
    submitOrderBtn.disabled = false;
  }
}

async function init() {
  const response = await fetch(`/api/menu/${encodeURIComponent(restaurantSlug)}`);
  const data = await response.json();

  if (!response.ok) {
    restaurantNameEl.textContent = "Restoran bulunamadi";
    document.getElementById("restaurant-subtitle").textContent = data.error;
    return;
  }

  state.restaurant = data.restaurant;
  state.activeCategory = state.restaurant.categories[0]?.id || null;

  restaurantNameEl.textContent = state.restaurant.name;
  populateTableOptions();
  renderCategories();
  renderMenu();
  renderCart();
}

submitOrderBtn.addEventListener("click", submitOrder);
init();
