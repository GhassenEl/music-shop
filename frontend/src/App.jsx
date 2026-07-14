import { useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:5100/api/v1';

function money(n) {
  return new Intl.NumberFormat('fr-TN', {
    style: 'currency',
    currency: 'TND',
    minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

function DocPanel({ doc, onPay, paymentMethod, setPaymentMethod, busy }) {
  if (!doc) return null;
  const isReceipt = doc.type === 'receipt';
  const isInvoice = doc.type === 'invoice';

  return (
    <section className={`doc ${isReceipt ? 'receipt' : 'invoice'}`}>
      <div className="doc-head">
        <div>
          <p className="eyebrow">{isReceipt ? 'Reçu' : 'Facture'}</p>
          <h2>{doc.title}</h2>
          <p>
            {isReceipt ? doc.receiptNumber : doc.invoiceNumber} · Commande #{doc.id}
          </p>
        </div>
        <span className={`badge ${doc.status}`}>{doc.status}</span>
      </div>

      <div className="doc-grid">
        <div>
          <h4>Client</h4>
          <p>{doc.customer?.name}</p>
          <p>{doc.customer?.email}</p>
          <p>{doc.customer?.phone || '—'}</p>
        </div>
        <div>
          <h4>Promo saisonnière</h4>
          {doc.promotion ? (
            <p>
              {doc.promotion.name} ({doc.promotion.code}) · {doc.discountPercent}%
            </p>
          ) : (
            <p>Aucune remise active</p>
          )}
          {isReceipt && (
            <p>
              Payé le {doc.paidAt ? new Date(doc.paidAt).toLocaleString('fr-FR') : '—'} via{' '}
              {doc.paymentMethod}
            </p>
          )}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th>Qté</th>
            <th>P.U.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.items?.map((it) => (
            <tr key={it.id || `${it.productId}-${it.name}`}>
              <td>
                <div className="line">
                  {it.imageUrl && <img src={it.imageUrl} alt="" />}
                  <span>
                    {it.brand} {it.name}
                  </span>
                </div>
              </td>
              <td>{it.quantity}</td>
              <td>{money(it.unitPrice)}</td>
              <td>{money(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div><span>Sous-total</span><strong>{money(doc.subtotal)}</strong></div>
        <div><span>Remise ({doc.discountPercent || 0}%)</span><strong>-{money(doc.discountAmount)}</strong></div>
        <div><span>TVA (19%)</span><strong>{money(doc.taxAmount)}</strong></div>
        <div className="grand"><span>Total TTC</span><strong>{money(doc.total)}</strong></div>
      </div>

      {isInvoice && doc.payable && (
        <div className="pay-box">
          <label>
            Moyen de paiement
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="carte">Carte bancaire</option>
              <option value="espece">Espèces</option>
              <option value="virement">Virement</option>
              <option value="paypal">PayPal</option>
            </select>
          </label>
          <button type="button" className="pay" disabled={busy} onClick={onPay}>
            {busy ? 'Paiement…' : `Payer ${money(doc.total)}`}
          </button>
        </div>
      )}

      {isReceipt && <p className="thanks">{doc.message || 'Merci pour votre achat.'}</p>}
    </section>
  );
}

export default function App() {
  const [apiOk, setApiOk] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [promo, setPromo] = useState(null);
  const [stats, setStats] = useState(null);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ fullName: '', email: '', phone: '' });
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('carte');

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.originalPrice * i.quantity, 0),
    [cart]
  );
  const discountPercent = promo?.discountPercent || 0;
  const discountAmount = useMemo(
    () => Math.round(subtotal * (discountPercent / 100) * 100) / 100,
    [subtotal, discountPercent]
  );
  const totalPreview = useMemo(() => {
    const taxable = subtotal - discountAmount;
    const tax = Math.round(taxable * 0.19 * 100) / 100;
    return Math.round((taxable + tax) * 100) / 100;
  }, [subtotal, discountAmount]);

  async function load(opts = {}) {
    try {
      const health = await fetch(`${API}/health`).then((r) => r.json());
      setApiOk(!!health.ok);

      const [cat, prod, st, od, pr] = await Promise.all([
        fetch(`${API}/categories`).then((r) => r.json()),
        fetch(
          `${API}/products?${new URLSearchParams({
            ...(opts.category ?? category ? { category: opts.category ?? category } : {}),
            ...((opts.q ?? q).trim() ? { q: (opts.q ?? q).trim() } : {}),
          })}`
        ).then((r) => r.json()),
        fetch(`${API}/stats`).then((r) => r.json()),
        fetch(`${API}/orders`).then((r) => r.json()),
        fetch(`${API}/promotions/active`).then((r) => r.json()),
      ]);

      setCategories(cat.items || []);
      setProducts(prod.items || []);
      setPromo(pr.active || prod.activePromotion || null);
      setStats(st);
      setOrders(od.items || []);
      setError('');
    } catch {
      setApiOk(false);
      setError('API indisponible — MySQL + backend :5100');
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
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          brand: p.brand,
          imageUrl: p.imageUrl,
          originalPrice: p.originalPrice ?? p.price,
          price: p.price,
          stock: p.stock,
          quantity: 1,
        },
      ];
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
    setReceipt(null);
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
      setInvoice(data.invoice);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function payInvoice() {
    if (!invoice?.id) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/orders/${invoice.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Paiement échoué');
      setInvoice(null);
      setReceipt(data.receipt);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(orderId, kind) {
    try {
      const res = await fetch(`${API}/orders/${orderId}/${kind}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Document indisponible');
      if (kind === 'invoice') {
        setReceipt(null);
        setInvoice(data);
      } else {
        setInvoice(null);
        setReceipt(data);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Boutique virtuelle</p>
          <h1>MusicShop</h1>
          <p className="lead">
            Instruments avec photos réelles — commande, facture, paiement et reçu avec remises saisonnières.
          </p>
        </div>
        <div className="hero-status">
          <span className={`dot ${apiOk ? 'on' : 'off'}`} />
          {apiOk ? 'API + MySQL OK' : 'Hors ligne'}
        </div>
      </header>

      {promo && (
        <div className="promo-banner">
          <strong>{promo.name}</strong>
          <span>
            −{promo.discountPercent}% ({promo.code}) · {promo.season} · jusqu’au{' '}
            {new Date(promo.endsOn).toLocaleDateString('fr-FR')}
          </span>
        </div>
      )}

      {error && <div className="banner">{error}</div>}

      <section className="kpis">
        <article><strong>{stats?.products ?? '—'}</strong><span>Produits</span></article>
        <article><strong>{stats?.categories ?? '—'}</strong><span>Catégories</span></article>
        <article><strong>{stats?.stock ?? '—'}</strong><span>Stock</span></article>
        <article className="accent"><strong>{stats ? money(stats.revenue) : '—'}</strong><span>CA payé</span></article>
      </section>

      <div className="toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" />
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
              <div className="photo">
                <img src={p.imageUrl} alt={p.name} loading="lazy" />
                {p.discountPercent > 0 && <span className="sale">−{p.discountPercent}%</span>}
              </div>
              <div className="meta">
                <span className="brand">{p.brand}</span>
                {p.featured ? <span className="tag">Coup de cœur</span> : null}
              </div>
              <h3>{p.name}</h3>
              <p className="desc">{p.description}</p>
              <div className="foot">
                <div className="price">
                  <strong>{money(p.price)}</strong>
                  {p.discountPercent > 0 && <s>{money(p.originalPrice)}</s>}
                </div>
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
                  <img src={i.imageUrl} alt="" />
                  <div>
                    <strong>{i.name}</strong>
                    <span>{money(i.originalPrice)}</span>
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

          <div className="totals mini">
            <div><span>Sous-total</span><strong>{money(subtotal)}</strong></div>
            <div><span>Remise saison</span><strong>-{money(discountAmount)}</strong></div>
            <div className="grand"><span>Estim. TTC</span><strong>{money(totalPreview)}</strong></div>
          </div>

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
            {busy ? 'Création…' : 'Passer commande → Facture'}
          </button>

          <h3>Commandes</h3>
          <ul className="orders">
            {orders.slice(0, 8).map((o) => (
              <li key={o.id}>
                <button type="button" className="linkish" onClick={() => openDoc(o.id, o.status === 'paid' ? 'receipt' : 'invoice')}>
                  #{o.id} · {o.customerName} · {money(o.total)}
                </button>
                <em>{o.status}</em>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <DocPanel
        doc={invoice}
        onPay={payInvoice}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        busy={busy}
      />
      <DocPanel doc={receipt} />
    </div>
  );
}
