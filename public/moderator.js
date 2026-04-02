const moderatorState = {
  restaurants: [],
  restaurant: null,
  pin: "",
  refreshTimer: null
};

const restaurantSelectEl = document.getElementById("restaurant-select");
const moderatorPinEl = document.getElementById("moderator-pin");
const loginBtn = document.getElementById("login-btn");
const loginFeedbackEl = document.getElementById("login-feedback");
const dashboardTitleEl = document.getElementById("dashboard-title");
const liveIndicatorEl = document.getElementById("live-indicator");
const ordersListEl = document.getElementById("orders-list");
const qrLinksEl = document.getElementById("qr-links");

const statusOptions = ["Beklemede", "Hazirlaniyor", "Serviste"];

function formatTime(isoDate) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoDate));
}

function formatPrice(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(value);
}

function renderRestaurantOptions() {
  restaurantSelectEl.innerHTML = "";

  moderatorState.restaurants.forEach((restaurant) => {
    const option = document.createElement("option");
    option.value = restaurant.slug;
    option.textContent = restaurant.name;
    restaurantSelectEl.appendChild(option);
  });
}

function renderQrLinks() {
  if (!moderatorState.restaurant) {
    qrLinksEl.innerHTML = "";
    return;
  }

  const origin = window.location.origin;
  qrLinksEl.innerHTML = "";

  moderatorState.restaurant.tables.forEach((table) => {
    const menuLink = `${origin}/?restaurant=${encodeURIComponent(
      moderatorState.restaurant.slug
    )}&table=${encodeURIComponent(table)}`;
    const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(menuLink)}`;

    const card = document.createElement("div");
    card.className = "qr-card";
    card.innerHTML = `
      <h3>Masa ${table}</h3>
      <img src="${qrImage}" alt="QR ${table}" style="width: 140px; height: 140px; border-radius: 16px; object-fit: cover;" />
      <p class="muted">Bu QR kodu okutunca menu dogrudan ilgili masa ile acilir.</p>
      <a href="${menuLink}" target="_blank" rel="noreferrer">${menuLink}</a>
    `;
    qrLinksEl.appendChild(card);
  });
}

async function updateOrderStatus(orderId, status) {
  const response = await fetch(`/api/moderator/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      restaurantSlug: moderatorState.restaurant.slug,
      pin: moderatorState.pin,
      status
    })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Durum guncellenemedi.");
  }
}

function renderOrders(orders) {
  if (!orders.length) {
    ordersListEl.className = "orders-list empty-state";
    ordersListEl.textContent = "Bu restoran icin henuz siparis yok.";
    return;
  }

  ordersListEl.className = "orders-list";
  ordersListEl.innerHTML = "";

  orders.forEach((order) => {
    const card = document.createElement("article");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-card-content">
        <div class="order-meta">
          <div>
            <h3>${order.orderNumber}</h3>
            <p class="muted">Masa ${order.table} • ${formatTime(order.createdAt)}</p>
          </div>
          <span class="status-pill ${order.status.toLowerCase().replace(" ", "")}">${order.status}</span>
        </div>
        <div class="order-items">
          ${order.items
            .map(
              (item) => `
                <div class="order-line">
                  <span>${item.quantity} x ${item.name}</span>
                  <strong>${formatPrice(item.quantity * item.unitPrice)}</strong>
                </div>
                ${item.note ? `<p class="muted">Not: ${item.note}</p>` : ""}
              `
            )
            .join("")}
        </div>
        ${order.customerNote ? `<p><strong>Genel not:</strong> ${order.customerNote}</p>` : ""}
        <div class="order-meta">
          <strong>Toplam ${formatPrice(order.total)}</strong>
          <select class="status-select">
            ${statusOptions
              .map(
                (status) =>
                  `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>
    `;

    const select = card.querySelector(".status-select");
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await updateOrderStatus(order.id, select.value);
        await loadOrders();
      } catch (error) {
        loginFeedbackEl.textContent = error.message;
      } finally {
        select.disabled = false;
      }
    });

    ordersListEl.appendChild(card);
  });
}

async function loadOrders() {
  if (!moderatorState.restaurant) {
    return;
  }

  const response = await fetch(
    `/api/moderator/orders/${encodeURIComponent(moderatorState.restaurant.slug)}?pin=${encodeURIComponent(
      moderatorState.pin
    )}`
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Siparisler alinamadi.");
  }

  renderOrders(data.orders);
}

async function loginModerator() {
  loginFeedbackEl.textContent = "Baglanti kuruluyor...";

  const response = await fetch("/api/moderator/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      restaurantSlug: restaurantSelectEl.value,
      pin: moderatorPinEl.value
    })
  });

  const data = await response.json();
  if (!response.ok) {
    loginFeedbackEl.textContent = data.error || "Giris basarisiz.";
    return;
  }

  moderatorState.restaurant = data.restaurant;
  moderatorState.pin = moderatorPinEl.value;
  dashboardTitleEl.textContent = `${data.restaurant.name} siparis akisi`;
  liveIndicatorEl.textContent = "Canli";
  liveIndicatorEl.className = "pill";
  renderQrLinks();
  loginFeedbackEl.textContent = "Giris basarili.";

  await loadOrders();

  if (moderatorState.refreshTimer) {
    clearInterval(moderatorState.refreshTimer);
  }

  moderatorState.refreshTimer = window.setInterval(() => {
    loadOrders().catch((error) => {
      loginFeedbackEl.textContent = error.message;
    });
  }, 5000);
}

async function initModerator() {
  const response = await fetch("/api/restaurants");
  const data = await response.json();
  moderatorState.restaurants = data.restaurants || [];
  renderRestaurantOptions();
}

loginBtn.addEventListener("click", () => {
  loginModerator().catch((error) => {
    loginFeedbackEl.textContent = error.message;
  });
});

initModerator();
