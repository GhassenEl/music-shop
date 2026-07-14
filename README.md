# MusicShop — Boutique d’instruments

Shop virtuel **React + Node.js/Express + MySQL** (API JSON).

| Couche | Port |
|--------|------|
| React (Vite) | **3100** |
| Express API | **5100** |
| MySQL (Docker) | **3310** |

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

## Flux commande

1. Ajouter au panier (prix déjà remisé si promo saisonnière active)
2. **Passer commande** → facture `FAC-YYYY-xxxxx`
3. **Payer** (carte / espèces / virement / PayPal) → reçu `REC-YYYY-xxxxx`

Remise été **ETE2026 −15%** active du 01/06/2026 au 31/08/2026.

## API utile

- `GET /api/v1/promotions/active`
- `POST /api/v1/orders` → commande + facture
- `GET /api/v1/orders/:id/invoice`
- `POST /api/v1/orders/:id/pay`
- `GET /api/v1/orders/:id/receipt`


## Creds MySQL (dev)

- Host: `127.0.0.1:3310`
- DB: `music_shop`
- User: `root` / `root` (app) — aussi `music` / `music123`
