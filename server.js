const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Dosya bulunamadi." });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getRestaurantPublicData(restaurant) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    currency: restaurant.currency,
    tables: restaurant.tables,
    categories: restaurant.categories,
    menuItems: restaurant.menuItems
  };
}

function createOrderNumber(orderCount) {
  return `SIP-${String(orderCount + 1).padStart(4, "0")}`;
}

function handleApi(req, res, url) {
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/restaurants") {
    const restaurants = db.restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug
    }));
    sendJson(res, 200, { restaurants });
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/menu/")) {
    const slug = decodeURIComponent(url.pathname.replace("/api/menu/", ""));
    const restaurant = db.restaurants.find((item) => item.slug === slug);

    if (!restaurant) {
      sendJson(res, 404, { error: "Restoran bulunamadi." });
      return true;
    }

    sendJson(res, 200, {
      restaurant: getRestaurantPublicData(restaurant)
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    readBody(req)
      .then((body) => {
        const restaurant = db.restaurants.find((item) => item.slug === body.restaurantSlug);

        if (!restaurant) {
          sendJson(res, 404, { error: "Restoran bulunamadi." });
          return;
        }

        if (!body.table || !restaurant.tables.includes(body.table)) {
          sendJson(res, 400, { error: "Gecerli bir masa secilmedi." });
          return;
        }

        if (!Array.isArray(body.items) || body.items.length === 0) {
          sendJson(res, 400, { error: "Siparis bos olamaz." });
          return;
        }

        const normalizedItems = body.items
          .map((item) => {
            const menuItem = restaurant.menuItems.find((menu) => menu.id === item.id);
            if (!menuItem) {
              return null;
            }

            const quantity = Number(item.quantity) || 0;
            if (quantity <= 0) {
              return null;
            }

            return {
              id: menuItem.id,
              name: menuItem.name,
              unitPrice: menuItem.price,
              quantity,
              note: item.note ? String(item.note).trim() : ""
            };
          })
          .filter(Boolean);

        if (!normalizedItems.length) {
          sendJson(res, 400, { error: "Sipariste gecerli urun yok." });
          return;
        }

        const total = normalizedItems.reduce(
          (sum, item) => sum + item.unitPrice * item.quantity,
          0
        );

        const order = {
          id: `order-${Date.now()}`,
          orderNumber: createOrderNumber(db.orders.length),
          restaurantId: restaurant.id,
          restaurantSlug: restaurant.slug,
          restaurantName: restaurant.name,
          table: body.table,
          customerNote: body.customerNote ? String(body.customerNote).trim() : "",
          items: normalizedItems,
          total,
          status: "Beklemede",
          createdAt: new Date().toISOString()
        };

        db.orders.unshift(order);
        writeDb(db);
        sendJson(res, 201, { order });
      })
      .catch(() => {
        sendJson(res, 400, { error: "Gecersiz veri gonderildi." });
      });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/moderator/login") {
    readBody(req)
      .then((body) => {
        const restaurant = db.restaurants.find((item) => item.slug === body.restaurantSlug);

        if (!restaurant || restaurant.moderatorPin !== String(body.pin || "")) {
          sendJson(res, 401, { error: "Restoran veya PIN hatali." });
          return;
        }

        sendJson(res, 200, {
          restaurant: {
            id: restaurant.id,
            slug: restaurant.slug,
            name: restaurant.name,
            tables: restaurant.tables
          }
        });
      })
      .catch(() => {
        sendJson(res, 400, { error: "Gecersiz veri gonderildi." });
      });
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/moderator/orders/")) {
    const slug = decodeURIComponent(url.pathname.replace("/api/moderator/orders/", ""));
    const pin = url.searchParams.get("pin");
    const restaurant = db.restaurants.find((item) => item.slug === slug);

    if (!restaurant || restaurant.moderatorPin !== String(pin || "")) {
      sendJson(res, 401, { error: "Yetkisiz erisim." });
      return true;
    }

    const orders = db.orders.filter((order) => order.restaurantSlug === slug);
    sendJson(res, 200, { orders });
    return true;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/moderator/orders/")) {
    readBody(req)
      .then((body) => {
        const orderId = decodeURIComponent(url.pathname.replace("/api/moderator/orders/", ""));
        const { restaurantSlug, pin, status } = body;

        const restaurant = db.restaurants.find((item) => item.slug === restaurantSlug);
        if (!restaurant || restaurant.moderatorPin !== String(pin || "")) {
          sendJson(res, 401, { error: "Yetkisiz erisim." });
          return;
        }

        const order = db.orders.find((item) => item.id === orderId && item.restaurantSlug === restaurantSlug);
        if (!order) {
          sendJson(res, 404, { error: "Siparis bulunamadi." });
          return;
        }

        order.status = status;
        order.updatedAt = new Date().toISOString();
        writeDb(db);

        sendJson(res, 200, { order });
      })
      .catch(() => {
        sendJson(res, 400, { error: "Gecersiz veri gonderildi." });
      });
    return true;
  }

  return false;
}

function serveStatic(req, res, url) {
  let target = url.pathname === "/" ? "/index.html" : url.pathname;
  let filePath = path.join(PUBLIC_DIR, target);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Erisim reddedildi." });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }

    if (target === "/moderator") {
      sendFile(res, path.join(PUBLIC_DIR, "moderator.html"));
      return;
    }

    sendFile(res, path.join(PUBLIC_DIR, "index.html"));
  });
}

let currentPort = DEFAULT_PORT;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (handleApi(req, res, url)) {
    return;
  }

  serveStatic(req, res, url);
});

function startServer(port) {
  currentPort = port;
  server.listen(port, () => {
    console.log(`QR menu system running at http://localhost:${port}`);
  });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    const nextPort = currentPort + 1;
    console.log(`Port ${currentPort} dolu. ${nextPort} deneniyor...`);
    setTimeout(() => {
      startServer(nextPort);
    }, 100);
    return;
  }

  throw error;
});

startServer(DEFAULT_PORT);
