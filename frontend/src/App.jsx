import { useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:5100/api/v1';

function money(n) {
  return new Intl.NumberFormat('fr-TN', { style: 'currency', currency: 'TND' }).format(n);
}

export default function App() {
  const [apiOk, setApiOk] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ fullName: '', email: '', phone: '' });
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart]
  );

  async function load(opts = {}) {
    try {
      const health = await fetch(`${API}/health`).then((r) => r.json());
      setApiOk(!!health.ok);
      const cat = await fetch(`${API}/categories`).then((r) => r.json());
      setCategories(cat.items || []);

      const params = new URLSearchParams();
      if (opts.category ?? category) params.set('category', opts.category ?? category);
      if ((opts.q ?? q).trim()) params.set('q', (opts.q ?? q).trim());
      const prod = await fetch(`${API}/products?${params}`).then((r) => r.json());
      setProducts(prod.items || []);

      const st = await fetch(`${API}/stats`).then((r) => r.json());
      setStats(st);
      const od = await fetch(`${API}/orders`).then((r) => r.json());
      setOrders(od.items || []);
      setError('');
    } catch {
      setApiOk(false);
      setError('API indisponible — démarre MySQL (Docker) + backend sur :5100');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function addToCart(p) {
    setCart((prev) => {
      const found = prev.find((x) => x.productId === p.id);
      if (found) {
        return prev.map((x) =>
          x.productId === p.id ? { ...x, quantity: Math.min(x.quantity + 1, p.stock) } : x
        );
      }
      return [...prev, { productId: p.id, name: p.name, price: p.price, stock: p.stock, quantity: 1 }];
    });
  }

  function updateQty(id, qty) {
    setCart((prev) =>
      prev
        .map((x) => (x.productId === id ? { ...x, quantity: qty } : x))
        .filter((x) => x.quantity > 0)
    );
  }

  async function checkout() {
    if (!customer.fullName || !customer.email || cart.length === 0) {
      setError('Nom, email et panier requis');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Commande échouée');
      setCart([]);
      await load();
      alert(`Commande #${data.orderId} créée — total ${money(data.total)}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Boutique virtuelle</p>
          <h1>MusicShop</h1>
          <p className="lead">
            Instruments, ampli et accessoires — catalogue MySQL, panier temps réel, commandes JSON API.
          </p>
        </div>
        <div className="hero-status">
          <span className={`dot ${apiOk ? 'on' : 'off'}`} />
          {apiOk ? 'API + MySQL OK' : 'Hors ligne'}
        </div>
      </header>

      {error && <div className="banner">{error}</div>}

      <section className="kpis">
        <article><strong>{stats?.products ?? '—'}</strong><span>Produits</span></article>
        <article><strong>{stats?.categories ?? '—'}</strong><span>Catégories</span></article>
        <article><strong>{stats?.stock ?? '—'}</strong><span>Stock total</span></article>
        <article className="accent"><strong>{stats ? money(stats.revenue) : '—'}</strong><span>CA commandes</span></article>
      </section>

      <div className="toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (marque, modèle…)"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            load({ category: e.target.value, q });
          }}
        >
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>{c.name} ({c.productCount})</option>
          ))}
        </select>
        <button type="button" onClick={() => load({ category, q })}>Filtrer</button>
      </div>

      <div className="layout">
        <main className="catalog">
          {products.map((p) => (
            <article key={p.id} className="product">
              <div className="emoji">{p.imageEmoji || '🎵'}</div>
              <div className="meta">
                <span className="brand">{p.brand}</span>
                {p.featured ? <span className="tag">Coup de cœur</span> : null}
              </div>
              <h3>{p.name}</h3>
              <p className="desc">{p.description}</p>
              <div className="foot">
                <strong>{money(p.price)}</strong>
                <span className={p.stock > 0 ? 'stock' : 'oos'}>
                  {p.stock > 0 ? `${p.stock} en stock` : 'Rupture'}
                </span>
              </div>
              <button type="button" disabled={p.stock < 1} onClick={() => addToCart(p)}>
                Ajouter au panier
              </button>
            </article>
          ))}
        </main>

        <aside className="cart">
          <h2>Panier</h2>
          {cart.length === 0 ? (
            <p className="muted">Panier vide</p>
          ) : (
            <ul>
              {cart.map((i) => (
                <li key={i.productId}>
                  <div>
                    <strong>{i.name}</strong>
                    <span>{money(i.price)}</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={i.stock}
                    value={i.quantity}
                    onChange={(e) => updateQty(i.productId, Number(e.target.value))}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="total">Total <strong>{money(total)}</strong></div>

          <h3>Client</h3>
          <label>Nom
            <input value={customer.fullName} onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })} />
          </label>
          <label>Email
            <input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          </label>
          <label>Téléphone
            <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          </label>
          <button type="button" className="checkout" disabled={busy || cart.length === 0} onClick={checkout}>
            {busy ? 'Envoi…' : 'Commander'}
          </button>

          <h3>Dernières commandes</h3>
          <ul className="orders">
            {orders.slice(0, 6).map((o) => (
              <li key={o.id}>
                #{o.id} · {o.customerName} · {money(o.total)}
                <em>{o.status}</em>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
