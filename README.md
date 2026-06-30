# BazaarPK — بازار پی کے
A full-stack Pakistani e-commerce web application.

## 🚀 Quick Start (Frontend only)
Just open `frontend/index.html` in any browser — no installation needed!

## 📁 Project Structure
```
bazaarpk-project/
├── frontend/
│   └── index.html        ← Open this in your browser
├── backend/
│   ├── server.js         ← Node.js Express REST API
│   ├── package.json      ← Dependencies
│   └── .env.example      ← Environment variables template
├── database/
│   └── schema.sql        ← MySQL database schema
└── README.md
```

## 🛒 Features
- 16 Pakistani products across 7 categories
- Shopping cart with promo codes (try: BAZAAR10, SAVE200, WELCOME)
- Pakistani payment methods: Cash on Delivery, Easypaisa, JazzCash, Bank Transfer, Card
- Order placement and order history
- AI-powered shopping assistant (Claude AI)
- Admin dashboard with stats and charts
- Bilingual UI (English + Urdu)
- Responsive design

## 🗄️ Running the Full Backend
```bash
# 1. Setup database
mysql -u root -p < database/schema.sql

# 2. Install backend
cd backend
cp .env.example .env
# Edit .env with your MySQL password and JWT secret
npm install
npm start
# API runs at http://localhost:4000
```

## 💳 Demo Login
- Admin: admin@bazaarpk.com / admin123

## 🛠️ Tech Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, Express.js
- Database: MySQL 8
- AI: Anthropic Claude API
