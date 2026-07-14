# MusicShop — Boutique d’instruments

Shop virtuel **React + Node.js/Express + MySQL** (API JSON).

| Couche | Port |
|--------|------|
| React (Vite) | **3100** |
| Express API | **5100** |
| MySQL (Docker) | **3307** |

## Prérequis

- Node.js 18+
- Docker Desktop

## Démarrage

```bash
cd mini-projects/fullstack/music-shop

# 1. Base MySQL + seed
docker compose up -d

# 2. Dépendances
npm run install:all

# 3. API (attend MySQL puis démarre)
npm run dev:api

# 4. Front (autre terminal)
npm run dev:web
```

- Boutique : http://localhost:3100  
- API : http://localhost:5100/api/v1  
- Health : http://localhost:5100/api/v1/health  

## API

- `GET /api/v1/categories`
- `GET /api/v1/products?category=&q=`
- `GET /api/v1/products/:id`
- `GET /api/v1/stats`
- `POST /api/v1/orders` — body JSON `{ customer, items }`
- `GET /api/v1/orders`

## Creds MySQL (dev)

- Host: `127.0.0.1:3307`
- DB: `music_shop`
- User: `music` / `music123`
